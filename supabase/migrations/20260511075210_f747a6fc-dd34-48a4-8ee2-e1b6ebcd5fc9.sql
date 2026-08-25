CREATE TABLE public.labour_welfare_funds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  state TEXT NOT NULL,
  deduction_months SMALLINT[] NOT NULL DEFAULT '{}',
  frequency TEXT NOT NULL DEFAULT 'yearly',
  employee_contribution NUMERIC NOT NULL DEFAULT 0,
  employer_contribution NUMERIC NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.labour_welfare_funds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read lwf" ON public.labour_welfare_funds FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write lwf" ON public.labour_welfare_funds FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update lwf" ON public.labour_welfare_funds FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete lwf" ON public.labour_welfare_funds FOR DELETE TO authenticated USING (true);

CREATE TRIGGER lwf_set_updated_at
  BEFORE UPDATE ON public.labour_welfare_funds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.labour_welfare_funds (state, deduction_months, frequency, employee_contribution, employer_contribution) VALUES
  ('Karnataka', ARRAY[12]::smallint[], 'yearly', 50, 100),
  ('Maharashtra', ARRAY[6,12]::smallint[], 'half-yearly', 25, 75),
  ('Goa', ARRAY[1]::smallint[], 'yearly', 10, 30),
  ('Madhya Pradesh', ARRAY[6]::smallint[], 'yearly', 10, 30),
  ('Gujarat', ARRAY[6]::smallint[], 'yearly', 6, 12),
  ('Telangana', ARRAY[12]::smallint[], 'yearly', 2, 5),
  ('Rajasthan', ARRAY[1]::smallint[], 'yearly', 0, 0),
  ('Uttar Pradesh', ARRAY[1]::smallint[], 'yearly', 0, 0),
  ('Dadra and Nagar Haveli and Daman and Diu', ARRAY[1]::smallint[], 'yearly', 0, 0);