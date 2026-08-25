CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read assets" ON public.assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write assets" ON public.assets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update assets" ON public.assets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete assets" ON public.assets FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_assets_updated_at BEFORE UPDATE ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.assets (name, category, description) VALUES
  ('Uniform', 'Uniform', 'Standard duty uniform set'),
  ('Cap', 'Uniform', 'Uniform cap'),
  ('Belt', 'Uniform', 'Uniform belt'),
  ('Shoes', 'Uniform', 'Duty shoes'),
  ('Raincoat', 'Uniform', 'Monsoon raincoat'),
  ('Winter Jacket', 'Uniform', 'Cold-weather jacket'),
  ('Whistle', 'Equipment', 'Patrol whistle'),
  ('Torch / Flashlight', 'Equipment', 'Patrol torch'),
  ('Baton / Lathi', 'Equipment', 'Defensive baton'),
  ('Walkie-Talkie', 'Equipment', 'Two-way radio handset'),
  ('Metal Detector', 'Equipment', 'Handheld metal detector'),
  ('Fire Extinguisher Kit', 'Equipment', 'Site-issued kit'),
  ('First Aid Kit', 'Equipment', 'On-site first aid kit'),
  ('Register / Logbook', 'Equipment', 'Site duty register'),
  ('ID Card', 'Identity', 'Company photo ID card'),
  ('Access Card', 'Identity', 'Site access / RFID card'),
  ('Visiting Card', 'Identity', 'Business visiting card'),
  ('Laptop', 'IT', 'Company laptop'),
  ('Desktop', 'IT', 'Company desktop'),
  ('Monitor', 'IT', 'External monitor'),
  ('Keyboard', 'IT', 'External keyboard'),
  ('Mouse', 'IT', 'External mouse'),
  ('Headset', 'IT', 'Audio headset'),
  ('Mobile Phone', 'IT', 'Company-issued handset'),
  ('SIM Card', 'IT', 'Company-issued SIM'),
  ('Tablet', 'IT', 'Company tablet'),
  ('Printer', 'IT', 'Office printer'),
  ('Pen Drive', 'IT', 'USB storage'),
  ('Charger / Adapter', 'IT', 'Power adapter'),
  ('Vehicle', 'Vehicle', 'Company vehicle'),
  ('Two-Wheeler', 'Vehicle', 'Company two-wheeler'),
  ('Helmet', 'Vehicle', 'Safety helmet'),
  ('Office Keys', 'Access', 'Office / locker keys'),
  ('Locker', 'Access', 'Assigned locker');