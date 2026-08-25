
CREATE POLICY "Field officers offboard scoped employees"
ON public.candidates
FOR UPDATE
TO authenticated
USING (
  public.current_user_role_key() = 'field_officer'
  AND public.current_user_can_onboard_unit(unit_id)
  AND status IN ('approved','active','inactive')
)
WITH CHECK (
  public.current_user_role_key() = 'field_officer'
  AND public.current_user_can_onboard_unit(unit_id)
  AND status IN ('approved','active','inactive')
);
