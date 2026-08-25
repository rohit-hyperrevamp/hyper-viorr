
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS offboarding_reason_id uuid,
  ADD COLUMN IF NOT EXISTS offboarded_at timestamptz;

UPDATE public.candidates SET status = 'inactive' WHERE status = 'offboarded';
