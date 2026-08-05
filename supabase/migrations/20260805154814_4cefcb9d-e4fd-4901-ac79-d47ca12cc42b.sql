CREATE TABLE public.geo_access_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  country_name text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT 'allow',
  is_active boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_access_rules_mode_chk CHECK (mode IN ('allow','deny')),
  CONSTRAINT geo_access_rules_code_uniq UNIQUE (country_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.geo_access_rules TO authenticated;
GRANT ALL ON public.geo_access_rules TO service_role;

ALTER TABLE public.geo_access_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view geo rules" ON public.geo_access_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert geo rules" ON public.geo_access_rules FOR INSERT TO authenticated WITH CHECK (is_admin_user());
CREATE POLICY "Admins can update geo rules" ON public.geo_access_rules FOR UPDATE TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());
CREATE POLICY "Admins can delete geo rules" ON public.geo_access_rules FOR DELETE TO authenticated USING (is_admin_user());

CREATE TRIGGER set_geo_access_rules_updated_at BEFORE UPDATE ON public.geo_access_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();