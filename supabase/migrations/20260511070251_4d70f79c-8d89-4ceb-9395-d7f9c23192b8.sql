
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS short_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS industry_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS billing_salutation text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_address1 text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_address2 text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_pincode text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_district text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_state text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_country text NOT NULL DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS billing_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_fax text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_same_as_billing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shipping_salutation text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_address1 text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_address2 text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_pincode text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_district text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_state text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_country text NOT NULL DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS shipping_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_fax text NOT NULL DEFAULT '';

INSERT INTO storage.buckets (id, name, public)
VALUES ('org-logos', 'org-logos', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Public read org-logos') THEN
    CREATE POLICY "Public read org-logos" ON storage.objects FOR SELECT USING (bucket_id = 'org-logos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Authenticated upload org-logos') THEN
    CREATE POLICY "Authenticated upload org-logos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'org-logos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Authenticated update org-logos') THEN
    CREATE POLICY "Authenticated update org-logos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'org-logos') WITH CHECK (bucket_id = 'org-logos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Authenticated delete org-logos') THEN
    CREATE POLICY "Authenticated delete org-logos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'org-logos');
  END IF;
END $$;
