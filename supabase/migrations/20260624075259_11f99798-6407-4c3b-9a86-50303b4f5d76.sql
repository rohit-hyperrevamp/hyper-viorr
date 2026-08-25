
ALTER TABLE public.cost_components
  ADD COLUMN IF NOT EXISTS fixed_calc_method text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS fixed_duty_components text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.cost_components
  DROP CONSTRAINT IF EXISTS cost_components_fixed_calc_method_check;
ALTER TABLE public.cost_components
  ADD CONSTRAINT cost_components_fixed_calc_method_check
  CHECK (fixed_calc_method IN ('flat','per_duty'));
