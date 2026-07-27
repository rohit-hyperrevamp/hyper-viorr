
-- 1. Table
CREATE TABLE public.candidate_reporting_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  manager_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  is_primary boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual', -- 'manual' | 'auto_unit'
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, manager_id)
);

CREATE INDEX idx_crm_candidate ON public.candidate_reporting_managers(candidate_id);
CREATE INDEX idx_crm_manager ON public.candidate_reporting_managers(manager_id);

-- 2. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_reporting_managers TO authenticated;
GRANT ALL ON public.candidate_reporting_managers TO service_role;

-- 3. RLS
ALTER TABLE public.candidate_reporting_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_select_all_authenticated"
  ON public.candidate_reporting_managers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "crm_admin_hr_write"
  ON public.candidate_reporting_managers
  FOR ALL TO authenticated
  USING (
    public.is_admin_user()
    OR public.current_user_role_key() IN ('hr','leadership','admin','super_admin')
  )
  WITH CHECK (
    public.is_admin_user()
    OR public.current_user_role_key() IN ('hr','leadership','admin','super_admin')
  );

-- 4. Keep candidates.reports_to in sync with primary manager
CREATE OR REPLACE FUNCTION public.sync_candidate_primary_manager()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_candidate uuid;
  primary_mgr uuid;
BEGIN
  target_candidate := COALESCE(NEW.candidate_id, OLD.candidate_id);

  SELECT manager_id INTO primary_mgr
  FROM public.candidate_reporting_managers
  WHERE candidate_id = target_candidate
  ORDER BY is_primary DESC, created_at ASC
  LIMIT 1;

  UPDATE public.candidates
     SET reports_to = primary_mgr
   WHERE id = target_candidate;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_crm_sync_primary
AFTER INSERT OR UPDATE OR DELETE ON public.candidate_reporting_managers
FOR EACH ROW EXECUTE FUNCTION public.sync_candidate_primary_manager();

-- 5. Auto-sync reporting managers when guards' unit mappings change
CREATE OR REPLACE FUNCTION public.sync_guard_managers_from_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cand_role text;
  fo_row RECORD;
  affected_candidate uuid;
  affected_unit uuid;
BEGIN
  affected_candidate := COALESCE(NEW.candidate_id, OLD.candidate_id);
  affected_unit := COALESCE(NEW.unit_id, OLD.unit_id);

  SELECT role_key INTO cand_role FROM public.candidates WHERE id = affected_candidate;

  IF cand_role NOT IN ('guard','security_guard') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') THEN
    FOR fo_row IN
      SELECT DISTINCT c.id AS fo_id
      FROM public.candidate_units cu
      JOIN public.candidates c ON c.id = cu.candidate_id
      WHERE cu.unit_id = NEW.unit_id
        AND c.role_key = 'field_officer'
        AND c.status IN ('active','approved')
    LOOP
      INSERT INTO public.candidate_reporting_managers (candidate_id, manager_id, unit_id, source)
      VALUES (affected_candidate, fo_row.fo_id, NEW.unit_id, 'auto_unit')
      ON CONFLICT (candidate_id, manager_id) DO NOTHING;
    END LOOP;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Remove auto-added managers that are only linked via this now-removed unit
    DELETE FROM public.candidate_reporting_managers crm
    WHERE crm.candidate_id = affected_candidate
      AND crm.source = 'auto_unit'
      AND crm.unit_id = OLD.unit_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.candidate_units cu2
        JOIN public.candidates c2 ON c2.id = cu2.candidate_id
        WHERE cu2.unit_id <> OLD.unit_id
          AND cu2.candidate_id = crm.manager_id
          AND EXISTS (
            SELECT 1 FROM public.candidate_units mycu
            WHERE mycu.candidate_id = affected_candidate
              AND mycu.unit_id = cu2.unit_id
          )
      );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_candidate_units_sync_managers
AFTER INSERT OR DELETE ON public.candidate_units
FOR EACH ROW EXECUTE FUNCTION public.sync_guard_managers_from_unit();

-- Also react when a Field Officer gets added/removed from a unit: sync all guards on that unit.
CREATE OR REPLACE FUNCTION public.sync_unit_guards_when_fo_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role text;
  affected_unit uuid;
  guard_row RECORD;
BEGIN
  affected_unit := COALESCE(NEW.unit_id, OLD.unit_id);
  SELECT role_key INTO actor_role FROM public.candidates
    WHERE id = COALESCE(NEW.candidate_id, OLD.candidate_id);

  IF actor_role <> 'field_officer' THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN
    FOR guard_row IN
      SELECT DISTINCT c.id AS g_id
      FROM public.candidate_units cu
      JOIN public.candidates c ON c.id = cu.candidate_id
      WHERE cu.unit_id = affected_unit
        AND c.role_key IN ('guard','security_guard')
        AND c.status IN ('active','approved')
    LOOP
      INSERT INTO public.candidate_reporting_managers (candidate_id, manager_id, unit_id, source)
      VALUES (guard_row.g_id, NEW.candidate_id, affected_unit, 'auto_unit')
      ON CONFLICT (candidate_id, manager_id) DO NOTHING;
    END LOOP;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.candidate_reporting_managers crm
    USING public.candidates g
    WHERE crm.candidate_id = g.id
      AND g.role_key IN ('guard','security_guard')
      AND crm.manager_id = OLD.candidate_id
      AND crm.source = 'auto_unit'
      AND crm.unit_id = OLD.unit_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_candidate_units_fo_sync_guards
AFTER INSERT OR DELETE ON public.candidate_units
FOR EACH ROW EXECUTE FUNCTION public.sync_unit_guards_when_fo_changes();

-- 6. Backfill from existing data
INSERT INTO public.candidate_reporting_managers (candidate_id, manager_id, unit_id, source, is_primary)
SELECT DISTINCT g.id, fo.id, gu.unit_id, 'auto_unit', false
FROM public.candidates g
JOIN public.candidate_units gu ON gu.candidate_id = g.id
JOIN public.candidate_units fu ON fu.unit_id = gu.unit_id
JOIN public.candidates fo ON fo.id = fu.candidate_id AND fo.role_key = 'field_officer'
WHERE g.role_key IN ('guard','security_guard')
  AND g.status IN ('active','approved')
  AND fo.status IN ('active','approved')
ON CONFLICT (candidate_id, manager_id) DO NOTHING;

-- Also seed based on guards whose unit_id column matches an FO's candidate_units
INSERT INTO public.candidate_reporting_managers (candidate_id, manager_id, unit_id, source, is_primary)
SELECT DISTINCT g.id, fo.id, g.unit_id, 'auto_unit', false
FROM public.candidates g
JOIN public.candidate_units fu ON fu.unit_id = g.unit_id
JOIN public.candidates fo ON fo.id = fu.candidate_id AND fo.role_key = 'field_officer'
WHERE g.role_key IN ('guard','security_guard')
  AND g.unit_id IS NOT NULL
  AND g.status IN ('active','approved')
  AND fo.status IN ('active','approved')
ON CONFLICT (candidate_id, manager_id) DO NOTHING;

-- Preserve any existing reports_to as a manager entry too
INSERT INTO public.candidate_reporting_managers (candidate_id, manager_id, source, is_primary)
SELECT g.id, g.reports_to, 'manual', true
FROM public.candidates g
WHERE g.role_key IN ('guard','security_guard')
  AND g.reports_to IS NOT NULL
ON CONFLICT (candidate_id, manager_id) DO UPDATE SET is_primary = true;
