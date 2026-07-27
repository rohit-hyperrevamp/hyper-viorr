CREATE OR REPLACE FUNCTION public.sync_self_punch_to_attendance_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _designation_id uuid;
  _hours numeric := 0;
  _code text;
  _ot_days numeric := 0;
BEGIN
  IF NEW.unit_id IS NULL OR NEW.candidate_id IS NULL OR NEW.check_in_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.check_out_at IS NULL THEN
    IF NEW.punch_date >= current_date THEN
      RETURN NEW;
    END IF;
    _code := 'A';
  ELSE
    _hours := GREATEST(0, EXTRACT(EPOCH FROM (NEW.check_out_at - NEW.check_in_at))::numeric / 3600);
    IF _hours >= 8 THEN
      _code := 'P';
      _ot_days := ROUND(((GREATEST(0, _hours - 8) / 8) * 2)) / 2;
    ELSIF _hours >= 4 THEN
      _code := 'HD';
    ELSE
      _code := 'A';
    END IF;
  END IF;

  SELECT c.designation_id INTO _designation_id
  FROM public.candidates c
  WHERE c.id = NEW.candidate_id;

  INSERT INTO public.attendance_entries (
    unit_id,
    candidate_id,
    designation_id,
    entry_date,
    code,
    ot_hours
  )
  VALUES (
    NEW.unit_id,
    NEW.candidate_id,
    _designation_id,
    NEW.punch_date,
    _code,
    _ot_days
  )
  ON CONFLICT ON CONSTRAINT attendance_entries_unit_cand_desig_date_unique
  DO UPDATE SET
    code = EXCLUDED.code,
    ot_hours = EXCLUDED.ot_hours,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_self_punch_to_attendance_entry_trigger ON public.self_attendance_punches;
CREATE TRIGGER sync_self_punch_to_attendance_entry_trigger
AFTER INSERT OR UPDATE OF candidate_id, unit_id, punch_date, check_in_at, check_out_at
ON public.self_attendance_punches
FOR EACH ROW
EXECUTE FUNCTION public.sync_self_punch_to_attendance_entry();

INSERT INTO public.attendance_entries (
  unit_id,
  candidate_id,
  designation_id,
  entry_date,
  code,
  ot_hours
)
SELECT
  p.unit_id,
  p.candidate_id,
  c.designation_id,
  p.punch_date,
  CASE
    WHEN p.check_out_at IS NULL THEN 'A'
    WHEN GREATEST(0, EXTRACT(EPOCH FROM (p.check_out_at - p.check_in_at))::numeric / 3600) >= 8 THEN 'P'
    WHEN GREATEST(0, EXTRACT(EPOCH FROM (p.check_out_at - p.check_in_at))::numeric / 3600) >= 4 THEN 'HD'
    ELSE 'A'
  END AS code,
  CASE
    WHEN p.check_out_at IS NOT NULL AND GREATEST(0, EXTRACT(EPOCH FROM (p.check_out_at - p.check_in_at))::numeric / 3600) >= 8
      THEN ROUND(((GREATEST(0, (EXTRACT(EPOCH FROM (p.check_out_at - p.check_in_at))::numeric / 3600) - 8) / 8) * 2)) / 2
    ELSE 0
  END AS ot_hours
FROM public.self_attendance_punches p
JOIN public.candidates c ON c.id = p.candidate_id
WHERE p.unit_id IS NOT NULL
  AND p.check_in_at IS NOT NULL
  AND (p.check_out_at IS NOT NULL OR p.punch_date < current_date)
ON CONFLICT ON CONSTRAINT attendance_entries_unit_cand_desig_date_unique
DO UPDATE SET
  code = EXCLUDED.code,
  ot_hours = EXCLUDED.ot_hours,
  updated_at = now();