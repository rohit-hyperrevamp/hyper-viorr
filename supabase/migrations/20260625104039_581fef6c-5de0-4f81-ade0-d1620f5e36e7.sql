DROP POLICY IF EXISTS "Role hierarchy read inv_stock_balances" ON public.inv_stock_balances;

CREATE POLICY "Role hierarchy read inv_stock_balances"
ON public.inv_stock_balances
FOR SELECT
TO authenticated
USING (
  public.is_admin_user()
  OR public.current_user_is_inventory_manager()
  OR (
    public.current_user_role_key() = 'branch_manager'
    AND (
      (location_type = 'branch' AND location_id::text IN (SELECT public.current_user_branch_scope_ids()))
      OR (location_type = 'field_officer' AND public.is_candidate_in_current_user_branch(location_id))
      OR (location_type IN ('guard', 'security_guard') AND public.is_candidate_in_current_user_branch(location_id))
    )
  )
  OR (
    public.current_user_role_key() = 'field_officer'
    AND (
      (location_type = 'field_officer' AND location_id = public.current_user_candidate_id())
      OR (location_type IN ('guard', 'security_guard') AND location_id IN (SELECT public.current_user_assigned_guard_ids()))
    )
  )
  OR (
    public.current_user_role_key() IN ('guard', 'security_guard')
    AND location_type IN ('guard', 'security_guard')
    AND location_id = public.current_user_candidate_id()
  )
);