
-- Candidate extensions
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS is_ex_service BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ex_service_id UUID,
  ADD COLUMN IF NOT EXISTS languages JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS experiences JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS educations JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Languages master
CREATE TABLE IF NOT EXISTS public.languages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read languages" ON public.languages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write languages" ON public.languages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update languages" ON public.languages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete languages" ON public.languages FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_languages_updated_at
BEFORE UPDATE ON public.languages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.languages (name) VALUES
  ('Hindi'),('English'),('Marathi'),('Bengali'),('Telugu'),
  ('Tamil'),('Gujarati'),('Urdu'),('Kannada'),('Odia'),
  ('Malayalam'),('Punjabi'),('Assamese'),('Maithili'),('Sanskrit'),
  ('Konkani'),('Sindhi'),('Nepali'),('Kashmiri'),('Dogri'),
  ('Manipuri'),('Bodo'),('Santhali'),('Bhojpuri'),('Haryanvi'),
  ('Rajasthani'),('Tulu'),('Khasi'),('Mizo'),('Garhwali')
ON CONFLICT (name) DO NOTHING;
