ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE INDEX IF NOT EXISTS candidates_created_by_idx ON public.candidates(created_by);