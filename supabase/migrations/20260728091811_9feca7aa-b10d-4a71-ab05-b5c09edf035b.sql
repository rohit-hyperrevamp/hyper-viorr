
-- Realign sequence past the highest numeric suffix on any existing candidate_code
-- (covers both CAN-### and legacy EC-### prefixes).
SELECT setval(
  'public.candidate_code_seq',
  GREATEST(
    (SELECT COALESCE(MAX((regexp_replace(candidate_code, '\D', '', 'g'))::int), 0)
       FROM public.candidates
      WHERE candidate_code ~ '\d'),
    (SELECT last_value FROM public.candidate_code_seq)
  ) + 1,
  false
);

-- Harden the trigger: loop until we find an unused CAN-### code.
CREATE OR REPLACE FUNCTION public.set_candidate_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  next_code text;
  attempts int := 0;
BEGIN
  IF NEW.candidate_code IS NULL OR NEW.candidate_code = '' THEN
    LOOP
      next_code := 'CAN-' || lpad(nextval('public.candidate_code_seq')::text, 3, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.candidates WHERE candidate_code = next_code);
      attempts := attempts + 1;
      IF attempts > 100 THEN
        RAISE EXCEPTION 'Could not allocate a unique candidate_code after 100 attempts';
      END IF;
    END LOOP;
    NEW.candidate_code := next_code;
  END IF;
  RETURN NEW;
END;
$$;
