ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS epf_cap_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.units.epf_cap_enabled IS 'When true, EPF wage ceiling (Rs 15,000) applies and attendance is limited to the contract payroll-day count. When false (no cap), EPF is computed on full wages and Present days are not limited by payroll days.';