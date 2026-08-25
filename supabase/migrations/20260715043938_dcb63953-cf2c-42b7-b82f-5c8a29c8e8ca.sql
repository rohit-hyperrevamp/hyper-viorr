DROP POLICY IF EXISTS "Onboarding approvers read employee rows" ON public.candidates;
CREATE POLICY "Onboarding approvers read employee rows"
ON public.candidates
FOR SELECT
TO authenticated
USING (
  status IN ('approved', 'active', 'inactive')
  AND public.current_user_can_approve_onboarding()
);