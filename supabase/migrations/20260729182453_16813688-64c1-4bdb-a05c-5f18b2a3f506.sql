DROP POLICY IF EXISTS "Scoped read units" ON public.units;
CREATE POLICY "Scoped read units" ON public.units
FOR SELECT
USING (
  is_admin_user()
  OR current_user_is_inventory_manager()
  OR COALESCE(current_user_role_key(), '') IN ('hr','leadership','operations_manager','vp_operations')
  OR (NOT current_user_has_branch_scope())
  OR (branch_id IS NULL)
  OR ((branch_id)::text IN (SELECT current_user_branch_scope_ids()))
);