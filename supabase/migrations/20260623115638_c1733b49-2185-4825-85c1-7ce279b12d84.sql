CREATE OR REPLACE FUNCTION public.is_candidate_in_current_user_branch(_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employee_scope_assignments esa
    WHERE esa.candidate_id = _candidate_id
      AND esa.scope_type = 'branch'
      AND esa.scope_id IN (SELECT public.current_user_branch_scope_ids())
  )
$$;

CREATE POLICY "Branch scoped users can read same branch candidates"
ON public.candidates
FOR SELECT
TO authenticated
USING (public.is_candidate_in_current_user_branch(id));