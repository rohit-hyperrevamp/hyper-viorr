ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS onboarding_details jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_candidates_onboarding_pending_fo
  ON public.candidates ((onboarding_details->>'pending_issuance_fo_id'))
  WHERE onboarding_details->>'issuance_status' = 'pending';