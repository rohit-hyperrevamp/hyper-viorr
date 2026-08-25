
-- Formula versioning + advanced mode on master tables
ALTER TABLE public.allowance_types
  ADD COLUMN IF NOT EXISTS formula_mode text NOT NULL DEFAULT 'preset',
  ADD COLUMN IF NOT EXISTS formula_expression text,
  ADD COLUMN IF NOT EXISTS formula_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.cost_components
  ADD COLUMN IF NOT EXISTS formula_mode text NOT NULL DEFAULT 'preset',
  ADD COLUMN IF NOT EXISTS formula_expression text,
  ADD COLUMN IF NOT EXISTS formula_version integer NOT NULL DEFAULT 1;

-- Additions: days × per-day mode + day-impact toggle
ALTER TABLE public.additions
  ADD COLUMN IF NOT EXISTS entry_mode text NOT NULL DEFAULT 'lumpsum',
  ADD COLUMN IF NOT EXISTS days numeric,
  ADD COLUMN IF NOT EXISTS per_day_amount numeric,
  ADD COLUMN IF NOT EXISTS include_in_total_days boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS affects_days_for text[] NOT NULL DEFAULT '{}'::text[];

-- Deductions: same shape
ALTER TABLE public.deductions
  ADD COLUMN IF NOT EXISTS entry_mode text NOT NULL DEFAULT 'lumpsum',
  ADD COLUMN IF NOT EXISTS days numeric,
  ADD COLUMN IF NOT EXISTS per_day_amount numeric,
  ADD COLUMN IF NOT EXISTS include_in_total_days boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS affects_days_for text[] NOT NULL DEFAULT '{}'::text[];

-- Helpful checks (use triggers-free CHECK since values are static enums)
ALTER TABLE public.additions DROP CONSTRAINT IF EXISTS additions_entry_mode_chk;
ALTER TABLE public.additions ADD CONSTRAINT additions_entry_mode_chk CHECK (entry_mode IN ('lumpsum','days_x_per_day'));
ALTER TABLE public.deductions DROP CONSTRAINT IF EXISTS deductions_entry_mode_chk;
ALTER TABLE public.deductions ADD CONSTRAINT deductions_entry_mode_chk CHECK (entry_mode IN ('lumpsum','days_x_per_day'));

ALTER TABLE public.allowance_types DROP CONSTRAINT IF EXISTS allowance_types_formula_mode_chk;
ALTER TABLE public.allowance_types ADD CONSTRAINT allowance_types_formula_mode_chk CHECK (formula_mode IN ('preset','advanced'));
ALTER TABLE public.cost_components DROP CONSTRAINT IF EXISTS cost_components_formula_mode_chk;
ALTER TABLE public.cost_components ADD CONSTRAINT cost_components_formula_mode_chk CHECK (formula_mode IN ('preset','advanced'));
