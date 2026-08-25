
ALTER TABLE public.inv_goods_receipts ADD COLUMN IF NOT EXISTS vendor_invoice_url text;

CREATE POLICY "Authenticated read vendor invoices"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'vendor-invoices');

CREATE POLICY "Authenticated upload vendor invoices"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'vendor-invoices');

CREATE POLICY "Authenticated update vendor invoices"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'vendor-invoices');

CREATE POLICY "Authenticated delete vendor invoices"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'vendor-invoices');
