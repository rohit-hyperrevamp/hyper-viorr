CREATE OR REPLACE FUNCTION public.nextval(sequence_name text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v bigint;
BEGIN
  IF sequence_name !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'invalid sequence name';
  END IF;

  EXECUTE format('SELECT pg_catalog.nextval(%L::regclass)', 'public.' || sequence_name) INTO v;
  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.nextval(text) TO authenticated, service_role;