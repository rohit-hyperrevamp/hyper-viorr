
-- VEHICLES
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL DEFAULT '',
  make TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  year INTEGER,
  color TEXT NOT NULL DEFAULT '',
  registration_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read vehicles" ON public.vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write vehicles" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update vehicles" ON public.vehicles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete vehicles" ON public.vehicles FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- FASTAGS
CREATE TABLE public.vehicle_fastags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  fastag_number TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  account_number TEXT NOT NULL DEFAULT '',
  balance NUMERIC NOT NULL DEFAULT 0,
  issued_date DATE,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vehicle_fastags_vehicle ON public.vehicle_fastags(vehicle_id);
ALTER TABLE public.vehicle_fastags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read vehicle_fastags" ON public.vehicle_fastags FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write vehicle_fastags" ON public.vehicle_fastags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update vehicle_fastags" ON public.vehicle_fastags FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete vehicle_fastags" ON public.vehicle_fastags FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_vehicle_fastags_updated_at BEFORE UPDATE ON public.vehicle_fastags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- INSURANCES
CREATE TABLE public.vehicle_insurances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  engine_number TEXT NOT NULL DEFAULT '',
  chassis_number TEXT NOT NULL DEFAULT '',
  insurance_company TEXT NOT NULL DEFAULT '',
  policy_number TEXT NOT NULL DEFAULT '',
  start_date DATE,
  end_date DATE,
  premium_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vehicle_insurances_vehicle ON public.vehicle_insurances(vehicle_id);
ALTER TABLE public.vehicle_insurances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read vehicle_insurances" ON public.vehicle_insurances FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write vehicle_insurances" ON public.vehicle_insurances FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update vehicle_insurances" ON public.vehicle_insurances FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete vehicle_insurances" ON public.vehicle_insurances FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_vehicle_insurances_updated_at BEFORE UPDATE ON public.vehicle_insurances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PUCs
CREATE TABLE public.vehicle_pucs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  puc_number TEXT NOT NULL DEFAULT '',
  issuing_authority TEXT NOT NULL DEFAULT '',
  issued_date DATE,
  expiry_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vehicle_pucs_vehicle ON public.vehicle_pucs(vehicle_id);
ALTER TABLE public.vehicle_pucs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read vehicle_pucs" ON public.vehicle_pucs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write vehicle_pucs" ON public.vehicle_pucs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update vehicle_pucs" ON public.vehicle_pucs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete vehicle_pucs" ON public.vehicle_pucs FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_vehicle_pucs_updated_at BEFORE UPDATE ON public.vehicle_pucs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
