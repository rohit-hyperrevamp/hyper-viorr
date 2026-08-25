
CREATE TABLE IF NOT EXISTS public.attendance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  entry_date date NOT NULL,
  code text NOT NULL DEFAULT '',
  ot_hours numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, candidate_id, entry_date)
);

ALTER TABLE public.attendance_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read attendance_entries" ON public.attendance_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write attendance_entries" ON public.attendance_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update attendance_entries" ON public.attendance_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete attendance_entries" ON public.attendance_entries FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_attendance_entries_unit_date ON public.attendance_entries(unit_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_attendance_entries_candidate_date ON public.attendance_entries(candidate_id, entry_date);

CREATE TRIGGER attendance_entries_set_updated_at
BEFORE UPDATE ON public.attendance_entries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
