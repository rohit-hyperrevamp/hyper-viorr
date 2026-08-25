CREATE POLICY "Employees can read their own scope assignments"
ON public.employee_scope_assignments
FOR SELECT
TO authenticated
USING (
  candidate_id IN (
    SELECT c.id
    FROM public.candidates c
    WHERE c.mobile = public.current_user_mobile()
  )
);