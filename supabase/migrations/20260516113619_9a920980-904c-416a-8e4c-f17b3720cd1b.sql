-- Sequence + auto-generated candidate code (EC-001, EC-002, ...)
CREATE SEQUENCE IF NOT EXISTS public.candidate_code_seq START 1 INCREMENT 1;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS candidate_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.set_candidate_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.candidate_code IS NULL OR NEW.candidate_code = '' THEN
    NEW.candidate_code := 'EC-' || lpad(nextval('public.candidate_code_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_candidate_code ON public.candidates;
CREATE TRIGGER trg_set_candidate_code
BEFORE INSERT ON public.candidates
FOR EACH ROW
EXECUTE FUNCTION public.set_candidate_code();

-- Backfill existing rows in deterministic order
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.candidates
    WHERE candidate_code IS NULL OR candidate_code = ''
    ORDER BY created_at ASC, id ASC
  LOOP
    UPDATE public.candidates
       SET candidate_code = 'EC-' || lpad(nextval('public.candidate_code_seq')::text, 3, '0')
     WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS candidates_candidate_code_key
  ON public.candidates (candidate_code)
  WHERE candidate_code <> '';