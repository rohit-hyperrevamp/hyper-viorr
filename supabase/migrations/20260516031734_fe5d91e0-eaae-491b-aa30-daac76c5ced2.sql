
CREATE TABLE public.candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  aadhaar_number TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  aadhaar_image_url TEXT NOT NULL DEFAULT '',
  signature_url TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL DEFAULT '',
  date_of_birth DATE,
  gender TEXT NOT NULL DEFAULT '',
  religion TEXT NOT NULL DEFAULT '',
  caste_category TEXT NOT NULL DEFAULT '',
  marital_status TEXT NOT NULL DEFAULT '',
  birthplace TEXT NOT NULL DEFAULT '',
  mobile TEXT NOT NULL DEFAULT '',
  alt_mobile TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  permanent_address TEXT NOT NULL DEFAULT '',
  present_address TEXT NOT NULL DEFAULT '',
  same_as_permanent BOOLEAN NOT NULL DEFAULT true,
  permanent_police_station TEXT NOT NULL DEFAULT '',
  present_police_station TEXT NOT NULL DEFAULT '',
  application_date DATE NOT NULL DEFAULT CURRENT_DATE,
  preferred_joining_date DATE,
  unit_id UUID,
  designation_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read candidates" ON public.candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write candidates" ON public.candidates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update candidates" ON public.candidates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete candidates" ON public.candidates FOR DELETE TO authenticated USING (true);

CREATE TRIGGER candidates_set_updated_at BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_candidates_unit ON public.candidates(unit_id);
CREATE INDEX idx_candidates_designation ON public.candidates(designation_id);
CREATE INDEX idx_candidates_aadhaar ON public.candidates(aadhaar_number);

INSERT INTO storage.buckets (id, name, public) VALUES ('candidate-files', 'candidate-files', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Candidate files public read" ON storage.objects FOR SELECT USING (bucket_id = 'candidate-files');
CREATE POLICY "Candidate files auth insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'candidate-files');
CREATE POLICY "Candidate files auth update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'candidate-files');
CREATE POLICY "Candidate files auth delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'candidate-files');
