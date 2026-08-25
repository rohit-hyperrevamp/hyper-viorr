DROP POLICY IF EXISTS "Onboarding approvers update review candidates" ON public.candidates;
CREATE POLICY "Onboarding approvers update candidates"
ON public.candidates
FOR UPDATE
USING (
  current_user_can_approve_onboarding()
  AND status = ANY (ARRAY['draft','pending','rejected','approved','active','inactive'])
)
WITH CHECK (
  current_user_can_approve_onboarding()
  AND status = ANY (ARRAY['draft','pending','rejected','approved','active','inactive'])
);