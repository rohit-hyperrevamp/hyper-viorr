
CREATE TABLE public.candidate_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, unit_id)
);

CREATE INDEX idx_candidate_units_candidate_id ON public.candidate_units(candidate_id);
CREATE INDEX idx_candidate_units_unit_id ON public.candidate_units(unit_id);

ALTER TABLE public.candidate_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read candidate_units" ON public.candidate_units
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write candidate_units" ON public.candidate_units
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update candidate_units" ON public.candidate_units
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete candidate_units" ON public.candidate_units
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_candidate_units_updated_at
  BEFORE UPDATE ON public.candidate_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill from existing single unit_id on candidates
INSERT INTO public.candidate_units (candidate_id, unit_id, is_primary, sort_order)
SELECT id, unit_id, true, 0
FROM public.candidates
WHERE unit_id IS NOT NULL
ON CONFLICT (candidate_id, unit_id) DO NOTHING;
