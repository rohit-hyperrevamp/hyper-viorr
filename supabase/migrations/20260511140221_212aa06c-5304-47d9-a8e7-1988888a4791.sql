CREATE TABLE public.service_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''::text,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read service_types" ON public.service_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write service_types" ON public.service_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update service_types" ON public.service_types FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete service_types" ON public.service_types FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_service_types_updated_at
BEFORE UPDATE ON public.service_types
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.service_types (name, description) VALUES
  ('Security', 'Security services'),
  ('Manpower', 'Manpower services'),
  ('Facility', 'Facility management services'),
  ('Staff', 'Staffing services');