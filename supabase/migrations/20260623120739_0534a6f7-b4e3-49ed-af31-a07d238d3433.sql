
-- Helper: does the current user have a branch scope assignment?
CREATE OR REPLACE FUNCTION public.current_user_has_branch_scope()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employee_scope_assignments esa
    JOIN public.candidates c ON c.id = esa.candidate_id
    WHERE esa.scope_type = 'branch'
      AND c.mobile = public.current_user_mobile()
  );
$$;

-- Lock down delivery challans / GRNs from branch-scoped users.
DROP POLICY IF EXISTS "Authenticated read inv_goods_receipts" ON public.inv_goods_receipts;
CREATE POLICY "Non-branch users read inv_goods_receipts"
  ON public.inv_goods_receipts FOR SELECT
  TO authenticated
  USING (public.is_admin_user() OR NOT public.current_user_has_branch_scope());

DROP POLICY IF EXISTS "Authenticated read inv_goods_receipt_lines" ON public.inv_goods_receipt_lines;
CREATE POLICY "Non-branch users read inv_goods_receipt_lines"
  ON public.inv_goods_receipt_lines FOR SELECT
  TO authenticated
  USING (public.is_admin_user() OR NOT public.current_user_has_branch_scope());

-- Lock down POs too (branch managers must never see vendor / PO data).
DROP POLICY IF EXISTS "Authenticated read inv_purchase_orders" ON public.inv_purchase_orders;
CREATE POLICY "Non-branch users read inv_purchase_orders"
  ON public.inv_purchase_orders FOR SELECT
  TO authenticated
  USING (public.is_admin_user() OR NOT public.current_user_has_branch_scope());

DROP POLICY IF EXISTS "Authenticated read inv_po_lines" ON public.inv_po_lines;
CREATE POLICY "Non-branch users read inv_po_lines"
  ON public.inv_po_lines FOR SELECT
  TO authenticated
  USING (public.is_admin_user() OR NOT public.current_user_has_branch_scope());

-- Warehouses too (branch managers must not see warehouses).
DROP POLICY IF EXISTS "Authenticated read inv_warehouses" ON public.inv_warehouses;
CREATE POLICY "Non-branch users read inv_warehouses"
  ON public.inv_warehouses FOR SELECT
  TO authenticated
  USING (public.is_admin_user() OR NOT public.current_user_has_branch_scope());
