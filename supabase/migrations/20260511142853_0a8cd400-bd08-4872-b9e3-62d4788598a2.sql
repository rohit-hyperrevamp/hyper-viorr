
CREATE TABLE public.client_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_code TEXT NOT NULL UNIQUE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  start_date DATE,
  end_date DATE,
  description TEXT NOT NULL DEFAULT '',
  service_type_id UUID REFERENCES public.service_types(id) ON DELETE SET NULL,
  payroll_window_id UUID REFERENCES public.payroll_windows(id) ON DELETE SET NULL,
  billing_type_id UUID REFERENCES public.billing_types(id) ON DELETE SET NULL,
  gst_option TEXT NOT NULL DEFAULT 'csgst' CHECK (gst_option IN ('csgst','igst','none')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_contracts_unit ON public.client_contracts(unit_id);

ALTER TABLE public.client_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read client_contracts" ON public.client_contracts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write client_contracts" ON public.client_contracts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update client_contracts" ON public.client_contracts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete client_contracts" ON public.client_contracts
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_client_contracts_updated_at
  BEFORE UPDATE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
