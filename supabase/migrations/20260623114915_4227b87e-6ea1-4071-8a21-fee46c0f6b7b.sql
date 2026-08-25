CREATE POLICY "Branch scoped users can read same branch assignments"
ON public.employee_scope_assignments
FOR SELECT
TO authenticated
USING (
  scope_type = 'branch'
  AND EXISTS (
    SELECT 1
    FROM public.employee_scope_assignments own_scope
    JOIN public.candidates own_candidate ON own_candidate.id = own_scope.candidate_id
    WHERE own_scope.scope_type = 'branch'
      AND own_scope.scope_id = employee_scope_assignments.scope_id
      AND own_candidate.mobile = public.current_user_mobile()
  )
);