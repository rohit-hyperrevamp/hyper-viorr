
INSERT INTO public.deduction_types (name, code)
SELECT v.name, v.code FROM (VALUES
  ('Employee EPF','epf_employee'),
  ('Employee ESIC','esi_employee'),
  ('Professional Tax','professional_tax'),
  ('Employee LWF','lwf_employee')
) AS v(name, code)
WHERE NOT EXISTS (SELECT 1 FROM public.deduction_types d WHERE d.code = v.code);

ALTER TABLE public.additions
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.employer_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  unit_id uuid,
  payroll_run_id uuid REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
  contribution_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'monthly',
  period_start date,
  period_end date,
  contribution_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'processed',
  notes text NOT NULL DEFAULT '',
  source_kind text NOT NULL DEFAULT 'payroll_run',
  source_ref text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employer_contributions TO authenticated;
GRANT ALL ON public.employer_contributions TO service_role;
ALTER TABLE public.employer_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read employer contributions" ON public.employer_contributions FOR SELECT TO authenticated USING (is_admin_user());
CREATE POLICY "Admins insert employer contributions" ON public.employer_contributions FOR INSERT TO authenticated WITH CHECK (is_admin_user());
CREATE POLICY "Admins update employer contributions" ON public.employer_contributions FOR UPDATE TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());
CREATE POLICY "Admins delete employer contributions" ON public.employer_contributions FOR DELETE TO authenticated USING (is_admin_user());

CREATE INDEX IF NOT EXISTS employer_contributions_run_idx ON public.employer_contributions (payroll_run_id);
CREATE INDEX IF NOT EXISTS employer_contributions_candidate_idx ON public.employer_contributions (candidate_id);

CREATE TRIGGER employer_contributions_set_updated_at
BEFORE UPDATE ON public.employer_contributions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.payroll_processing_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL,
  unit_id uuid,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'on_hold',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, candidate_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_processing_holds TO authenticated;
GRANT ALL ON public.payroll_processing_holds TO service_role;
ALTER TABLE public.payroll_processing_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read payroll holds" ON public.payroll_processing_holds FOR SELECT TO authenticated USING (is_admin_user());
CREATE POLICY "Admins insert payroll holds" ON public.payroll_processing_holds FOR INSERT TO authenticated WITH CHECK (is_admin_user());
CREATE POLICY "Admins update payroll holds" ON public.payroll_processing_holds FOR UPDATE TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());
CREATE POLICY "Admins delete payroll holds" ON public.payroll_processing_holds FOR DELETE TO authenticated USING (is_admin_user());

CREATE TRIGGER payroll_processing_holds_set_updated_at
BEFORE UPDATE ON public.payroll_processing_holds
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
