ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS bonus_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bonus_frequency text;

ALTER TABLE public.units
  ADD CONSTRAINT units_bonus_frequency_check
  CHECK (bonus_frequency IS NULL OR bonus_frequency IN ('monthly','yearly','on_reimbursement'));