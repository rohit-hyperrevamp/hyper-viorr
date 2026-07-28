
CREATE POLICY "Field officers manage guard unit mappings"
ON public.candidate_units
FOR ALL
TO authenticated
USING (
  public.current_user_role_key() = 'field_officer'
  AND public.current_user_can_onboard_unit(unit_id)
  AND EXISTS (
    SELECT 1 FROM public.candidates g
    WHERE g.id = candidate_units.candidate_id
      AND g.role_key IN ('guard','security_guard')
      AND (
        g.reports_to = public.current_user_candidate_id()
        OR g.unit_id = ANY(public.current_user_unit_ids())
        OR EXISTS (
          SELECT 1 FROM public.candidate_units cu2
          WHERE cu2.candidate_id = g.id
            AND cu2.unit_id = ANY(public.current_user_unit_ids())
        )
      )
  )
)
WITH CHECK (
  public.current_user_role_key() = 'field_officer'
  AND public.current_user_can_onboard_unit(unit_id)
  AND EXISTS (
    SELECT 1 FROM public.candidates g
    WHERE g.id = candidate_units.candidate_id
      AND g.role_key IN ('guard','security_guard')
      AND (
        g.reports_to = public.current_user_candidate_id()
        OR g.unit_id = ANY(public.current_user_unit_ids())
        OR EXISTS (
          SELECT 1 FROM public.candidate_units cu2
          WHERE cu2.candidate_id = g.id
            AND cu2.unit_id = ANY(public.current_user_unit_ids())
        )
      )
  )
);
