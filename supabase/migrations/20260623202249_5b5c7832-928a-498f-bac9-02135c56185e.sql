
ALTER TABLE public.allowance_types
  ADD COLUMN IF NOT EXISTS include_in_ot boolean NOT NULL DEFAULT true;

UPDATE public.allowance_types
  SET include_in_ot = false
  WHERE name ~* 'uniform' OR display_name ~* 'uniform' OR short_name ~* 'uniform';

ALTER TABLE public.cost_components
  ADD COLUMN IF NOT EXISTS deduction_calc_type text NOT NULL DEFAULT 'earned_salary';

ALTER TABLE public.cost_components
  DROP CONSTRAINT IF EXISTS cost_components_deduction_calc_type_check;
ALTER TABLE public.cost_components
  ADD CONSTRAINT cost_components_deduction_calc_type_check
  CHECK (deduction_calc_type IN ('earned_salary','fixed_amount'));

UPDATE public.cost_components
  SET deduction_calc_type = 'fixed_amount'
  WHERE name ~* 'uniform' OR name ~* '\mlwf\M' OR name ~* 'labour\s*welfare';
