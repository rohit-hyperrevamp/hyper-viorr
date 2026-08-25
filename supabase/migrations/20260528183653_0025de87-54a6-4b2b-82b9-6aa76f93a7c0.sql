CREATE OR REPLACE FUNCTION public.nextval(sequence_name text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v bigint;
  clean text;
BEGIN
  -- strip optional public. schema prefix
  clean := regexp_replace(sequence_name, '^public\.', '');
  IF clean !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'invalid sequence name: %', sequence_name;
  END IF;
  EXECUTE format('SELECT pg_catalog.nextval(%L::regclass)', 'public.' || clean) INTO v;
  RETURN v;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.nextval(text) TO authenticated, service_role;