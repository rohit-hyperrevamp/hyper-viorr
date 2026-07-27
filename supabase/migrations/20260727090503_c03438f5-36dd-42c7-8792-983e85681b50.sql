
CREATE TABLE public.field_visit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'emergency' CHECK (priority IN ('emergency','high','normal')),
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','acknowledged','completed','cancelled')),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  visit_id uuid REFERENCES public.field_visits(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX field_visit_requests_candidate_status_idx
  ON public.field_visit_requests (candidate_id, status, created_at DESC);
CREATE INDEX field_visit_requests_unit_idx
  ON public.field_visit_requests (unit_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_visit_requests TO authenticated;
GRANT ALL ON public.field_visit_requests TO service_role;

ALTER TABLE public.field_visit_requests ENABLE ROW LEVEL SECURITY;

-- Admins / HR / leadership / organizations-edit can do everything
CREATE POLICY "fvr admins manage all"
  ON public.field_visit_requests
  FOR ALL
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.current_user_role_key() IN ('hr','leadership','admin','super_admin')
    OR public.current_user_can_edit_organizations()
  )
  WITH CHECK (
    public.is_admin_user()
    OR public.current_user_role_key() IN ('hr','leadership','admin','super_admin')
    OR public.current_user_can_edit_organizations()
  );

-- Assigned FO can view their own requests
CREATE POLICY "fvr fo view own"
  ON public.field_visit_requests
  FOR SELECT
  TO authenticated
  USING (candidate_id = public.current_user_candidate_id());

-- Assigned FO can update their own requests (acknowledge / complete)
CREATE POLICY "fvr fo update own"
  ON public.field_visit_requests
  FOR UPDATE
  TO authenticated
  USING (candidate_id = public.current_user_candidate_id())
  WITH CHECK (candidate_id = public.current_user_candidate_id());

CREATE TRIGGER field_visit_requests_set_updated_at
  BEFORE UPDATE ON public.field_visit_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.field_visit_requests;
