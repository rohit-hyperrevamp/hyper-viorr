CREATE POLICY "Branch users read incoming POs" ON public.inv_purchase_orders FOR SELECT TO authenticated
USING (destination_branch_id::text IN (SELECT public.current_user_branch_scope_ids()));

CREATE POLICY "Branch users read incoming PO lines" ON public.inv_po_lines FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.inv_purchase_orders po WHERE po.id = inv_po_lines.po_id AND po.destination_branch_id::text IN (SELECT public.current_user_branch_scope_ids())));

CREATE POLICY "Branch users update incoming PO lines" ON public.inv_po_lines FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.inv_purchase_orders po WHERE po.id = inv_po_lines.po_id AND po.destination_branch_id::text IN (SELECT public.current_user_branch_scope_ids())))
WITH CHECK (EXISTS (SELECT 1 FROM public.inv_purchase_orders po WHERE po.id = inv_po_lines.po_id AND po.destination_branch_id::text IN (SELECT public.current_user_branch_scope_ids())));

CREATE POLICY "Branch users update incoming POs" ON public.inv_purchase_orders FOR UPDATE TO authenticated
USING (destination_branch_id::text IN (SELECT public.current_user_branch_scope_ids()))
WITH CHECK (destination_branch_id::text IN (SELECT public.current_user_branch_scope_ids()));