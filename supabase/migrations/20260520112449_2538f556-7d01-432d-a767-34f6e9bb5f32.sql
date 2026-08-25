ALTER TABLE public.vehicle_fastags
  ADD COLUMN IF NOT EXISTS login_type text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS login_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS login_password text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS registered_email text NOT NULL DEFAULT '';