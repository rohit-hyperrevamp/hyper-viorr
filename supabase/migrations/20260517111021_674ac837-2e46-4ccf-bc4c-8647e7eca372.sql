
-- Roles
CREATE TABLE public.roles (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read roles" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write roles" ON public.roles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update roles" ON public.roles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete roles" ON public.roles FOR DELETE TO authenticated USING (true);

CREATE TRIGGER roles_set_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Role permissions
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL REFERENCES public.roles(key) ON DELETE CASCADE,
  module_key text NOT NULL,
  sub_module_key text NOT NULL DEFAULT '',
  can_view boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_key, module_key, sub_module_key)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read role_permissions" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write role_permissions" ON public.role_permissions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update role_permissions" ON public.role_permissions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete role_permissions" ON public.role_permissions FOR DELETE TO authenticated USING (true);

CREATE TRIGGER role_permissions_set_updated_at
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX role_permissions_role_idx ON public.role_permissions (role_key);

-- Seed roles
INSERT INTO public.roles (key, name, description, is_system, sort_order) VALUES
  ('guard',               'Guard',               'Field guard / on-ground personnel.',                    false, 10),
  ('field_manager',       'Field Manager',       'Supervises guards and field operations.',               false, 20),
  ('finance',             'Finance',             'Finance team — payroll, statutory, books.',             false, 30),
  ('admin',               'Admin',               'Operations admin with broad configuration access.',     false, 40),
  ('account_receivable',  'Account Receivable',  'Handles client invoicing and collections.',             false, 50),
  ('account_payable',     'Account Payable',     'Handles vendor / employee payouts.',                    false, 60),
  ('sales',               'Sales',               'Sales team — leads, contracts, organizations.',         false, 70),
  ('marketing',           'Marketing',           'Marketing team — brand, campaigns, public content.',    false, 80),
  ('leadership',          'Leadership',          'Senior leadership — read-most, approve-key actions.',   false, 90),
  ('super_admin',         'Super Admin',         'Full unrestricted access. System role.',                true,  100);
