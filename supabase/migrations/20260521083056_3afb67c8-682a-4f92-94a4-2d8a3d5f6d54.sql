
ALTER TABLE public.vehicle_fuel_entries
  ADD COLUMN IF NOT EXISTS expense_type text NOT NULL DEFAULT 'fuel',
  ADD COLUMN IF NOT EXISTS filling_photo_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];
