CREATE TABLE public.esic_branches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location text NOT NULL,
  esic_code text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.esic_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read esic_branches" ON public.esic_branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write esic_branches" ON public.esic_branches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update esic_branches" ON public.esic_branches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete esic_branches" ON public.esic_branches FOR DELETE TO authenticated USING (true);

CREATE TRIGGER esic_branches_set_updated_at
BEFORE UPDATE ON public.esic_branches
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();