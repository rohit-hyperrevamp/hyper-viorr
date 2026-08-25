DROP POLICY IF EXISTS "Branch scoped users can read same branch assignments" ON public.employee_scope_assignments;

CREATE OR REPLACE FUNCTION public.current_user_branch_scope_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT esa.scope_id
  FROM public.employee_scope_assignments esa
  JOIN public.candidates c ON c.id = esa.candidate_id
  WHERE esa.scope_type = 'branch'
    AND c.mobile = public.current_user_mobile()
$$;

CREATE POLICY "Branch scoped users can read same branch assignments"
ON public.employee_scope_assignments
FOR SELECT
TO authenticated
USING (
  scope_type = 'branch'
  AND scope_id IN (SELECT public.current_user_branch_scope_ids())
);