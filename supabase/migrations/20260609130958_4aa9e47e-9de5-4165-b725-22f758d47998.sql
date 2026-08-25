
-- Replace expression index with a proper unique constraint that PostgREST upsert can target.
-- NULLS NOT DISTINCT (Postgres 15+) treats NULL designation_id as equal so legacy NULL rows
-- still cannot duplicate.
DROP INDEX IF EXISTS public.attendance_entries_unit_cand_desig_date_key;

ALTER TABLE public.attendance_entries
  DROP CONSTRAINT IF EXISTS attendance_entries_unit_cand_desig_date_unique;

ALTER TABLE public.attendance_entries
  ADD CONSTRAINT attendance_entries_unit_cand_desig_date_unique
  UNIQUE NULLS NOT DISTINCT (unit_id, candidate_id, designation_id, entry_date);
