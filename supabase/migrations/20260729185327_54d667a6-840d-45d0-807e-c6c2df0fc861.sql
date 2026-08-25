ALTER TABLE public.rehire_requests
  ADD COLUMN IF NOT EXISTS role_key text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS designation_id uuid REFERENCES public.designations(id);