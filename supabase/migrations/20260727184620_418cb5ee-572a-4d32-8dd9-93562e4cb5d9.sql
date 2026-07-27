CREATE OR REPLACE FUNCTION public.current_user_can_manage_attendance_unit(_unit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT
      public.current_user_candidate_id() AS candidate_id,
      public.current_user_role_key() AS role_key
  )
  SELECT EXISTS (
    SELECT 1
    FROM me
    WHERE
      public.is_admin_user()
      OR public.current_user_role_key() IN ('hr', 'leadership', 'admin', 'super_admin', 'branch_manager')
      OR (
        me.role_key = 'field_officer'
        AND (
          EXISTS (
            SELECT 1
            FROM public.employee_scope_assignments esa
            JOIN public.units u ON u.id = _unit_id
            WHERE esa.candidate_id = me.candidate_id
              AND (
                (esa.scope_type = 'unit' AND esa.scope_id = _unit_id::text)
                OR (esa.scope_type = 'customer' AND u.customer_id::text = esa.scope_id)
              )
          )
          OR EXISTS (
            SELECT 1
            FROM public.candidate_units cu
            WHERE cu.candidate_id = me.candidate_id
              AND cu.unit_id = _unit_id
          )
        )
      )
  );
$$;

CREATE POLICY "Field officers read assigned attendance_entries"
ON public.attendance_entries
FOR SELECT
TO authenticated
USING (
  public.current_user_role_key() = 'field_officer'
  AND public.current_user_can_manage_attendance_unit(unit_id)
);

CREATE POLICY "Field officers insert assigned attendance_entries"
ON public.attendance_entries
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_user_role_key() = 'field_officer'
  AND public.current_user_can_manage_attendance_unit(unit_id)
);

CREATE POLICY "Field officers update assigned attendance_entries"
ON public.attendance_entries
FOR UPDATE
TO authenticated
USING (
  public.current_user_role_key() = 'field_officer'
  AND public.current_user_can_manage_attendance_unit(unit_id)
)
WITH CHECK (
  public.current_user_role_key() = 'field_officer'
  AND public.current_user_can_manage_attendance_unit(unit_id)
);