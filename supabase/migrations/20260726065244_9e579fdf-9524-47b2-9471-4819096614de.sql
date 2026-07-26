CREATE POLICY "Onboarding approvers manage branch scope assignments"
ON public.employee_scope_assignments
FOR INSERT
TO authenticated
WITH CHECK (scope_type = 'branch' AND public.current_user_can_approve_onboarding());

CREATE POLICY "Onboarding approvers update branch scope assignments"
ON public.employee_scope_assignments
FOR UPDATE
TO authenticated
USING (scope_type = 'branch' AND public.current_user_can_approve_onboarding())
WITH CHECK (scope_type = 'branch' AND public.current_user_can_approve_onboarding());

CREATE POLICY "Onboarding approvers delete branch scope assignments"
ON public.employee_scope_assignments
FOR DELETE
TO authenticated
USING (scope_type = 'branch' AND public.current_user_can_approve_onboarding());

CREATE POLICY "Onboarding approvers read branch scope assignments"
ON public.employee_scope_assignments
FOR SELECT
TO authenticated
USING (scope_type = 'branch' AND public.current_user_can_approve_onboarding());