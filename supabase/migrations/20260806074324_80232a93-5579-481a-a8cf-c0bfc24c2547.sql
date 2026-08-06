ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS sum_assured numeric,
  ADD COLUMN IF NOT EXISTS additional_cover numeric,
  ADD COLUMN IF NOT EXISTS ttd_enabled boolean NOT NULL DEFAULT false;