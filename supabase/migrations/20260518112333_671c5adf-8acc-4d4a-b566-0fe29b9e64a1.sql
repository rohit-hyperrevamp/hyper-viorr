CREATE TABLE public.offboarding_reasons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT ''::text,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.offboarding_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read offboarding_reasons"
  ON public.offboarding_reasons FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write offboarding_reasons"
  ON public.offboarding_reasons FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update offboarding_reasons"
  ON public.offboarding_reasons FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete offboarding_reasons"
  ON public.offboarding_reasons FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_offboarding_reasons_updated_at
  BEFORE UPDATE ON public.offboarding_reasons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.offboarding_reasons (name, description, sort_order) VALUES
  ('Resignation', 'Employee voluntarily resigns from service', 10),
  ('Termination', 'Employer-initiated end of service', 20),
  ('Absconding', 'Employee absent without notice or contact', 30),
  ('Death', 'Service ended due to death of the employee', 40);
