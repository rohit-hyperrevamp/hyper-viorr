ALTER TABLE public.cost_components ADD COLUMN IF NOT EXISTS cap_flat_amount numeric;
ALTER TABLE public.allowance_types ADD COLUMN IF NOT EXISTS cap_flat_amount numeric;
UPDATE public.cost_components SET cap_flat_amount = ROUND((COALESCE(percentage,0)/100.0) * cap_amount) WHERE cap_amount IS NOT NULL AND cap_amount > 0 AND cap_flat_amount IS NULL;
UPDATE public.allowance_types SET cap_flat_amount = ROUND((COALESCE(percentage,0)/100.0) * cap_amount) WHERE cap_amount IS NOT NULL AND cap_amount > 0 AND cap_flat_amount IS NULL;