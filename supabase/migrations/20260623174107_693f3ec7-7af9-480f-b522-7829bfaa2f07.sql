
DROP POLICY IF EXISTS "Read inv_goods_receipts" ON public.inv_goods_receipts;
CREATE POLICY "Read inv_goods_receipts" ON public.inv_goods_receipts
FOR SELECT TO authenticated
USING (
  is_admin_user()
  OR (NOT current_user_has_branch_scope())
  OR (branch_id = current_user_branch_id())
  OR (received_by = auth.uid())
);

DROP POLICY IF EXISTS "Read inv_goods_receipt_lines" ON public.inv_goods_receipt_lines;
CREATE POLICY "Read inv_goods_receipt_lines" ON public.inv_goods_receipt_lines
FOR SELECT TO authenticated
USING (
  is_admin_user()
  OR (NOT current_user_has_branch_scope())
  OR EXISTS (
    SELECT 1 FROM public.inv_goods_receipts g
    WHERE g.id = inv_goods_receipt_lines.grn_id
      AND (g.branch_id = current_user_branch_id() OR g.received_by = auth.uid())
  )
);
