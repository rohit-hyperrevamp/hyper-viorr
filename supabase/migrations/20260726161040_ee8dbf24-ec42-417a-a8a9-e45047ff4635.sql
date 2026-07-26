
CREATE TABLE public.self_attendance_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  punch_date date NOT NULL,
  check_in_at timestamptz,
  check_in_lat numeric(10,7),
  check_in_lng numeric(10,7),
  check_in_accuracy numeric(10,2),
  check_in_face_verified boolean NOT NULL DEFAULT false,
  check_out_at timestamptz,
  check_out_lat numeric(10,7),
  check_out_lng numeric(10,7),
  check_out_accuracy numeric(10,2),
  check_out_face_verified boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, punch_date)
);

CREATE INDEX self_att_candidate_date_idx ON public.self_attendance_punches (candidate_id, punch_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.self_attendance_punches TO authenticated;
GRANT ALL ON public.self_attendance_punches TO service_role;

ALTER TABLE public.self_attendance_punches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "self_att_own_select"
  ON public.self_attendance_punches
  FOR SELECT
  TO authenticated
  USING (
    candidate_id = public.current_user_candidate_id()
    OR public.is_admin_user()
    OR public.current_user_role_key() IN ('hr','leadership','admin','super_admin','branch_manager')
  );

CREATE POLICY "self_att_own_insert"
  ON public.self_attendance_punches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    candidate_id = public.current_user_candidate_id()
    OR public.is_admin_user()
  );

CREATE POLICY "self_att_own_update"
  ON public.self_attendance_punches
  FOR UPDATE
  TO authenticated
  USING (
    candidate_id = public.current_user_candidate_id()
    OR public.is_admin_user()
  )
  WITH CHECK (
    candidate_id = public.current_user_candidate_id()
    OR public.is_admin_user()
  );

CREATE POLICY "self_att_admin_delete"
  ON public.self_attendance_punches
  FOR DELETE
  TO authenticated
  USING (public.is_admin_user());

CREATE TRIGGER self_att_set_updated_at
  BEFORE UPDATE ON public.self_attendance_punches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
