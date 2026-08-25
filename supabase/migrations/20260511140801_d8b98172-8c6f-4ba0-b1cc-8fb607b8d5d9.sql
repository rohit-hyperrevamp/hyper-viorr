CREATE TABLE public.payroll_windows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL DEFAULT ''::text,
  window_start_day SMALLINT NOT NULL,
  window_end_day SMALLINT NOT NULL,
  processing_day SMALLINT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read payroll_windows" ON public.payroll_windows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write payroll_windows" ON public.payroll_windows FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update payroll_windows" ON public.payroll_windows FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete payroll_windows" ON public.payroll_windows FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_payroll_windows_updated_at
BEFORE UPDATE ON public.payroll_windows
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.payroll_windows (label, window_start_day, window_end_day, processing_day) VALUES
  ('21 to 20', 21, 20, 27),
  ('26 to 25', 26, 25, 1),
  ('1 to 30/31', 1, 31, 7);