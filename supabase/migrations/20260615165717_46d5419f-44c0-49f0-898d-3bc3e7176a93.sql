ALTER TABLE public.client_contracts
  ADD COLUMN IF NOT EXISTS original_start_date date,
  ADD COLUMN IF NOT EXISTS renewal_count integer NOT NULL DEFAULT 0;

-- Backfill original_start_date with start_date for existing rows
UPDATE public.client_contracts
  SET original_start_date = start_date
  WHERE original_start_date IS NULL AND start_date IS NOT NULL;