ALTER TABLE public.self_attendance_punches
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS self_att_unit_date_idx
  ON public.self_attendance_punches (unit_id, punch_date DESC);