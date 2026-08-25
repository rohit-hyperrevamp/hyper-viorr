DROP POLICY IF EXISTS "Organization managers read unit scope assignments" ON public.employee_scope_assignments;
CREATE POLICY "Organization managers read unit scope assignments"
ON public.employee_scope_assignments
FOR SELECT
TO authenticated
USING (
  scope_type = 'unit'
  AND public.current_user_can_manage_unit_scope_assignments()
);