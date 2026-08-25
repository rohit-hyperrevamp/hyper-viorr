ALTER TABLE public.contract_resources
  ADD COLUMN IF NOT EXISTS payroll_day_base_id uuid,
  ADD COLUMN IF NOT EXISTS benefits jsonb NOT NULL DEFAULT '[]'::jsonb;