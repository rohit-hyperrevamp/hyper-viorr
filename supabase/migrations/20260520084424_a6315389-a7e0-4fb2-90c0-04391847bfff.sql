ALTER TABLE public.client_contracts
  ADD COLUMN IF NOT EXISTS prospect_stage text NOT NULL DEFAULT 'new';

UPDATE public.client_contracts
  SET prospect_stage = 'completed'
  WHERE record_type = 'client';
