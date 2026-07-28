CREATE OR REPLACE FUNCTION public.set_candidate_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.candidate_code IS NULL OR NEW.candidate_code = '' THEN
    NEW.candidate_code := 'CAN-' || lpad(nextval('public.candidate_code_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$function$;