
-- 1. Add designation_id to attendance_entries
ALTER TABLE public.attendance_entries
  ADD COLUMN IF NOT EXISTS designation_id uuid REFERENCES public.designations(id);

-- 2. Backfill from candidate's primary designation
UPDATE public.attendance_entries ae
SET designation_id = c.designation_id
FROM public.candidates c
WHERE ae.candidate_id = c.id
  AND ae.designation_id IS NULL
  AND c.designation_id IS NOT NULL;

-- 3. Replace unique constraint
ALTER TABLE public.attendance_entries
  DROP CONSTRAINT IF EXISTS attendance_entries_unit_id_candidate_id_entry_date_key;

-- Partial unique index allowing NULL designation_id rows (legacy) by treating NULL as a sentinel.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_entries_unit_cand_desig_date_key
  ON public.attendance_entries (unit_id, candidate_id, COALESCE(designation_id, '00000000-0000-0000-0000-000000000000'::uuid), entry_date);

-- 4. Future-date guard trigger
CREATE OR REPLACE FUNCTION public.attendance_entries_no_future()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.entry_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Attendance cannot be marked for future date %', NEW.entry_date
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_entries_no_future ON public.attendance_entries;
CREATE TRIGGER trg_attendance_entries_no_future
  BEFORE INSERT OR UPDATE ON public.attendance_entries
  FOR EACH ROW EXECUTE FUNCTION public.attendance_entries_no_future();
