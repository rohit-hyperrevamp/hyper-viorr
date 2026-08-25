ALTER TABLE public.attendance_codes
  ADD COLUMN IF NOT EXISTS day_value NUMERIC(4,2) NOT NULL DEFAULT 1.0;

-- Backfill: half-day codes = 0.5, weekly-off = 0, everything else keeps default 1.0
UPDATE public.attendance_codes SET day_value = 0.5 WHERE upper(code) IN ('HD','HALF','HALFDAY');
UPDATE public.attendance_codes SET day_value = 0   WHERE upper(code) IN ('WO','A','AB','ABSENT') AND is_paid = false AND counts_as_present = false;