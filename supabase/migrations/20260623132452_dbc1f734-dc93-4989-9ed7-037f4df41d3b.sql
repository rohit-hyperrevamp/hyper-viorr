ALTER TABLE public.inv_demands
  ADD COLUMN IF NOT EXISTS fulfillment_source text NOT NULL DEFAULT 'warehouse'
  CHECK (fulfillment_source IN ('warehouse','branch'));