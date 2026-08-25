
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS pan_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pan_image_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account_holder text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_ifsc text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_branch text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_contact_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_contact_relation text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_contact_mobile text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "references" jsonb NOT NULL DEFAULT '[]'::jsonb;
