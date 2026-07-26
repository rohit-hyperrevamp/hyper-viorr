
CREATE OR REPLACE FUNCTION public.current_user_can_onboard_unit(_unit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _unit_id IS NULL
    OR public.is_admin_user()
    OR public.current_user_role_key() IN ('hr', 'leadership', 'admin', 'super_admin')
    OR (
      public.current_user_role_key() = 'field_officer'
      AND (
        EXISTS (
          SELECT 1
          FROM public.employee_scope_assignments esa
          JOIN public.units u ON u.id = _unit_id
          WHERE esa.candidate_id = public.current_user_candidate_id()
            AND (
              (esa.scope_type = 'unit' AND esa.scope_id = _unit_id::text)
              OR (esa.scope_type = 'branch' AND u.branch_id::text = esa.scope_id)
              OR (esa.scope_type = 'customer' AND u.customer_id::text = esa.scope_id)
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.candidate_units cu
          WHERE cu.candidate_id = public.current_user_candidate_id()
            AND cu.unit_id = _unit_id
        )
        OR EXISTS (
          SELECT 1 FROM public.units u
          WHERE u.id = _unit_id AND u.code = 'NOMANS'
        )
      )
    );
$$;
