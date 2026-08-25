ALTER TABLE public.inv_items
  ADD COLUMN IF NOT EXISTS standard_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_purchase_price numeric,
  ADD COLUMN IF NOT EXISTS last_purchase_vendor_id uuid,
  ADD COLUMN IF NOT EXISTS last_purchase_at timestamptz;