CREATE OR REPLACE FUNCTION public.current_user_can_manage_unit_scope_assignment(_unit_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_user()
    OR EXISTS (
      SELECT 1
      FROM auth.users u
      JOIN public.candidates c
        ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
      JOIN public.role_permissions rp
        ON rp.role_key = c.role_key
      WHERE u.id = auth.uid()
        AND c.status IN ('approved', 'active')
        AND rp.module_key = 'organizations'
        AND rp.sub_module_key IN ('', 'unit_manager')
        AND rp.can_edit = true
    )
    OR EXISTS (
      SELECT 1
      FROM auth.users u
      JOIN public.candidates c
        ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
      JOIN public.units unit_row
        ON unit_row.id::text = _unit_id
      WHERE u.id = auth.uid()
        AND c.status IN ('approved', 'active')
        AND c.role_key = 'branch_manager'
        AND unit_row.branch_id::text IN (
          SELECT public.current_user_branch_scope_ids()
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_can_manage_unit_scope_assignment(text) TO authenticated;

DROP POLICY IF EXISTS "Organization managers read unit scope assignments" ON public.employee_scope_assignments;
CREATE POLICY "Organization managers read unit scope assignments"
ON public.employee_scope_assignments
FOR SELECT
TO authenticated
USING (
  scope_type = 'unit'
  AND public.current_user_can_manage_unit_scope_assignment(scope_id)
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
  AND public.current_user_can_manage_unit_scope_assignment(scope_id)
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
  AND public.current_user_can_manage_unit_scope_assignment(scope_id)
  AND EXISTS (
    SELECT 1
    FROM public.candidates c
    WHERE c.id = employee_scope_assignments.candidate_id
      AND c.role_key = 'field_officer'
  )
)
WITH CHECK (
  scope_type = 'unit'
  AND public.current_user_can_manage_unit_scope_assignment(scope_id)
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
  AND public.current_user_can_manage_unit_scope_assignment(scope_id)
  AND EXISTS (
    SELECT 1
    FROM public.candidates c
    WHERE c.id = employee_scope_assignments.candidate_id
      AND c.role_key = 'field_officer'
  )
);