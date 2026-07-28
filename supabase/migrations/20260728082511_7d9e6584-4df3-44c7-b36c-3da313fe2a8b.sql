CREATE OR REPLACE FUNCTION public.current_user_can_manage_guard_unit_mapping(_candidate_id uuid, _unit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_user_role_key() = 'field_officer'
    AND public.current_user_can_onboard_unit(_unit_id)
    AND EXISTS (
      SELECT 1
      FROM public.candidates g
      WHERE g.id = _candidate_id
        AND g.role_key = ANY (ARRAY['guard'::text, 'security_guard'::text])
        AND (
          g.reports_to = public.current_user_candidate_id()
          OR g.unit_id = ANY (public.current_user_unit_ids())
          OR public.current_user_owns_onboarding_candidate(_candidate_id)
          OR EXISTS (
            SELECT 1
            FROM public.candidate_units cu2
            WHERE cu2.candidate_id = g.id
              AND cu2.unit_id = ANY (public.current_user_unit_ids())
          )
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_can_manage_guard_unit_mapping(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_guard_unit_mapping(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS "Field officers manage guard unit mappings" ON public.candidate_units;

CREATE POLICY "Field officers manage guard unit mappings"
ON public.candidate_units
FOR ALL
TO authenticated
USING (public.current_user_can_manage_guard_unit_mapping(candidate_id, unit_id))
WITH CHECK (public.current_user_can_manage_guard_unit_mapping(candidate_id, unit_id));