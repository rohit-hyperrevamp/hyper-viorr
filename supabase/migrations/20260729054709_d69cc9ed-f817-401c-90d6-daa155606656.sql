ALTER TABLE public.deductions
  ADD COLUMN IF NOT EXISTS emi_group_id uuid,
  ADD COLUMN IF NOT EXISTS emi_index integer,
  ADD COLUMN IF NOT EXISTS emi_total integer;

ALTER TABLE public.deductions DROP CONSTRAINT IF EXISTS deductions_calculation_type_check;
ALTER TABLE public.deductions ADD CONSTRAINT deductions_calculation_type_check
  CHECK (calculation_type = ANY (ARRAY['lumpsum'::text, 'emi'::text, 'per_duty_amount'::text, 'total_amount'::text]));

CREATE INDEX IF NOT EXISTS idx_deductions_emi_group ON public.deductions (emi_group_id);