CREATE OR REPLACE FUNCTION public.enforce_reliever_extra_duty_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.candidate_units cu
    WHERE cu.candidate_id = NEW.candidate_id
      AND cu.unit_id = NEW.unit_id
      AND cu.is_reliever = true
  ) THEN
    NEW.code := '';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_entries_reliever_ed_only ON public.attendance_entries;
CREATE TRIGGER attendance_entries_reliever_ed_only
BEFORE INSERT OR UPDATE OF candidate_id, unit_id, code ON public.attendance_entries
FOR EACH ROW
EXECUTE FUNCTION public.enforce_reliever_extra_duty_only();

UPDATE public.attendance_entries ae
SET code = ''
FROM public.candidate_units cu
WHERE cu.candidate_id = ae.candidate_id
  AND cu.unit_id = ae.unit_id
  AND cu.is_reliever = true
  AND coalesce(ae.code, '') <> '';