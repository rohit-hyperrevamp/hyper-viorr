ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS esic_card_url text,
  ADD COLUMN IF NOT EXISTS esic_card_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS esic_card_uploaded_by uuid;