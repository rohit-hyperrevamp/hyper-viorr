
CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_number text NOT NULL,
  name text,
  owner text,
  address1 text,
  address2 text,
  city text,
  state text,
  pincode text,
  configuration text,
  carpet_area_sqft numeric,
  purchase_date date,
  purchase_value numeric,
  current_value numeric,
  property_tax_id text,
  notes text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read properties" ON public.properties FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write properties" ON public.properties FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update properties" ON public.properties FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete properties" ON public.properties FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_properties_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.property_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  lender_name text NOT NULL,
  loan_account_number text,
  sanctioned_amount numeric,
  outstanding_amount numeric,
  emi_amount numeric,
  interest_rate numeric,
  tenure_months integer,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_loans TO authenticated;
GRANT ALL ON public.property_loans TO service_role;
ALTER TABLE public.property_loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read property_loans" ON public.property_loans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write property_loans" ON public.property_loans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update property_loans" ON public.property_loans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete property_loans" ON public.property_loans FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_property_loans_property ON public.property_loans(property_id);
CREATE TRIGGER trg_property_loans_updated_at BEFORE UPDATE ON public.property_loans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.property_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  expense_date date NOT NULL,
  category text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_mode text,
  vendor_name text,
  notes text,
  receipt_url text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_expenses TO authenticated;
GRANT ALL ON public.property_expenses TO service_role;
ALTER TABLE public.property_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read property_expenses" ON public.property_expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write property_expenses" ON public.property_expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update property_expenses" ON public.property_expenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete property_expenses" ON public.property_expenses FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_property_expenses_property ON public.property_expenses(property_id);
CREATE INDEX IF NOT EXISTS idx_property_expenses_date ON public.property_expenses(expense_date);
CREATE TRIGGER trg_property_expenses_updated_at BEFORE UPDATE ON public.property_expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
