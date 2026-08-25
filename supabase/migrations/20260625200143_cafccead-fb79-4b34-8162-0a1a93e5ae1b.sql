ALTER TABLE public.cost_components
  ADD COLUMN IF NOT EXISTS fixed_duty_divisor text
  CHECK (fixed_duty_divisor IS NULL OR fixed_duty_divisor IN ('base_days','days_in_month','payable_days','fixed_26'));