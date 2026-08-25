CREATE OR REPLACE FUNCTION public.list_active_field_officers()
RETURNS TABLE(id uuid, full_name text, employee_code text, mobile text, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.full_name, c.employee_code, c.mobile, c.status
  FROM public.candidates c
  WHERE c.role_key = 'field_officer'
    AND c.status IN ('approved','active')
  ORDER BY c.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.list_active_field_officers() TO authenticated, service_role;