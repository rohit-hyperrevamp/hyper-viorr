
CREATE POLICY "Branch users update related demands" ON public.inv_demands FOR UPDATE TO authenticated
USING (
  (branch_id IS NOT NULL AND branch_id::text IN (SELECT public.current_user_branch_scope_ids()))
  OR EXISTS (
    SELECT 1 FROM public.inv_transfers t
    WHERE t.demand_id = inv_demands.id
      AND ((t.destination_type = 'branch' AND t.destination_id::text IN (SELECT public.current_user_branch_scope_ids()))
        OR (t.source_type = 'branch' AND t.source_id::text IN (SELECT public.current_user_branch_scope_ids())))
  )
)
WITH CHECK (true);
