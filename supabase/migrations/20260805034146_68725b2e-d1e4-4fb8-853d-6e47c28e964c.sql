ALTER TABLE public.attendance_sheets
  ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS amendment_status text NOT NULL DEFAULT 'none';

CREATE TABLE IF NOT EXISTS public.attendance_sheet_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'locked',
  reason text NOT NULL DEFAULT '',
  snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, period_start, period_end, version)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_sheet_versions TO authenticated;
GRANT ALL ON public.attendance_sheet_versions TO service_role;
ALTER TABLE public.attendance_sheet_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scoped read attendance_sheet_versions"
  ON public.attendance_sheet_versions FOR SELECT TO authenticated
  USING (public.is_admin_user() OR NOT public.current_user_has_branch_scope() OR public.is_unit_in_current_user_branch(unit_id));
CREATE POLICY "Authenticated write attendance_sheet_versions"
  ON public.attendance_sheet_versions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update attendance_sheet_versions"
  ON public.attendance_sheet_versions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins delete attendance_sheet_versions"
  ON public.attendance_sheet_versions FOR DELETE TO authenticated USING (public.is_admin_user());

CREATE TRIGGER set_attendance_sheet_versions_updated_at
  BEFORE UPDATE ON public.attendance_sheet_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.payroll_run_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  unit_id uuid,
  candidate_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  employee_code text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  paid_days numeric NOT NULL DEFAULT 0,
  ed_days numeric NOT NULL DEFAULT 0,
  gross numeric NOT NULL DEFAULT 0,
  total_deductions numeric NOT NULL DEFAULT 0,
  total_employer numeric NOT NULL DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  earnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  deductions jsonb NOT NULL DEFAULT '[]'::jsonb,
  employer_contributions jsonb NOT NULL DEFAULT '[]'::jsonb,
  additions jsonb NOT NULL DEFAULT '[]'::jsonb,
  on_hold boolean NOT NULL DEFAULT false,
  posted_at timestamptz NOT NULL DEFAULT now(),
  posted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, candidate_id, version)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_run_snapshots TO authenticated;
GRANT ALL ON public.payroll_run_snapshots TO service_role;
ALTER TABLE public.payroll_run_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scoped read payroll_run_snapshots"
  ON public.payroll_run_snapshots FOR SELECT TO authenticated
  USING (public.is_admin_user() OR NOT public.current_user_has_branch_scope() OR public.is_unit_in_current_user_branch(unit_id));
CREATE POLICY "Authenticated write payroll_run_snapshots"
  ON public.payroll_run_snapshots FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update payroll_run_snapshots"
  ON public.payroll_run_snapshots FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete payroll_run_snapshots"
  ON public.payroll_run_snapshots FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_payroll_run_snapshots_updated_at
  BEFORE UPDATE ON public.payroll_run_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payroll_run_snapshots_run ON public.payroll_run_snapshots(payroll_run_id, version);
CREATE INDEX IF NOT EXISTS idx_attendance_sheet_versions_unit_period ON public.attendance_sheet_versions(unit_id, period_start, period_end);