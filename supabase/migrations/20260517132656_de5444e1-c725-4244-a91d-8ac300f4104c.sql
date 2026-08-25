
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reports_to uuid;

CREATE INDEX IF NOT EXISTS idx_candidates_reports_to ON public.candidates(reports_to);
CREATE INDEX IF NOT EXISTS idx_candidates_role_key ON public.candidates(role_key);

CREATE TABLE IF NOT EXISTS public.employee_scope_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id uuid NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('state','customer','branch','unit')),
  scope_id text NOT NULL,
  scope_label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_esa_candidate ON public.employee_scope_assignments(candidate_id);
CREATE INDEX IF NOT EXISTS idx_esa_scope ON public.employee_scope_assignments(scope_type, scope_id);

ALTER TABLE public.employee_scope_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read employee_scope_assignments"
  ON public.employee_scope_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write employee_scope_assignments"
  ON public.employee_scope_assignments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update employee_scope_assignments"
  ON public.employee_scope_assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete employee_scope_assignments"
  ON public.employee_scope_assignments FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_esa_updated_at
  BEFORE UPDATE ON public.employee_scope_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
