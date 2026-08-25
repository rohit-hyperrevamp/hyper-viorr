
-- Demands: branch-scope read
CREATE POLICY "Branch scope read inv_demands" ON public.inv_demands FOR SELECT TO authenticated
USING (branch_id IS NOT NULL AND branch_id::text IN (SELECT public.current_user_branch_scope_ids()));

CREATE POLICY "Branch scope read inv_demand_lines" ON public.inv_demand_lines FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.inv_demands d WHERE d.id = inv_demand_lines.demand_id
  AND d.branch_id IS NOT NULL AND d.branch_id::text IN (SELECT public.current_user_branch_scope_ids())));

-- Goods receipt lines: branch-scope read
CREATE POLICY "Branch scope read inv_goods_receipt_lines" ON public.inv_goods_receipt_lines FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.inv_goods_receipts g WHERE g.id = inv_goods_receipt_lines.grn_id
  AND g.branch_id IS NOT NULL AND g.branch_id::text IN (SELECT public.current_user_branch_scope_ids())));

-- Security guard read: demands they raised or are assigned to
CREATE POLICY "Guard read inv_demands" ON public.inv_demands FOR SELECT TO authenticated
USING (
  public.current_user_role_key() IN ('guard','security_guard')
  AND (requester_candidate_id = public.current_user_candidate_id() OR requester_id = auth.uid())
);

CREATE POLICY "Guard read inv_demand_lines" ON public.inv_demand_lines FOR SELECT TO authenticated
USING (
  public.current_user_role_key() IN ('guard','security_guard')
  AND EXISTS (SELECT 1 FROM public.inv_demands d WHERE d.id = inv_demand_lines.demand_id
    AND (d.requester_candidate_id = public.current_user_candidate_id() OR d.requester_id = auth.uid()))
);

-- Guard read: transfers where they are source or destination
CREATE POLICY "Guard read inv_transfers" ON public.inv_transfers FOR SELECT TO authenticated
USING (
  public.current_user_role_key() IN ('guard','security_guard')
  AND (
    (source_type IN ('guard','security_guard') AND source_id = public.current_user_candidate_id())
    OR (destination_type IN ('guard','security_guard') AND destination_id = public.current_user_candidate_id())
  )
);

CREATE POLICY "Guard read inv_transfer_lines" ON public.inv_transfer_lines FOR SELECT TO authenticated
USING (
  public.current_user_role_key() IN ('guard','security_guard')
  AND EXISTS (SELECT 1 FROM public.inv_transfers t WHERE t.id = inv_transfer_lines.transfer_id
    AND ((t.source_type IN ('guard','security_guard') AND t.source_id = public.current_user_candidate_id())
      OR (t.destination_type IN ('guard','security_guard') AND t.destination_id = public.current_user_candidate_id())))
);

-- Guard read: issuances where they are source or destination
CREATE POLICY "Guard read inv_issuances" ON public.inv_issuances FOR SELECT TO authenticated
USING (
  public.current_user_role_key() IN ('guard','security_guard')
  AND (
    (source_type IN ('guard','security_guard') AND source_id = public.current_user_candidate_id())
    OR (destination_type IN ('guard','security_guard') AND destination_id = public.current_user_candidate_id())
  )
);

CREATE POLICY "Guard read inv_issuance_lines" ON public.inv_issuance_lines FOR SELECT TO authenticated
USING (
  public.current_user_role_key() IN ('guard','security_guard')
  AND EXISTS (SELECT 1 FROM public.inv_issuances i WHERE i.id = inv_issuance_lines.issuance_id
    AND ((i.source_type IN ('guard','security_guard') AND i.source_id = public.current_user_candidate_id())
      OR (i.destination_type IN ('guard','security_guard') AND i.destination_id = public.current_user_candidate_id())))
);

-- Guard read: goods receipts/lines posted to them (rare, but consistent)
CREATE POLICY "Guard read inv_goods_receipts" ON public.inv_goods_receipts FOR SELECT TO authenticated
USING (
  public.current_user_role_key() IN ('guard','security_guard')
  AND received_by = auth.uid()
);
