ALTER TABLE public.candidates
  DROP COLUMN IF EXISTS permanent_address,
  DROP COLUMN IF EXISTS present_address;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS permanent_address1 text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS permanent_address2 text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS permanent_landmark  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS permanent_pincode   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS permanent_city      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS permanent_district  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS permanent_state     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS permanent_country   text NOT NULL DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS present_address1    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS present_address2    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS present_landmark    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS present_pincode     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS present_city        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS present_district    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS present_state       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS present_country     text NOT NULL DEFAULT 'India';