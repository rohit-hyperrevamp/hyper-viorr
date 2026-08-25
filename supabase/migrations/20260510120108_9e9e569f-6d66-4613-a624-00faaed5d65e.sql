CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status public.customer_status NOT NULL DEFAULT 'active',

  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,

  onboarding_date DATE,
  closing_date DATE,

  pan_number TEXT NOT NULL DEFAULT '',
  gst_number TEXT NOT NULL DEFAULT '',

  -- Billing / contact info
  billing_salutation TEXT NOT NULL DEFAULT '',
  billing_name TEXT NOT NULL DEFAULT '',
  billing_address1 TEXT NOT NULL DEFAULT '',
  billing_address2 TEXT NOT NULL DEFAULT '',
  billing_pincode TEXT NOT NULL DEFAULT '',
  billing_city TEXT NOT NULL DEFAULT '',
  billing_district TEXT NOT NULL DEFAULT '',
  billing_state TEXT NOT NULL DEFAULT '',
  billing_country TEXT NOT NULL DEFAULT 'India',

  -- Shipping
  shipping_same_as_billing BOOLEAN NOT NULL DEFAULT true,
  shipping_same_as_org BOOLEAN NOT NULL DEFAULT false,
  shipping_salutation TEXT NOT NULL DEFAULT '',
  shipping_name TEXT NOT NULL DEFAULT '',
  shipping_address1 TEXT NOT NULL DEFAULT '',
  shipping_address2 TEXT NOT NULL DEFAULT '',
  shipping_pincode TEXT NOT NULL DEFAULT '',
  shipping_city TEXT NOT NULL DEFAULT '',
  shipping_district TEXT NOT NULL DEFAULT '',
  shipping_state TEXT NOT NULL DEFAULT '',
  shipping_country TEXT NOT NULL DEFAULT 'India',

  -- Reporting officers as JSONB array of {name, is_primary, is_active}
  reporting_officers JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Emergency
  emergency_contact_name TEXT NOT NULL DEFAULT '',
  emergency_contact_mobile TEXT NOT NULL DEFAULT '',
  nearby_hospital_name TEXT NOT NULL DEFAULT '',
  nearby_hospital_mobile TEXT NOT NULL DEFAULT '',
  ambulance_name TEXT NOT NULL DEFAULT '',
  ambulance_mobile TEXT NOT NULL DEFAULT '',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read units" ON public.units FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write units" ON public.units FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update units" ON public.units FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete units" ON public.units FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_units_updated_at
BEFORE UPDATE ON public.units
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_units_branch ON public.units(branch_id);
CREATE INDEX idx_units_customer ON public.units(customer_id);