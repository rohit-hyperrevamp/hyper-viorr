
CREATE TABLE public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  submitted_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, period_start, period_end)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs TO authenticated;
GRANT ALL ON public.payroll_runs TO service_role;

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_runs select" ON public.payroll_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "payroll_runs insert" ON public.payroll_runs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "payroll_runs update" ON public.payroll_runs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "payroll_runs delete" ON public.payroll_runs FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_payroll_runs_updated_at
  BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

UPDATE public.role_permissions
   SET can_approve = true
 WHERE role_key = 'leadership' AND module_key = 'payroll';
