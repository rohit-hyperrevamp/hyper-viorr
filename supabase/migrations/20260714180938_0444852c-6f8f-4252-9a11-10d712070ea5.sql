CREATE OR REPLACE FUNCTION public.current_user_can_manage_unit_scope_assignments()
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
    );
$$;

DROP POLICY IF EXISTS "Organization managers insert unit scope assignments" ON public.employee_scope_assignments;
CREATE POLICY "Organization managers insert unit scope assignments"
ON public.employee_scope_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  scope_type = 'unit'
  AND public.current_user_can_manage_unit_scope_assignments()
);

DROP POLICY IF EXISTS "Organization managers delete unit scope assignments" ON public.employee_scope_assignments;
CREATE POLICY "Organization managers delete unit scope assignments"
ON public.employee_scope_assignments
FOR DELETE
TO authenticated
USING (
  scope_type = 'unit'
  AND public.current_user_can_manage_unit_scope_assignments()
);

DROP POLICY IF EXISTS "Organization managers update unit scope assignments" ON public.employee_scope_assignments;
CREATE POLICY "Organization managers update unit scope assignments"
ON public.employee_scope_assignments
FOR UPDATE
TO authenticated
USING (
  scope_type = 'unit'
  AND public.current_user_can_manage_unit_scope_assignments()
)
WITH CHECK (
  scope_type = 'unit'
  AND public.current_user_can_manage_unit_scope_assignments()
);