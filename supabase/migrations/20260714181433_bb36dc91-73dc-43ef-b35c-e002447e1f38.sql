DROP POLICY IF EXISTS "Organization managers read unit scope assignments" ON public.employee_scope_assignments;
CREATE POLICY "Organization managers read unit scope assignments"
ON public.employee_scope_assignments
FOR SELECT
TO authenticated
USING (
  scope_type = 'unit'
  AND public.current_user_can_manage_unit_scope_assignments()
  AND EXISTS (
    SELECT 1
    FROM public.candidates c
    WHERE c.id = employee_scope_assignments.candidate_id
      AND c.role_key = 'field_officer'
  )
);

DROP POLICY IF EXISTS "Organization managers insert unit scope assignments" ON public.employee_scope_assignments;
CREATE POLICY "Organization managers insert unit scope assignments"
ON public.employee_scope_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  scope_type = 'unit'
  AND public.current_user_can_manage_unit_scope_assignments()
  AND EXISTS (
    SELECT 1
    FROM public.candidates c
    WHERE c.id = employee_scope_assignments.candidate_id
      AND c.role_key = 'field_officer'
      AND c.status IN ('approved', 'active')
  )
);

DROP POLICY IF EXISTS "Organization managers update unit scope assignments" ON public.employee_scope_assignments;
CREATE POLICY "Organization managers update unit scope assignments"
ON public.employee_scope_assignments
FOR UPDATE
TO authenticated
USING (
  scope_type = 'unit'
  AND public.current_user_can_manage_unit_scope_assignments()
  AND EXISTS (
    SELECT 1
    FROM public.candidates c
    WHERE c.id = employee_scope_assignments.candidate_id
      AND c.role_key = 'field_officer'
  )
)
WITH CHECK (
  scope_type = 'unit'
  AND public.current_user_can_manage_unit_scope_assignments()
  AND EXISTS (
    SELECT 1
    FROM public.candidates c
    WHERE c.id = employee_scope_assignments.candidate_id
      AND c.role_key = 'field_officer'
  )
);

DROP POLICY IF EXISTS "Organization managers delete unit scope assignments" ON public.employee_scope_assignments;
CREATE POLICY "Organization managers delete unit scope assignments"
ON public.employee_scope_assignments
FOR DELETE
TO authenticated
USING (
  scope_type = 'unit'
  AND public.current_user_can_manage_unit_scope_assignments()
  AND EXISTS (
    SELECT 1
    FROM public.candidates c
    WHERE c.id = employee_scope_assignments.candidate_id
      AND c.role_key = 'field_officer'
  )
);