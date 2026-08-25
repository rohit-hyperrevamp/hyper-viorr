ALTER TABLE public.allowance_types
  ADD COLUMN IF NOT EXISTS fixed_calc_method text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS fixed_duty_components text[] NOT NULL DEFAULT ARRAY['p_days']::text[],
  ADD COLUMN IF NOT EXISTS fixed_duty_divisor text;

ALTER TABLE public.allowance_types
  DROP CONSTRAINT IF EXISTS allowance_types_fixed_calc_method_check;
ALTER TABLE public.allowance_types
  ADD CONSTRAINT allowance_types_fixed_calc_method_check
  CHECK (fixed_calc_method IN ('flat','per_duty'));

ALTER TABLE public.allowance_types
  DROP CONSTRAINT IF EXISTS allowance_types_fixed_duty_divisor_check;
ALTER TABLE public.allowance_types
  ADD CONSTRAINT allowance_types_fixed_duty_divisor_check
  CHECK (fixed_duty_divisor IS NULL OR fixed_duty_divisor IN ('base_days','days_in_month','payable_days','fixed_26'));