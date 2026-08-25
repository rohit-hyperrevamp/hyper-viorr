
-- field_visits
CREATE TABLE public.field_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visit_seq INTEGER NOT NULL DEFAULT 1,
  check_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_in_lat NUMERIC(10,7),
  check_in_lng NUMERIC(10,7),
  check_in_accuracy NUMERIC(10,2),
  check_out_at TIMESTAMPTZ,
  check_out_lat NUMERIC(10,7),
  check_out_lng NUMERIC(10,7),
  visit_notes TEXT,
  customer_rating INTEGER CHECK (customer_rating BETWEEN 1 AND 5),
  client_signature_url TEXT,
  client_photo_url TEXT,
  client_name TEXT,
  distance_from_prev_m INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_visits TO authenticated;
GRANT ALL ON public.field_visits TO service_role;

CREATE INDEX idx_field_visits_candidate_date ON public.field_visits(candidate_id, visit_date DESC);
CREATE INDEX idx_field_visits_unit_date ON public.field_visits(unit_id, visit_date DESC);

ALTER TABLE public.field_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "FO manage own visits"
  ON public.field_visits FOR ALL
  TO authenticated
  USING (candidate_id = public.current_user_candidate_id())
  WITH CHECK (candidate_id = public.current_user_candidate_id());

CREATE POLICY "Admins read all visits"
  ON public.field_visits FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.current_user_role_key() IN ('hr','leadership')
  );

CREATE POLICY "Admins update all visits"
  ON public.field_visits FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.current_user_role_key() IN ('hr','leadership')
  );

CREATE TRIGGER trg_field_visits_updated
  BEFORE UPDATE ON public.field_visits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- field_track_points
CREATE TABLE public.field_track_points (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  track_date DATE NOT NULL DEFAULT CURRENT_DATE,
  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  accuracy NUMERIC(10,2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  visit_id UUID REFERENCES public.field_visits(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.field_track_points TO authenticated;
GRANT ALL ON public.field_track_points TO service_role;

CREATE INDEX idx_field_track_candidate_date ON public.field_track_points(candidate_id, track_date, recorded_at);

ALTER TABLE public.field_track_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "FO manage own tracks"
  ON public.field_track_points FOR ALL
  TO authenticated
  USING (candidate_id = public.current_user_candidate_id())
  WITH CHECK (candidate_id = public.current_user_candidate_id());

CREATE POLICY "Admins read all tracks"
  ON public.field_track_points FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.current_user_role_key() IN ('hr','leadership')
  );
