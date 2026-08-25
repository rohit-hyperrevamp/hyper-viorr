ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS preferred_language text;

INSERT INTO public.languages (name, enabled)
SELECT v, true FROM (VALUES ('English'),('Hindi'),('Marathi')) AS x(v)
WHERE NOT EXISTS (SELECT 1 FROM public.languages l WHERE lower(l.name) = lower(x.v));