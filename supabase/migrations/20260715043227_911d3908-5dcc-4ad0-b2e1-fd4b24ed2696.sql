CREATE OR REPLACE FUNCTION public.current_user_branch_scope_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT esa.scope_id
  FROM public.employee_scope_assignments esa
  JOIN public.candidates c ON c.id = esa.candidate_id
  WHERE esa.scope_type = 'branch'
    AND c.mobile = public.current_user_mobile()
  UNION
  SELECT u.branch_id::text
  FROM public.employee_scope_assignments esa
  JOIN public.candidates c ON c.id = esa.candidate_id
  JOIN public.units u ON u.id = esa.scope_id::uuid
  WHERE esa.scope_type = 'unit'
    AND esa.scope_id ~* '^[0-9a-f-]{36}$'
    AND u.branch_id IS NOT NULL
    AND c.mobile = public.current_user_mobile();
$$;