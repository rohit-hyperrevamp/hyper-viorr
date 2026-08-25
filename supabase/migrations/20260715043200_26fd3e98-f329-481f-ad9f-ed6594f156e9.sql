CREATE OR REPLACE FUNCTION public.candidate_branch_ids(_candidate_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT esa.scope_id::uuid
  FROM public.employee_scope_assignments esa
  WHERE esa.candidate_id = _candidate_id
    AND esa.scope_type = 'branch'
    AND esa.scope_id ~* '^[0-9a-f-]{36}$'
  UNION
  SELECT u.branch_id
  FROM public.employee_scope_assignments esa
  JOIN public.units u ON u.id = esa.scope_id::uuid
  WHERE esa.candidate_id = _candidate_id
    AND esa.scope_type = 'unit'
    AND esa.scope_id ~* '^[0-9a-f-]{36}$'
    AND u.branch_id IS NOT NULL
  UNION
  SELECT u.branch_id
  FROM public.candidates c
  JOIN public.units u ON u.id = c.unit_id
  WHERE c.id = _candidate_id
    AND u.branch_id IS NOT NULL
  UNION
  SELECT u.branch_id
  FROM public.candidate_units cu
  JOIN public.units u ON u.id = cu.unit_id
  WHERE cu.candidate_id = _candidate_id
    AND u.branch_id IS NOT NULL;
$$;