
CREATE TABLE public.ex_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''::text,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ex_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read ex_services" ON public.ex_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write ex_services" ON public.ex_services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update ex_services" ON public.ex_services FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete ex_services" ON public.ex_services FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_ex_services_updated_at
BEFORE UPDATE ON public.ex_services
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.ex_services (name, description) VALUES
  ('Sepoy', 'Indian Army - Other Rank'),
  ('Lance Naik', 'Indian Army - Other Rank'),
  ('Naik', 'Indian Army - Other Rank'),
  ('Havildar', 'Indian Army - Junior Commissioned / NCO'),
  ('Naib Subedar', 'Indian Army - Junior Commissioned Officer'),
  ('Subedar', 'Indian Army - Junior Commissioned Officer'),
  ('Subedar Major', 'Indian Army - Junior Commissioned Officer'),
  ('Lieutenant', 'Indian Army - Commissioned Officer'),
  ('Captain', 'Indian Army - Commissioned Officer'),
  ('Major', 'Indian Army - Commissioned Officer'),
  ('Lt Colonel', 'Indian Army - Commissioned Officer'),
  ('Colonel', 'Indian Army - Commissioned Officer'),
  ('Seaman', 'Indian Navy - Sailor'),
  ('Leading Seaman', 'Indian Navy - Sailor'),
  ('Petty Officer', 'Indian Navy - Sailor NCO'),
  ('Chief Petty Officer', 'Indian Navy - Senior Sailor'),
  ('Master Chief Petty Officer', 'Indian Navy - Senior Sailor'),
  ('Aircraftsman', 'Indian Air Force - Airman'),
  ('Leading Aircraftsman', 'Indian Air Force - Airman'),
  ('Corporal', 'Indian Air Force - NCO'),
  ('Sergeant', 'Indian Air Force - NCO'),
  ('Junior Warrant Officer', 'Indian Air Force - Warrant Officer'),
  ('Warrant Officer', 'Indian Air Force - Warrant Officer'),
  ('Master Warrant Officer', 'Indian Air Force - Warrant Officer'),
  ('Constable (CAPF)', 'Central Armed Police Forces - Other Rank'),
  ('Head Constable (CAPF)', 'Central Armed Police Forces - NCO'),
  ('Assistant Sub-Inspector (CAPF)', 'Central Armed Police Forces - JCO equivalent'),
  ('Sub-Inspector (CAPF)', 'Central Armed Police Forces - Officer');
