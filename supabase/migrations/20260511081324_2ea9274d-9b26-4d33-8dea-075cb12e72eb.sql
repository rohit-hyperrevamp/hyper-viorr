ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS security_service_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS security_service_mobile text NOT NULL DEFAULT '';