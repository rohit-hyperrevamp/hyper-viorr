CREATE OR REPLACE FUNCTION public.current_user_can_approve_onboarding()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_admin_user()
    OR EXISTS (
      SELECT 1
      FROM auth.users u
      JOIN public.candidates c
        ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
      WHERE u.id = auth.uid()
        AND c.status IN ('approved', 'active')
        AND c.role_key IN ('hr', 'leadership', 'admin', 'super_admin')
    )
    OR public.current_user_has_permission('employees', '', 'approve')
    OR public.current_user_has_permission('employees', 'approvals', 'approve');
$$;

DROP POLICY IF EXISTS "Onboarding approvers update review candidates" ON public.candidates;
CREATE POLICY "Onboarding approvers update review candidates"
ON public.candidates
FOR UPDATE
TO authenticated
USING (
  status IN ('pending', 'rejected')
  AND public.current_user_can_approve_onboarding()
)
WITH CHECK (
  status IN ('pending', 'rejected', 'approved', 'active', 'inactive')
  AND public.current_user_can_approve_onboarding()
);

DROP POLICY IF EXISTS "Onboarding approvers read review candidates" ON public.candidates;
CREATE POLICY "Onboarding approvers read review candidates"
ON public.candidates
FOR SELECT
TO authenticated
USING (
  status IN ('draft', 'pending', 'rejected')
  AND public.current_user_can_approve_onboarding()
);