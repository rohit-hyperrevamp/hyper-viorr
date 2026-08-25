DROP POLICY IF EXISTS "Insert inv_demands" ON public.inv_demands;
CREATE POLICY "Insert inv_demands" ON public.inv_demands FOR INSERT TO authenticated
WITH CHECK (
  is_admin_user()
  OR current_user_is_inventory_manager()
  OR (
    (requester_id = auth.uid() OR requester_candidate_id = current_user_candidate_id())
    AND (warehouse_id IS NOT NULL OR branch_id IS NOT NULL)
  )
);