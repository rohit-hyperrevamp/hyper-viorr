CREATE TABLE public.policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  policy_number text NOT NULL DEFAULT '',
  start_date date,
  end_date date,
  document_path text,
  document_name text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.policies TO authenticated;
GRANT ALL ON public.policies TO service_role;

ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read policies" ON public.policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write policies" ON public.policies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update policies" ON public.policies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete policies" ON public.policies FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_policies_updated_at
BEFORE UPDATE ON public.policies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.policies (name, provider, description, policy_number, end_date) VALUES
  ('Policy Staff', '', 'Addition / Deletion in existing Policy', '215037/51/26/000084', '2027-01-22'),
  ('Policy Director', '', 'Addition / Deletion in existing Policy', '215037/51/26/000085', '2027-01-22'),
  ('Policy Guard', '', 'Addition / Deletion in existing Policy', '215037/51/26/000086', '2027-01-22');