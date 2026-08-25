ALTER TABLE public.candidates DROP CONSTRAINT IF EXISTS candidates_mobile_unique;

DROP INDEX IF EXISTS public.candidates_mobile_unique;

CREATE UNIQUE INDEX candidates_mobile_unique
ON public.candidates (mobile)
WHERE mobile <> '' AND status <> 'inactive';