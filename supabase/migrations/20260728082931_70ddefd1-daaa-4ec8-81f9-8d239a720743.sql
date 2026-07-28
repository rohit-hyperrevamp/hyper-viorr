-- Allow the creator of a candidate to delete it while still pre-approval
CREATE POLICY "Users delete candidates they submitted before approval"
ON public.candidates
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid()
  AND status = ANY (ARRAY['draft'::text, 'pending'::text, 'rejected'::text])
  AND current_user_can_submit_onboarding()
);

-- Allow Field Officers to delete candidates within their onboarding scope pre-approval
CREATE POLICY "Field officers delete scoped pre-approval candidates"
ON public.candidates
FOR DELETE
TO authenticated
USING (
  current_user_role_key() = 'field_officer'::text
  AND current_user_can_onboard_unit(unit_id)
  AND status = ANY (ARRAY['draft'::text, 'pending'::text, 'rejected'::text])
);