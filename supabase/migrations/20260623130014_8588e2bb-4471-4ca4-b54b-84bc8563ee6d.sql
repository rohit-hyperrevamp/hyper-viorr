DROP POLICY IF EXISTS "Branch users update own draft inv_demands" ON public.inv_demands;
CREATE POLICY "Branch users update own inv_demands"
  ON public.inv_demands
  FOR UPDATE
  USING (
    public.is_admin_user()
    OR (branch_id = public.current_user_branch_id()
        AND status IN ('draft','submitted','in_transit'))
  )
  WITH CHECK (
    public.is_admin_user()
    OR (branch_id = public.current_user_branch_id()
        AND status IN ('draft','submitted','in_transit','fulfilled'))
  );

DROP POLICY IF EXISTS "Branch users update own draft inv_demand_lines" ON public.inv_demand_lines;
CREATE POLICY "Branch users update own inv_demand_lines"
  ON public.inv_demand_lines
  FOR UPDATE
  USING (
    public.is_admin_user()
    OR EXISTS (SELECT 1 FROM public.inv_demands d
                WHERE d.id = demand_id
                  AND d.branch_id = public.current_user_branch_id()
                  AND d.status IN ('draft','submitted','in_transit'))
  )
  WITH CHECK (
    public.is_admin_user()
    OR EXISTS (SELECT 1 FROM public.inv_demands d
                WHERE d.id = demand_id
                  AND d.branch_id = public.current_user_branch_id())
  );