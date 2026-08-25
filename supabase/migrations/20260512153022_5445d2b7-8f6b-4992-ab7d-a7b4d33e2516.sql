
CREATE TABLE public.payroll_day_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  method text NOT NULL CHECK (method IN ('actual_days','fixed_days','actual_minus_weekly_off')),
  fixed_days integer,
  weekly_off_day smallint CHECK (weekly_off_day BETWEEN 0 AND 6),
  description text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fixed_days_required CHECK (
    method <> 'fixed_days' OR (fixed_days IS NOT NULL AND fixed_days BETWEEN 1 AND 31)
  ),
  CONSTRAINT weekly_off_required CHECK (
    method <> 'actual_minus_weekly_off' OR weekly_off_day IS NOT NULL
  )
);

ALTER TABLE public.payroll_day_bases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read payroll_day_bases" ON public.payroll_day_bases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write payroll_day_bases" ON public.payroll_day_bases
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update payroll_day_bases" ON public.payroll_day_bases
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete payroll_day_bases" ON public.payroll_day_bases
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_payroll_day_bases_updated_at
  BEFORE UPDATE ON public.payroll_day_bases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.payroll_day_bases_single_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.payroll_day_bases
       SET is_default = false
     WHERE id <> NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payroll_day_bases_single_default_trg
  AFTER INSERT OR UPDATE OF is_default ON public.payroll_day_bases
  FOR EACH ROW WHEN (NEW.is_default = true)
  EXECUTE FUNCTION public.payroll_day_bases_single_default();

INSERT INTO public.payroll_day_bases (name, code, method, fixed_days, weekly_off_day, description, is_default, sort_order) VALUES
  ('Actual Days in Month', 'ACTUAL_DAYS', 'actual_days', NULL, NULL,
   'Salary is divided by the actual number of calendar days in the payroll month (28, 29, 30, or 31).', true, 1),
  ('Fixed 26 Days', 'FIXED_26', 'fixed_days', 26, NULL,
   'Salary is always divided by 26 working days regardless of the actual length of the month.', false, 2),
  ('Actual Days minus Sundays', 'ACTUAL_MINUS_SUNDAYS', 'actual_minus_weekly_off', NULL, 0,
   'Salary is divided by the actual days of the month after subtracting all Sundays falling in that month.', false, 3);
