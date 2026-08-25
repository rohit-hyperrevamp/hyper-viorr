ALTER TABLE public.deductions
  ADD COLUMN IF NOT EXISTS min_duty numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_duty numeric(6,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.deductions.min_duty IS 'Minimum payroll duty count required to apply this deduction in a month. If duties earned < min_duty, the deduction is skipped and carried forward to the next month.';
COMMENT ON COLUMN public.deductions.max_duty IS 'Optional upper cap on duties considered for this deduction. 0 = no cap.';