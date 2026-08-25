CREATE OR REPLACE FUNCTION public.current_user_can_approve_onboarding()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_admin_user()
    OR COALESCE((
      SELECT c.role_key IN ('hr', 'leadership', 'admin', 'super_admin')
      FROM auth.users u
      JOIN public.candidates c
        ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
      WHERE u.id = auth.uid()
        AND c.status IN ('approved', 'active')
      LIMIT 1
    ), false);
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