CREATE OR REPLACE FUNCTION public.current_user_candidate_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id
  FROM public.candidates c
  WHERE c.mobile = public.current_user_mobile()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.candidate_branch_ids(_candidate_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT esa.scope_id::uuid
  FROM public.employee_scope_assignments esa
  WHERE esa.candidate_id = _candidate_id
    AND esa.scope_type = 'branch'
  UNION
  SELECT u.branch_id
  FROM public.employee_scope_assignments esa
  JOIN public.units u ON u.id = esa.scope_id::uuid
  WHERE esa.candidate_id = _candidate_id
    AND esa.scope_type = 'unit'
    AND u.branch_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.is_candidate_in_current_user_branch(_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidate_branch_ids(_candidate_id) candidate_branch(branch_id)
    WHERE candidate_branch.branch_id::text IN (SELECT public.current_user_branch_scope_ids())
  );
$$;

DROP POLICY IF EXISTS "Authenticated read inv_stock_balances" ON public.inv_stock_balances;
DROP POLICY IF EXISTS "Role hierarchy read inv_stock_balances" ON public.inv_stock_balances;
CREATE POLICY "Role hierarchy read inv_stock_balances"
ON public.inv_stock_balances
FOR SELECT
TO authenticated
USING (
  public.is_admin_user()
  OR public.current_user_role_key() = 'inventory_manager'
  OR (
    public.current_user_role_key() = 'branch_manager'
    AND (
      (location_type = 'branch' AND location_id::text IN (SELECT public.current_user_branch_scope_ids()))
      OR (location_type = 'field_officer' AND public.is_candidate_in_current_user_branch(location_id))
    )
  )
  OR (
    public.current_user_role_key() = 'field_officer'
    AND location_type = 'field_officer'
    AND location_id = public.current_user_candidate_id()
  )
  OR (
    public.current_user_role_key() IN ('guard', 'security_guard')
    AND location_type IN ('guard', 'security_guard')
    AND location_id = public.current_user_candidate_id()
  )
);