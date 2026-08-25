
ALTER TABLE public.allowance_types
  ADD COLUMN IF NOT EXISTS calc_type text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS percentage numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_components jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cap_amount numeric;
