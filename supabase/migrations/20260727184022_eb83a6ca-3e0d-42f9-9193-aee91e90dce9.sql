CREATE OR REPLACE FUNCTION public.current_user_can_view_self_attendance(
  _candidate_id uuid,
  _unit_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT
      public.current_user_candidate_id() AS candidate_id,
      public.current_user_role_key() AS role_key,
      public.current_user_unit_ids() AS unit_ids
  )
  SELECT EXISTS (
    SELECT 1
    FROM me
    WHERE
      _candidate_id = me.candidate_id
      OR public.is_admin_user()
      OR COALESCE(me.role_key, '') = ANY (ARRAY['hr', 'leadership', 'admin', 'super_admin', 'branch_manager'])
      OR (
        COALESCE(me.role_key, '') = 'field_officer'
        AND (
          (_unit_id IS NOT NULL AND _unit_id = ANY (me.unit_ids))
          OR EXISTS (
            SELECT 1
            FROM public.candidate_units cu
            WHERE cu.candidate_id = _candidate_id
              AND cu.unit_id = ANY (me.unit_ids)
          )
          OR EXISTS (
            SELECT 1
            FROM public.candidates c
            WHERE c.id = _candidate_id
              AND c.role_key IN ('guard', 'security_guard')
              AND (
                c.unit_id = ANY (me.unit_ids)
                OR EXISTS (
                  SELECT 1
                  FROM public.candidate_reporting_managers crm
                  WHERE crm.candidate_id = c.id
                    AND crm.manager_id = me.candidate_id
                )
              )
          )
        )
      )
  );
$$;

DROP POLICY IF EXISTS self_att_own_select ON public.self_attendance_punches;

CREATE POLICY self_att_own_select
ON public.self_attendance_punches
FOR SELECT
TO authenticated
USING (public.current_user_can_view_self_attendance(candidate_id, unit_id));