CREATE TABLE public.duties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''::text,
  hours NUMERIC NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.duties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read duties" ON public.duties FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write duties" ON public.duties FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update duties" ON public.duties FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete duties" ON public.duties FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_duties_updated_at
BEFORE UPDATE ON public.duties
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.duties (name, description, hours) VALUES
  ('8 hrs', '8 hours duty', 8),
  ('12 hrs', '12 hours duty', 12);