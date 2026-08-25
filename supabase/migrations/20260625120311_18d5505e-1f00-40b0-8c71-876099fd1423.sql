
-- Inventory Cap table + helpers
CREATE TABLE public.inv_caps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL CHECK (scope_type IN ('branch','field_officer')),
  scope_id uuid,
  min_value numeric NOT NULL DEFAULT 0,
  max_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX inv_caps_scope_unique
  ON public.inv_caps (scope_type, COALESCE(scope_id::text, '__default__'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inv_caps TO authenticated;
GRANT ALL ON public.inv_caps TO service_role;

ALTER TABLE public.inv_caps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read inv_caps"
  ON public.inv_caps FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage inv_caps"
  ON public.inv_caps FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.current_user_is_inventory_manager())
  WITH CHECK (public.is_admin_user() OR public.current_user_is_inventory_manager());

CREATE TRIGGER set_inv_caps_updated_at
  BEFORE UPDATE ON public.inv_caps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.inv_caps (scope_type, scope_id, min_value, max_value)
VALUES
  ('branch', NULL, 10000, 12500),
  ('field_officer', NULL, 2500, 5000);

-- Resolve auth.users id from candidate id
CREATE OR REPLACE FUNCTION public.get_user_id_by_candidate(_candidate_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id
  FROM auth.users u
  JOIN public.candidates c
    ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
  WHERE c.id = _candidate_id
  LIMIT 1;
$$;

-- All user ids assigned (via scope) to a branch and acting as branch admin/manager
CREATE OR REPLACE FUNCTION public.get_user_ids_by_branch(_branch_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT u.id
  FROM auth.users u
  JOIN public.candidates c
    ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
  JOIN public.employee_scope_assignments esa
    ON esa.candidate_id = c.id
  WHERE esa.scope_type = 'branch'
    AND esa.scope_id::text = _branch_id::text
    AND c.status = 'active'
    AND c.role_key IN ('branch_admin','branch_manager','admin','super_admin');
$$;

-- Super admins + inventory managers
CREATE OR REPLACE FUNCTION public.get_inventory_admin_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT u.id FROM auth.users u
  WHERE u.email IN (
    'phone-8373914073@radiantguard.local',
    'phone-8373149073@radiantguard.local',
    'phone-8373914072@radiantguard.local'
  )
  UNION
  SELECT DISTINCT u.id FROM auth.users u
  JOIN public.candidates c
    ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
  WHERE c.status = 'active'
    AND c.role_key IN ('admin','super_admin','inventory_manager','inventory');
$$;
