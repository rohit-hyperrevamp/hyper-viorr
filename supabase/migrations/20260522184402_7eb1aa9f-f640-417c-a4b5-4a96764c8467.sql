
-- ============================================================
-- INVENTORY MANAGEMENT SYSTEM — Foundation Schema
-- ============================================================

-- Helper: updated_at trigger reuses existing public.set_updated_at()

-- ============================================================
-- Sequences for human-readable codes
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.inv_vendor_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.inv_item_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.inv_warehouse_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.inv_po_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.inv_grn_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.inv_transfer_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.inv_issuance_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.inv_writeoff_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.inv_adjustment_number_seq START 1;

-- ============================================================
-- 1. ITEM CATEGORIES
-- ============================================================
CREATE TABLE public.inv_item_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. SIZE CHARTS
-- ============================================================
CREATE TABLE public.inv_size_charts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,                       -- "Uniform Letters", "Shoe IN", "Free Text"
  size_type text NOT NULL DEFAULT 'letter',        -- letter | number | free
  values jsonb NOT NULL DEFAULT '[]'::jsonb,       -- ["S","M","L","XL","XXL"]
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. ITEMS (SKU Master)
-- ============================================================
CREATE TABLE public.inv_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code text NOT NULL UNIQUE,
  name text NOT NULL,
  category_id uuid REFERENCES public.inv_item_categories(id) ON DELETE SET NULL,
  unit text NOT NULL DEFAULT 'pcs',                -- pcs | pair | set | meter | kg
  is_sized boolean NOT NULL DEFAULT false,
  size_chart_id uuid REFERENCES public.inv_size_charts(id) ON DELETE SET NULL,
  is_serialized boolean NOT NULL DEFAULT false,    -- for future use; UI may hide
  hsn_code text NOT NULL DEFAULT '',
  default_reorder_level numeric NOT NULL DEFAULT 0,
  image_url text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_items_category ON public.inv_items(category_id);

-- Per-item allowed sizes (if is_sized=true). For non-sized items, a single
-- row with size_value='' represents the default variant.
CREATE TABLE public.inv_item_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inv_items(id) ON DELETE CASCADE,
  size_value text NOT NULL DEFAULT '',
  reorder_level numeric NOT NULL DEFAULT 0,        -- override per size
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, size_value)
);
CREATE INDEX idx_inv_item_sizes_item ON public.inv_item_sizes(item_id);

-- ============================================================
-- 4. VENDORS
-- ============================================================
CREATE TABLE public.inv_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_code text NOT NULL UNIQUE,
  name text NOT NULL,
  contact_person text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  gstin text NOT NULL DEFAULT '',
  pan text NOT NULL DEFAULT '',
  address1 text NOT NULL DEFAULT '',
  address2 text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  pincode text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT 'India',
  payment_terms text NOT NULL DEFAULT '',          -- e.g. "Net 30"
  bank_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Per-vendor price list. Allows cheapest-vendor reporting.
CREATE TABLE public.inv_vendor_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.inv_vendors(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inv_items(id) ON DELETE CASCADE,
  size_value text NOT NULL DEFAULT '',
  unit_price numeric NOT NULL DEFAULT 0,
  tax_percent numeric NOT NULL DEFAULT 0,
  min_order_qty numeric NOT NULL DEFAULT 0,
  lead_time_days integer NOT NULL DEFAULT 0,
  valid_from date,
  valid_to date,
  notes text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_vendor_rc_vendor ON public.inv_vendor_rate_cards(vendor_id);
CREATE INDEX idx_inv_vendor_rc_item ON public.inv_vendor_rate_cards(item_id);

-- ============================================================
-- 5. WAREHOUSES
-- ============================================================
CREATE TABLE public.inv_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_code text NOT NULL UNIQUE,
  name text NOT NULL,
  in_charge_candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  phone text NOT NULL DEFAULT '',
  address1 text NOT NULL DEFAULT '',
  address2 text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  pincode text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT 'India',
  notes text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. PURCHASE ORDERS (vendor PO and internal branch indent)
-- ============================================================
CREATE TABLE public.inv_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL UNIQUE,
  po_type text NOT NULL DEFAULT 'vendor',           -- vendor | internal
  -- vendor PO fields
  vendor_id uuid REFERENCES public.inv_vendors(id) ON DELETE RESTRICT,
  destination_warehouse_id uuid REFERENCES public.inv_warehouses(id) ON DELETE RESTRICT,
  -- internal indent fields (branch -> warehouse)
  source_warehouse_id uuid REFERENCES public.inv_warehouses(id) ON DELETE RESTRICT,
  requesting_branch_id uuid REFERENCES public.branches(id) ON DELETE RESTRICT,
  -- common
  po_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_date date,
  status text NOT NULL DEFAULT 'draft',             -- draft|sent|partially_received|received|closed|cancelled
  subtotal numeric NOT NULL DEFAULT 0,
  tax_total numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  requires_approval boolean NOT NULL DEFAULT false,
  approval_status text NOT NULL DEFAULT 'not_required',  -- not_required|pending|approved|rejected
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_po_status ON public.inv_purchase_orders(status);
CREATE INDEX idx_inv_po_vendor ON public.inv_purchase_orders(vendor_id);
CREATE INDEX idx_inv_po_branch ON public.inv_purchase_orders(requesting_branch_id);

CREATE TABLE public.inv_po_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.inv_purchase_orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inv_items(id) ON DELETE RESTRICT,
  size_value text NOT NULL DEFAULT '',
  ordered_qty numeric NOT NULL DEFAULT 0,
  received_qty numeric NOT NULL DEFAULT 0,
  accepted_qty numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  tax_percent numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_po_lines_po ON public.inv_po_lines(po_id);

-- ============================================================
-- 7. GOODS RECEIPTS (Delivery Challans inbound from vendor)
-- ============================================================
CREATE TABLE public.inv_goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number text NOT NULL UNIQUE,
  po_id uuid REFERENCES public.inv_purchase_orders(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.inv_vendors(id) ON DELETE SET NULL,
  warehouse_id uuid NOT NULL REFERENCES public.inv_warehouses(id) ON DELETE RESTRICT,
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  vendor_challan_number text NOT NULL DEFAULT '',
  vendor_invoice_number text NOT NULL DEFAULT '',
  vehicle_number text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',             -- draft|received|cancelled
  notes text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,   -- challan / invoice photos
  received_by uuid,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_grn_po ON public.inv_goods_receipts(po_id);
CREATE INDEX idx_inv_grn_warehouse ON public.inv_goods_receipts(warehouse_id);

CREATE TABLE public.inv_goods_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id uuid NOT NULL REFERENCES public.inv_goods_receipts(id) ON DELETE CASCADE,
  po_line_id uuid REFERENCES public.inv_po_lines(id) ON DELETE SET NULL,
  item_id uuid NOT NULL REFERENCES public.inv_items(id) ON DELETE RESTRICT,
  size_value text NOT NULL DEFAULT '',
  ordered_qty numeric NOT NULL DEFAULT 0,
  received_qty numeric NOT NULL DEFAULT 0,
  accepted_qty numeric NOT NULL DEFAULT 0,
  rejected_qty numeric NOT NULL DEFAULT 0,
  rejection_reason text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_grn_lines_grn ON public.inv_goods_receipt_lines(grn_id);

-- ============================================================
-- 8. INTERNAL TRANSFERS (Warehouse <-> Branch)
-- ============================================================
CREATE TABLE public.inv_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number text NOT NULL UNIQUE,
  source_type text NOT NULL,                       -- warehouse | branch
  source_id uuid NOT NULL,                         -- warehouse_id or branch_id
  destination_type text NOT NULL,                  -- warehouse | branch
  destination_id uuid NOT NULL,
  linked_po_id uuid REFERENCES public.inv_purchase_orders(id) ON DELETE SET NULL,
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft',            -- draft|dispatched|received|cancelled
  vehicle_number text NOT NULL DEFAULT '',
  driver_name text NOT NULL DEFAULT '',
  driver_phone text NOT NULL DEFAULT '',
  dispatched_by uuid,
  dispatched_at timestamptz,
  received_by uuid,
  received_at timestamptz,
  acknowledgement jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {signature_url, photo_url}
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_transfers_status ON public.inv_transfers(status);
CREATE INDEX idx_inv_transfers_source ON public.inv_transfers(source_type, source_id);
CREATE INDEX idx_inv_transfers_dest ON public.inv_transfers(destination_type, destination_id);

CREATE TABLE public.inv_transfer_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.inv_transfers(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inv_items(id) ON DELETE RESTRICT,
  size_value text NOT NULL DEFAULT '',
  dispatched_qty numeric NOT NULL DEFAULT 0,
  received_qty numeric NOT NULL DEFAULT 0,
  variance_reason text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_transfer_lines_transfer ON public.inv_transfer_lines(transfer_id);

-- ============================================================
-- 9. ISSUANCES (Branch -> FO, FO -> Guard, and returns in reverse)
-- ============================================================
CREATE TABLE public.inv_issuances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuance_number text NOT NULL UNIQUE,
  issuance_type text NOT NULL,                     -- issue_to_fo|issue_to_guard|return_from_guard|return_from_fo
  source_type text NOT NULL,                       -- branch | field_officer | guard
  source_id uuid NOT NULL,
  destination_type text NOT NULL,                  -- field_officer | guard | branch | warehouse
  destination_id uuid NOT NULL,
  issuance_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft',            -- draft|issued|acknowledged|cancelled
  issued_by uuid,
  issued_at timestamptz,
  acknowledged_at timestamptz,
  ack_method text NOT NULL DEFAULT '',             -- signature|otp|photo
  ack_signature_url text NOT NULL DEFAULT '',
  ack_photo_url text NOT NULL DEFAULT '',
  ack_otp_verified boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_iss_status ON public.inv_issuances(status);
CREATE INDEX idx_inv_iss_source ON public.inv_issuances(source_type, source_id);
CREATE INDEX idx_inv_iss_dest ON public.inv_issuances(destination_type, destination_id);

CREATE TABLE public.inv_issuance_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuance_id uuid NOT NULL REFERENCES public.inv_issuances(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inv_items(id) ON DELETE RESTRICT,
  size_value text NOT NULL DEFAULT '',
  qty numeric NOT NULL DEFAULT 0,
  condition text NOT NULL DEFAULT 'new',           -- new|used|damaged
  notes text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_iss_lines_iss ON public.inv_issuance_lines(issuance_id);

-- ============================================================
-- 10. STOCK LEDGER (append-only) + BALANCES (live counts)
-- ============================================================
CREATE TABLE public.inv_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_date timestamptz NOT NULL DEFAULT now(),
  movement_type text NOT NULL,
  -- types: GRN_IN, TRANSFER_OUT, TRANSFER_IN, ISSUE_TO_FO, ISSUE_TO_GUARD,
  --        RETURN_FROM_GUARD, RETURN_FROM_FO, RETURN_TO_WAREHOUSE,
  --        ADJUSTMENT_PLUS, ADJUSTMENT_MINUS, WRITE_OFF
  location_type text NOT NULL,                     -- warehouse|branch|field_officer|guard|in_transit|scrap
  location_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.inv_items(id) ON DELETE RESTRICT,
  size_value text NOT NULL DEFAULT '',
  qty_change numeric NOT NULL,                     -- positive or negative
  reference_type text NOT NULL DEFAULT '',         -- po|grn|transfer|issuance|adjustment|writeoff
  reference_id uuid,
  notes text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_sm_location ON public.inv_stock_movements(location_type, location_id);
CREATE INDEX idx_inv_sm_item ON public.inv_stock_movements(item_id);
CREATE INDEX idx_inv_sm_reference ON public.inv_stock_movements(reference_type, reference_id);
CREATE INDEX idx_inv_sm_date ON public.inv_stock_movements(movement_date);

CREATE TABLE public.inv_stock_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_type text NOT NULL,
  location_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.inv_items(id) ON DELETE CASCADE,
  size_value text NOT NULL DEFAULT '',
  qty numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_type, location_id, item_id, size_value)
);
CREATE INDEX idx_inv_sb_location ON public.inv_stock_balances(location_type, location_id);
CREATE INDEX idx_inv_sb_item ON public.inv_stock_balances(item_id);

-- Trigger: keep inv_stock_balances in sync with every ledger insert
CREATE OR REPLACE FUNCTION public.inv_apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.inv_stock_balances (location_type, location_id, item_id, size_value, qty, updated_at)
  VALUES (NEW.location_type, NEW.location_id, NEW.item_id, COALESCE(NEW.size_value, ''), NEW.qty_change, now())
  ON CONFLICT (location_type, location_id, item_id, size_value)
  DO UPDATE SET qty = public.inv_stock_balances.qty + EXCLUDED.qty,
                updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inv_apply_stock_movement
AFTER INSERT ON public.inv_stock_movements
FOR EACH ROW EXECUTE FUNCTION public.inv_apply_stock_movement();

-- ============================================================
-- 11. ADJUSTMENTS & WRITE-OFFS
-- ============================================================
CREATE TABLE public.inv_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_number text NOT NULL UNIQUE,
  adjustment_date date NOT NULL DEFAULT CURRENT_DATE,
  location_type text NOT NULL,
  location_id uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',            -- draft|approved|rejected|cancelled
  approved_by uuid,
  approved_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.inv_adjustment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id uuid NOT NULL REFERENCES public.inv_adjustments(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inv_items(id) ON DELETE RESTRICT,
  size_value text NOT NULL DEFAULT '',
  qty_change numeric NOT NULL DEFAULT 0,           -- positive or negative
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_adj_lines_adj ON public.inv_adjustment_lines(adjustment_id);

CREATE TABLE public.inv_write_offs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  writeoff_number text NOT NULL UNIQUE,
  writeoff_date date NOT NULL DEFAULT CURRENT_DATE,
  location_type text NOT NULL,
  location_id uuid NOT NULL,
  reason text NOT NULL DEFAULT 'damaged',           -- damaged|lost|expired|other
  responsible_candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  recovery_amount numeric NOT NULL DEFAULT 0,
  recovery_via_payroll boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',            -- draft|approved|rejected|cancelled
  approved_by uuid,
  approved_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.inv_write_off_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  writeoff_id uuid NOT NULL REFERENCES public.inv_write_offs(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inv_items(id) ON DELETE RESTRICT,
  size_value text NOT NULL DEFAULT '',
  qty numeric NOT NULL DEFAULT 0,
  unit_value numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_wo_lines_wo ON public.inv_write_off_lines(writeoff_id);

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE TRIGGER trg_inv_cat_upd BEFORE UPDATE ON public.inv_item_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_size_upd BEFORE UPDATE ON public.inv_size_charts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_items_upd BEFORE UPDATE ON public.inv_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_isizes_upd BEFORE UPDATE ON public.inv_item_sizes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_vendors_upd BEFORE UPDATE ON public.inv_vendors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_vrc_upd BEFORE UPDATE ON public.inv_vendor_rate_cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_wh_upd BEFORE UPDATE ON public.inv_warehouses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_po_upd BEFORE UPDATE ON public.inv_purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_pol_upd BEFORE UPDATE ON public.inv_po_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_grn_upd BEFORE UPDATE ON public.inv_goods_receipts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_grnl_upd BEFORE UPDATE ON public.inv_goods_receipt_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_tr_upd BEFORE UPDATE ON public.inv_transfers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_trl_upd BEFORE UPDATE ON public.inv_transfer_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_iss_upd BEFORE UPDATE ON public.inv_issuances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_issl_upd BEFORE UPDATE ON public.inv_issuance_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_adj_upd BEFORE UPDATE ON public.inv_adjustments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_wo_upd BEFORE UPDATE ON public.inv_write_offs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- RLS — mirror existing admin-console pattern (authenticated full access)
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'inv_item_categories','inv_size_charts','inv_items','inv_item_sizes',
    'inv_vendors','inv_vendor_rate_cards','inv_warehouses',
    'inv_purchase_orders','inv_po_lines',
    'inv_goods_receipts','inv_goods_receipt_lines',
    'inv_transfers','inv_transfer_lines',
    'inv_issuances','inv_issuance_lines',
    'inv_stock_movements','inv_stock_balances',
    'inv_adjustments','inv_adjustment_lines',
    'inv_write_offs','inv_write_off_lines'
  ]) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Authenticated read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "Authenticated write %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Authenticated update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Authenticated delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (true)', t);
  END LOOP;
END $$;

-- ============================================================
-- Seed: default item categories and size charts
-- ============================================================
INSERT INTO public.inv_item_categories (name, sort_order) VALUES
  ('Uniform', 10),
  ('Accessories', 20),
  ('Equipment', 30),
  ('Consumables', 40),
  ('Other', 99);

INSERT INTO public.inv_size_charts (name, size_type, values) VALUES
  ('Uniform Letters', 'letter', '["XS","S","M","L","XL","XXL","XXXL"]'::jsonb),
  ('Shoe IN', 'number', '["5","6","7","8","9","10","11","12"]'::jsonb),
  ('Free Text', 'free', '[]'::jsonb);

-- Seed: one default warehouse so the rest of the system has somewhere to put stock
INSERT INTO public.inv_warehouses (warehouse_code, name, is_default, city, state, country)
VALUES ('WH-001', 'Main Warehouse', true, '', '', 'India');
