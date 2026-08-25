-- Add a helper that checks if the current user has organizations edit permission
-- (which covers admin, super_admin, leadership, and any role granted organizations edit).
CREATE OR REPLACE FUNCTION public.current_user_can_edit_organizations()
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
        AND rp.can_edit = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_can_edit_organizations() TO authenticated;

-- Drop and recreate the organization-manager policies with a simpler, reliable predicate.
DROP POLICY IF EXISTS "Organization managers read unit scope assignments" ON public.employee_scope_assignments;
DROP POLICY IF EXISTS "Organization managers insert unit scope assignments" ON public.employee_scope_assignments;
DROP POLICY IF EXISTS "Organization managers update unit scope assignments" ON public.employee_scope_assignments;
DROP POLICY IF EXISTS "Organization managers delete unit scope assignments" ON public.employee_scope_assignments;

CREATE POLICY "Organization managers read unit scope assignments"
ON public.employee_scope_assignments
FOR SELECT
TO authenticated
USING (
  scope_type = 'unit'
  AND public.current_user_can_edit_organizations()
);

CREATE POLICY "Organization managers insert unit scope assignments"
ON public.employee_scope_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  scope_type = 'unit'
  AND public.current_user_can_edit_organizations()
  AND EXISTS (
    SELECT 1 FROM public.candidates c
    WHERE c.id = employee_scope_assignments.candidate_id
      AND c.role_key = 'field_officer'
      AND c.status IN ('approved','active')
  )
);

CREATE POLICY "Organization managers update unit scope assignments"
ON public.employee_scope_assignments
FOR UPDATE
TO authenticated
USING (
  scope_type = 'unit'
  AND public.current_user_can_edit_organizations()
)
WITH CHECK (
  scope_type = 'unit'
  AND public.current_user_can_edit_organizations()
);

CREATE POLICY "Organization managers delete unit scope assignments"
ON public.employee_scope_assignments
FOR DELETE
TO authenticated
USING (
  scope_type = 'unit'
  AND public.current_user_can_edit_organizations()
);