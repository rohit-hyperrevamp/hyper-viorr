
-- Re-create read policy on inv_demands so non-branch staff (inventory/warehouse) can read all.
DROP POLICY IF EXISTS "Read inv_demands by scope" ON public.inv_demands;
CREATE POLICY "Read inv_demands by scope"
  ON public.inv_demands FOR SELECT TO authenticated
  USING (
    public.is_admin_user()
    OR NOT public.current_user_has_branch_scope()
    OR branch_id = public.current_user_branch_id()
  );

DROP POLICY IF EXISTS "Read inv_demand_lines by scope" ON public.inv_demand_lines;
CREATE POLICY "Read inv_demand_lines by scope"
  ON public.inv_demand_lines FOR SELECT TO authenticated
  USING (
    public.is_admin_user()
    OR NOT public.current_user_has_branch_scope()
    OR EXISTS (
      SELECT 1 FROM public.inv_demands d
      WHERE d.id = inv_demand_lines.demand_id
        AND d.branch_id = public.current_user_branch_id()
    )
  );

INSERT INTO public.role_permissions (role_key, module_key, sub_module_key, can_view, can_edit, can_delete, can_approve)
VALUES ('inventory', 'inventory', 'demands', true, false, false, false)
ON CONFLICT (role_key, module_key, sub_module_key)
DO UPDATE SET can_view = true;
