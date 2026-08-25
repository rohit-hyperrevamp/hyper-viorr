-- Tables
CREATE TABLE public.states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT states_name_unique UNIQUE (name)
);

CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  state_id UUID NOT NULL REFERENCES public.states(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT branches_code_unique UNIQUE (code),
  CONSTRAINT branches_state_unique UNIQUE (state_id)
);

CREATE TYPE public.customer_status AS ENUM ('active', 'inactive');

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  website TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  contract_start_date DATE,
  status public.customer_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customers_code_unique UNIQUE (code),
  CONSTRAINT customers_name_unique UNIQUE (name)
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_states_updated BEFORE UPDATE ON public.states
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_branches_updated BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS — pre-launch admin tooling: any authenticated user has full access.
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read states" ON public.states FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write states" ON public.states FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update states" ON public.states FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete states" ON public.states FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read branches" ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write branches" ON public.branches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update branches" ON public.branches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete branches" ON public.branches FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update customers" ON public.customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete customers" ON public.customers FOR DELETE TO authenticated USING (true);

-- Seed states (Indian states + UTs + extra location labels)
INSERT INTO public.states (name) VALUES
  ('Andhra Pradesh'),('Arunachal Pradesh'),('Assam'),('Bihar'),('Chhattisgarh'),
  ('Goa'),('Gujarat'),('Haryana'),('Himachal Pradesh'),('Jharkhand'),
  ('Karnataka'),('Kerala'),('Madhya Pradesh'),('Maharashtra'),('Manipur'),
  ('Meghalaya'),('Mizoram'),('Nagaland'),('Odisha'),('Punjab'),
  ('Rajasthan'),('Sikkim'),('Tamil Nadu'),('Telangana'),('Tripura'),
  ('Uttar Pradesh'),('Uttarakhand'),('West Bengal'),
  ('Andaman and Nicobar Islands'),('Chandigarh'),
  ('Dadra and Nagar Haveli and Daman and Diu'),('Delhi'),
  ('Jammu and Kashmir'),('Ladakh'),('Lakshadweep'),('Puducherry'),
  ('PUNE'),('BANGALORE'),('GANDHINAGAR'),('NAGPUR'),('NASHIK'),('MUMBAI'),
  ('SANGLI'),('SATARA'),('KOLHAPUR'),('AURANGABAD'),('AHMADNAGAR'),
  ('KONKAN'),('JALGAON'),('SOLAPUR'),('Ahmedabad'),('Radiant')
ON CONFLICT (name) DO NOTHING;

-- Seed branches
INSERT INTO public.branches (code, name, state_id)
SELECT v.code, v.state_name, s.id
FROM (VALUES
  ('BR1','PUNE'),('BR2','BANGALORE'),('BR3','GANDHINAGAR'),('BR4','NAGPUR'),
  ('BR5','NASHIK'),('BR6','MUMBAI'),('BR9','Madhya Pradesh'),('BR10','GOA'),
  ('BR11','Gujarat'),('BR12','SANGLI'),('BR13','SATARA'),('BR14','KOLHAPUR'),
  ('BR15','AURANGABAD'),('BR16','AHMADNAGAR'),('BR17','KONKAN'),('BR18','JALGAON'),
  ('BR19','SOLAPUR'),('BR20','Karnataka'),('BR22','Ahmedabad'),('BR26','Radiant'),
  ('BR27','Telangana'),('BR28','Uttar Pradesh'),('BR29','Rajasthan'),
  ('BR30','Tamil Nadu'),('BR31','Andhra Pradesh'),('BR32','Delhi'),
  ('BR33','West Bengal'),('BR34','Odisha'),('BR35','Jharkhand'),
  ('BR36','Bihar'),('BR37','Haryana'),('BR38','Punjab')
) AS v(code, state_name)
JOIN public.states s ON s.name = v.state_name
ON CONFLICT (code) DO NOTHING;

-- Seed customers (10 banks)
INSERT INTO public.customers (code, name, website, phone, address, contract_start_date, status) VALUES
  ('ORG1','State Bank of India','sbi.co.in','+91 22 2274 0841','State Bank Bhavan, Madame Cama Road, Nariman Point, Mumbai 400021','2024-04-01','active'),
  ('ORG2','HDFC Bank','hdfcbank.com','+91 22 6160 6161','HDFC Bank House, Senapati Bapat Marg, Lower Parel, Mumbai 400013','2024-05-15','active'),
  ('ORG3','ICICI Bank','icicibank.com','+91 22 3366 7777','ICICI Bank Tower, Bandra-Kurla Complex, Bandra (E), Mumbai 400051','2024-06-01','active'),
  ('ORG4','Axis Bank','axisbank.com','+91 22 2425 2525','Axis House, Wadia International Centre, Worli, Mumbai 400025','2024-07-10','active'),
  ('ORG5','Kotak Mahindra Bank','kotak.com','+91 22 6166 0001','27BKC, C 27, G Block, Bandra Kurla Complex, Bandra (E), Mumbai 400051','2024-08-01','active'),
  ('ORG6','Punjab National Bank','pnbindia.in','+91 11 2610 2303','Plot No. 4, Sector 10, Dwarka, New Delhi 110075','2024-08-20','active'),
  ('ORG7','Bank of Baroda','bankofbaroda.in','+91 22 6698 5000','Baroda Corporate Centre, C-26, G-Block, Bandra Kurla Complex, Mumbai 400051','2024-09-05','active'),
  ('ORG8','Canara Bank','canarabank.com','+91 80 2222 1581','112, J C Road, Bangalore 560002','2024-09-15','active'),
  ('ORG9','Yes Bank','yesbank.in','+91 22 5091 9800','YES BANK Tower, IFC 2, 15th Floor, Senapati Bapat Marg, Elphinstone (W), Mumbai 400013','2024-10-01','inactive'),
  ('ORG10','IndusInd Bank','indusind.com','+91 22 6641 2200','8th Floor, Tower 1, One World Center, Senapati Bapat Marg, Mumbai 400013','2024-10-20','active')
ON CONFLICT (code) DO NOTHING;