ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS recruitment_fee_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recruitment_fee_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gpaip_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gpaip_amount numeric NOT NULL DEFAULT 0;