CREATE OR REPLACE FUNCTION public.current_user_can_onboard_unit(_unit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    _unit_id IS NULL
    OR public.is_admin_user()
    OR public.current_user_role_key() IN ('hr', 'leadership', 'admin', 'super_admin')
    OR (
      public.current_user_role_key() = 'field_officer'
      AND EXISTS (
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
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_submit_onboarding()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_admin_user()
    OR EXISTS (
      SELECT 1
      FROM auth.users u
      JOIN public.candidates c
        ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
      WHERE u.id = auth.uid()
        AND c.status IN ('approved', 'active')
        AND c.role_key IN ('field_officer', 'hr', 'leadership', 'admin', 'super_admin')
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_owns_onboarding_candidate(_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidates c
    WHERE c.id = _candidate_id
      AND c.created_by = auth.uid()
      AND c.status IN ('draft', 'pending', 'rejected')
  );
$$;

DROP POLICY IF EXISTS "Onboarding users create candidates" ON public.candidates;
CREATE POLICY "Onboarding users create candidates"
ON public.candidates
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND status IN ('draft', 'pending')
  AND public.current_user_can_submit_onboarding()
  AND public.current_user_can_onboard_unit(unit_id)
);

DROP POLICY IF EXISTS "Users read candidates they submitted" ON public.candidates;
CREATE POLICY "Users read candidates they submitted"
ON public.candidates
FOR SELECT
TO authenticated
USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Users update candidates they submitted before approval" ON public.candidates;
CREATE POLICY "Users update candidates they submitted before approval"
ON public.candidates
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  AND status IN ('draft', 'pending', 'rejected')
  AND public.current_user_can_submit_onboarding()
)
WITH CHECK (
  created_by = auth.uid()
  AND status IN ('draft', 'pending', 'rejected')
  AND public.current_user_can_submit_onboarding()
  AND public.current_user_can_onboard_unit(unit_id)
);

DROP POLICY IF EXISTS "Users manage units for candidates they submitted" ON public.candidate_units;
CREATE POLICY "Users manage units for candidates they submitted"
ON public.candidate_units
FOR ALL
TO authenticated
USING (
  public.current_user_owns_onboarding_candidate(candidate_id)
)
WITH CHECK (
  public.current_user_owns_onboarding_candidate(candidate_id)
  AND public.current_user_can_onboard_unit(unit_id)
);

CREATE OR REPLACE FUNCTION public.get_onboarding_approver_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT u.id FROM auth.users u
  WHERE u.email IN (
    'phone-8373914073@radiantguard.local',
    'phone-8373149073@radiantguard.local',
    'phone-8373914072@radiantguard.local'
  )
  UNION
  SELECT DISTINCT u.id FROM auth.users u
  JOIN public.candidates c
    ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
  WHERE c.status = 'active'
    AND (
      c.role_key IN ('hr', 'leadership', 'admin', 'super_admin')
      OR c.role_key IN (
        SELECT role_key
        FROM public.role_permissions
        WHERE module_key = 'employees'
          AND can_approve = true
      )
    );
$$;