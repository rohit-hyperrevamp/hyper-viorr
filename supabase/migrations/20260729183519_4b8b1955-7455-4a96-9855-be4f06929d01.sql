DROP POLICY IF EXISTS "Role hierarchy read inv_stock_balances" ON public.inv_stock_balances;

CREATE POLICY "Role hierarchy read inv_stock_balances"
ON public.inv_stock_balances
FOR SELECT
USING (
  is_admin_user()
  OR current_user_is_inventory_manager()
  OR (current_user_role_key() = ANY (ARRAY['hr'::text, 'leadership'::text, 'operations_manager'::text, 'vp_operations'::text]))
  OR (
    current_user_role_key() = 'branch_manager'
    AND (
      (location_type = 'branch' AND (location_id)::text IN (SELECT current_user_branch_scope_ids()))
      OR (location_type = 'field_officer' AND is_candidate_in_current_user_branch(location_id))
      OR (location_type = ANY (ARRAY['guard'::text, 'security_guard'::text]) AND is_candidate_in_current_user_branch(location_id))
    )
  )
  OR (
    current_user_role_key() = 'field_officer'
    AND (
      (location_type = 'field_officer' AND location_id = current_user_candidate_id())
      OR (location_type = ANY (ARRAY['guard'::text, 'security_guard'::text]) AND location_id IN (SELECT current_user_assigned_guard_ids()))
    )
  )
  OR (
    current_user_role_key() = ANY (ARRAY['guard'::text, 'security_guard'::text])
    AND location_type = ANY (ARRAY['guard'::text, 'security_guard'::text])
    AND location_id = current_user_candidate_id()
  )
);