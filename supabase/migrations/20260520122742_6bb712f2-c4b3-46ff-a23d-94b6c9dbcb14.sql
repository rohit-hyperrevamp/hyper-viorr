
-- Vehicle fuel entries table
CREATE TABLE public.vehicle_fuel_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_time TIME,
  fuel_type TEXT NOT NULL DEFAULT 'Petrol',
  odometer_km INTEGER NOT NULL DEFAULT 0,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL DEFAULT 'Fuel Card',
  location_text TEXT NOT NULL DEFAULT '',
  geo_lat NUMERIC(10,6),
  geo_lng NUMERIC(10,6),
  odometer_photo_url TEXT NOT NULL DEFAULT '',
  pump_photo_url TEXT NOT NULL DEFAULT '',
  receipt_photo_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vfe_vehicle_date ON public.vehicle_fuel_entries(vehicle_id, entry_date DESC);
CREATE INDEX idx_vfe_date ON public.vehicle_fuel_entries(entry_date DESC);

ALTER TABLE public.vehicle_fuel_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read vehicle_fuel_entries" ON public.vehicle_fuel_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write vehicle_fuel_entries" ON public.vehicle_fuel_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update vehicle_fuel_entries" ON public.vehicle_fuel_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete vehicle_fuel_entries" ON public.vehicle_fuel_entries FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_vfe_updated_at
BEFORE UPDATE ON public.vehicle_fuel_entries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket for proof photos (public read for simplicity in admin tool)
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-fuel-proofs', 'vehicle-fuel-proofs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read vehicle-fuel-proofs"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-fuel-proofs');

CREATE POLICY "Authenticated upload vehicle-fuel-proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'vehicle-fuel-proofs');

CREATE POLICY "Authenticated update vehicle-fuel-proofs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'vehicle-fuel-proofs');

CREATE POLICY "Authenticated delete vehicle-fuel-proofs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'vehicle-fuel-proofs');
