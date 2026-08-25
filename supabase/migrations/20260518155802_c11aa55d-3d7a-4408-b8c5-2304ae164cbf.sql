ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS assigned_asset_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS no_hire boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offboarding_details jsonb NOT NULL DEFAULT '{}'::jsonb;