
CREATE TABLE public.professional_tax_slabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  region_label text NOT NULL DEFAULT 'All Pincodes',
  pincode_coverage text NOT NULL DEFAULT 'All Pincodes',
  salary_min numeric NOT NULL DEFAULT 0,
  salary_max numeric,
  tax_per_month numeric NOT NULL DEFAULT 0,
  gender text NOT NULL DEFAULT 'all',
  working_days text NOT NULL DEFAULT 'NORMAL',
  period text NOT NULL DEFAULT 'No Period',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_gender_check CHECK (gender IN ('all','male','female'))
);

ALTER TABLE public.professional_tax_slabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pt_slabs" ON public.professional_tax_slabs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write pt_slabs" ON public.professional_tax_slabs
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update pt_slabs" ON public.professional_tax_slabs
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete pt_slabs" ON public.professional_tax_slabs
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER pt_set_updated_at
BEFORE UPDATE ON public.professional_tax_slabs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_pt_state ON public.professional_tax_slabs (state);

-- Seed
INSERT INTO public.professional_tax_slabs
  (state, region_label, pincode_coverage, salary_min, salary_max, tax_per_month, gender) VALUES
-- Andhra Pradesh
('Andhra Pradesh','All Pincodes','All Andhra Pradesh pincodes (500001-535593) included',0,15000,0,'all'),
('Andhra Pradesh','All Pincodes','All Andhra Pradesh pincodes (500001-535593) included',15001,20000,150,'all'),
('Andhra Pradesh','All Pincodes','All Andhra Pradesh pincodes (500001-535593) included',20001,NULL,200,'all'),
-- Tamil Nadu (no PT)
('Tamil Nadu','All Pincodes','All Tamil Nadu pincodes (600001-643253) included',0,NULL,0,'all'),
-- Kerala
('Kerala','All Pincodes','All Kerala pincodes (670001-695615) included',0,11999,0,'all'),
('Kerala','All Pincodes','All Kerala pincodes (670001-695615) included',12000,17999,120,'all'),
('Kerala','All Pincodes','All Kerala pincodes (670001-695615) included',18000,29999,180,'all'),
-- DNH & DD
('Dadra and Nagar Haveli & Daman and Diu','All Pincodes','All UT pincodes (362520, 396193-396230) included',0,NULL,0,'all'),
-- Uttar Pradesh (no PT)
('Uttar Pradesh','All Pincodes','All Uttar Pradesh pincodes (201001-285223) included',0,NULL,0,'all'),
-- Telangana
('Telangana','All Pincodes','All Telangana pincodes (500001-509412) included',0,15000,0,'all'),
('Telangana','All Pincodes','All Telangana pincodes (500001-509412) included',15001,20000,150,'all'),
('Telangana','All Pincodes','All Telangana pincodes (500001-509412) included',20001,NULL,200,'all'),
-- Madhya Pradesh
('Madhya Pradesh','All Pincodes','All Madhya Pradesh pincodes (450001-488448) included',0,18750,0,'all'),
('Madhya Pradesh','All Pincodes','All Madhya Pradesh pincodes (450001-488448) included',18751,25000,0,'all'),
('Madhya Pradesh','All Pincodes','All Madhya Pradesh pincodes (450001-488448) included',25001,33333,0,'all'),
-- Gujarat (excluding Vadodara)
('Gujarat','Gujarat (excluding Vadodara)','All Gujarat pincodes 360001-396590 EXCLUDING Vadodara 390001-390025',0,5999,0,'all'),
('Gujarat','Gujarat (excluding Vadodara)','All Gujarat pincodes 360001-396590 EXCLUDING Vadodara 390001-390025',6000,8999,0,'all'),
('Gujarat','Gujarat (excluding Vadodara)','All Gujarat pincodes 360001-396590 EXCLUDING Vadodara 390001-390025',9000,11999,0,'all'),
('Gujarat','Gujarat (excluding Vadodara)','All Gujarat pincodes 360001-396590 EXCLUDING Vadodara 390001-390025',12000,NULL,200,'all'),
-- Maharashtra
('Maharashtra','All Pincodes','All Maharashtra pincodes (400001-445402) included',0,7500,0,'male'),
('Maharashtra','All Pincodes','All Maharashtra pincodes (400001-445402) included',7501,10000,175,'male'),
('Maharashtra','All Pincodes','All Maharashtra pincodes (400001-445402) included',10001,NULL,200,'male'),
('Maharashtra','All Pincodes','All Maharashtra pincodes (400001-445402) included',0,25000,0,'female'),
('Maharashtra','All Pincodes','All Maharashtra pincodes (400001-445402) included',25001,NULL,200,'female'),
-- Karnataka
('Karnataka','All Pincodes','All Karnataka pincodes (560001-591346) included',0,25000,0,'all'),
('Karnataka','All Pincodes','All Karnataka pincodes (560001-591346) included',25001,NULL,200,'all'),
-- Vadodara (Gujarat exception)
('Gujarat','Vadodara','Vadodara, Gujarat: pincodes 390001-390025 only',0,5999,0,'all'),
('Gujarat','Vadodara','Vadodara, Gujarat: pincodes 390001-390025 only',6000,8999,0,'all'),
('Gujarat','Vadodara','Vadodara, Gujarat: pincodes 390001-390025 only',9000,11999,0,'all'),
('Gujarat','Vadodara','Vadodara, Gujarat: pincodes 390001-390025 only',12000,NULL,200,'all');
