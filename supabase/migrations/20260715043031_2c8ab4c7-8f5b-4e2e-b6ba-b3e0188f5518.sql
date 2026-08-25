CREATE OR REPLACE FUNCTION public.current_user_can_approve_onboarding()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_admin_user()
    OR public.current_user_role_key() IN ('hr', 'leadership', 'admin', 'super_admin')
    OR public.current_user_has_permission('employees', '', 'approve');
$$;

CREATE OR REPLACE FUNCTION public.get_candidate_id_by_user_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id
  FROM auth.users u
  JOIN public.candidates c
    ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
  WHERE u.id = _user_id
  LIMIT 1;
$$;

DROP POLICY IF EXISTS "Onboarding approvers read review candidates" ON public.candidates;
CREATE POLICY "Onboarding approvers read review candidates"
ON public.candidates
FOR SELECT
TO authenticated
USING (
  status IN ('draft', 'pending', 'rejected')
  AND public.current_user_can_approve_onboarding()
);

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