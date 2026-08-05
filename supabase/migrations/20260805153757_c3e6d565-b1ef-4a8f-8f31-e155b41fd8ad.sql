CREATE TABLE public.ip_access_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT '',
  ip_cidr text NOT NULL,
  mode text NOT NULL DEFAULT 'allow' CHECK (mode IN ('allow','deny')),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ip_access_rules TO authenticated;
GRANT ALL ON public.ip_access_rules TO service_role;

ALTER TABLE public.ip_access_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view ip rules"
  ON public.ip_access_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert ip rules"
  ON public.ip_access_rules FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins can update ip rules"
  ON public.ip_access_rules FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins can delete ip rules"
  ON public.ip_access_rules FOR DELETE TO authenticated USING (public.is_admin_user());

CREATE TRIGGER set_ip_access_rules_updated_at
  BEFORE UPDATE ON public.ip_access_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();