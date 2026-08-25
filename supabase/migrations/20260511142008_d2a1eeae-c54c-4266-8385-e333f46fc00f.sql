
CREATE TABLE public.billing_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read billing_types" ON public.billing_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write billing_types" ON public.billing_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update billing_types" ON public.billing_types FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete billing_types" ON public.billing_types FOR DELETE TO authenticated USING (true);

CREATE TRIGGER billing_types_set_updated_at
BEFORE UPDATE ON public.billing_types
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.billing_types (name, description) VALUES
('Man Hours', ''),
('Man Days', ''),
('Man Months', ''),
('Special', '');
