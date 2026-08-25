
-- ============================================================
-- 1. Helper: current user's branch id (null if not scoped)
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_user_branch_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT esa.scope_id::uuid
  FROM public.employee_scope_assignments esa
  JOIN public.candidates c ON c.id = esa.candidate_id
  WHERE esa.scope_type = 'branch'
    AND c.mobile = public.current_user_mobile()
  LIMIT 1;
$$;

-- ============================================================
-- 2. Demand tables
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.inv_demand_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.inv_demands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_number text NOT NULL UNIQUE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  demand_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft', -- draft, submitted, in_transit, fulfilled, cancelled
  notes text NOT NULL DEFAULT '',
  requester_id uuid,
  submitted_at timestamptz,
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inv_demands TO authenticated;
GRANT ALL ON public.inv_demands TO service_role;
ALTER TABLE public.inv_demands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read inv_demands"
  ON public.inv_demands FOR SELECT TO authenticated
  USING (public.is_admin_user());
CREATE POLICY "Branch users read own inv_demands"
  ON public.inv_demands FOR SELECT TO authenticated
  USING (branch_id = public.current_user_branch_id());
CREATE POLICY "Branch users insert own inv_demands"
  ON public.inv_demands FOR INSERT TO authenticated
  WITH CHECK (branch_id = public.current_user_branch_id() OR public.is_admin_user());
CREATE POLICY "Branch users update own draft inv_demands"
  ON public.inv_demands FOR UPDATE TO authenticated
  USING (
    public.is_admin_user()
    OR (branch_id = public.current_user_branch_id() AND status IN ('draft','submitted'))
  )
  WITH CHECK (
    public.is_admin_user()
    OR (branch_id = public.current_user_branch_id())
  );
CREATE POLICY "Branch users delete own draft inv_demands"
  ON public.inv_demands FOR DELETE TO authenticated
  USING (
    public.is_admin_user()
    OR (branch_id = public.current_user_branch_id() AND status = 'draft')
  );

CREATE TABLE IF NOT EXISTS public.inv_demand_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id uuid NOT NULL REFERENCES public.inv_demands(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inv_items(id) ON DELETE RESTRICT,
  size_value text NOT NULL DEFAULT '',
  requested_qty numeric NOT NULL DEFAULT 0,
  fulfilled_qty numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inv_demand_lines TO authenticated;
GRANT ALL ON public.inv_demand_lines TO service_role;
ALTER TABLE public.inv_demand_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read inv_demand_lines via parent"
  ON public.inv_demand_lines FOR SELECT TO authenticated
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.inv_demands d
      WHERE d.id = demand_id AND d.branch_id = public.current_user_branch_id()
    )
  );
CREATE POLICY "Write inv_demand_lines via parent"
  ON public.inv_demand_lines FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.inv_demands d
      WHERE d.id = demand_id AND d.branch_id = public.current_user_branch_id()
    )
  );
CREATE POLICY "Update inv_demand_lines via parent"
  ON public.inv_demand_lines FOR UPDATE TO authenticated
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.inv_demands d
      WHERE d.id = demand_id AND d.branch_id = public.current_user_branch_id()
    )
  );
CREATE POLICY "Delete inv_demand_lines via parent"
  ON public.inv_demand_lines FOR DELETE TO authenticated
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.inv_demands d
      WHERE d.id = demand_id AND d.branch_id = public.current_user_branch_id()
    )
  );

CREATE TRIGGER trg_inv_demands_updated_at
  BEFORE UPDATE ON public.inv_demands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_demand_lines_updated_at
  BEFORE UPDATE ON public.inv_demand_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. Link transfers & goods receipts to demand
-- ============================================================
ALTER TABLE public.inv_transfers
  ADD COLUMN IF NOT EXISTS demand_id uuid REFERENCES public.inv_demands(id) ON DELETE SET NULL;

ALTER TABLE public.inv_goods_receipts
  ADD COLUMN IF NOT EXISTS transfer_id uuid REFERENCES public.inv_transfers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS demand_id uuid REFERENCES public.inv_demands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'vendor';

ALTER TABLE public.inv_goods_receipts
  ALTER COLUMN warehouse_id DROP NOT NULL;

-- ============================================================
-- 4. Relax inv_goods_receipts read policy: allow branch users to see their own
-- ============================================================
DROP POLICY IF EXISTS "Non-branch users read inv_goods_receipts" ON public.inv_goods_receipts;
CREATE POLICY "Read inv_goods_receipts"
  ON public.inv_goods_receipts FOR SELECT TO authenticated
  USING (
    public.is_admin_user()
    OR NOT public.current_user_has_branch_scope()
    OR branch_id = public.current_user_branch_id()
  );

DROP POLICY IF EXISTS "Non-branch users read inv_goods_receipt_lines" ON public.inv_goods_receipt_lines;
CREATE POLICY "Read inv_goods_receipt_lines"
  ON public.inv_goods_receipt_lines FOR SELECT TO authenticated
  USING (
    public.is_admin_user()
    OR NOT public.current_user_has_branch_scope()
    OR EXISTS (
      SELECT 1 FROM public.inv_goods_receipts g
      WHERE g.id = grn_id AND g.branch_id = public.current_user_branch_id()
    )
  );
