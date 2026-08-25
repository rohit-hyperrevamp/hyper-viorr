
ALTER TABLE public.inv_purchase_orders
  ADD COLUMN IF NOT EXISTS destination_branch_id uuid REFERENCES public.branches(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_inv_po_dest_branch ON public.inv_purchase_orders(destination_branch_id);

-- Make destination_warehouse_id optional (deliver-to may now be a branch instead)
ALTER TABLE public.inv_purchase_orders
  ALTER COLUMN destination_warehouse_id DROP NOT NULL;
