ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS contract_start_date date,
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS gst_payable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_type text;