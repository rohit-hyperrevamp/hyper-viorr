
-- 1) Reusable pincode ranges table
CREATE TABLE public.pincode_ranges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  region_label text NOT NULL DEFAULT 'All Pincodes',
  range_start integer NOT NULL,
  range_end integer NOT NULL,
  is_excluded boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pincode_range_valid CHECK (range_end >= range_start)
);

CREATE INDEX idx_pincode_ranges_state ON public.pincode_ranges (state);
CREATE INDEX idx_pincode_ranges_region ON public.pincode_ranges (state, region_label);

ALTER TABLE public.pincode_ranges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pincode_ranges" ON public.pincode_ranges FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write pincode_ranges" ON public.pincode_ranges FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update pincode_ranges" ON public.pincode_ranges FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete pincode_ranges" ON public.pincode_ranges FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_pincode_ranges_updated
  BEFORE UPDATE ON public.pincode_ranges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed canonical India state pincode ranges (used by PT slabs and reusable elsewhere)
INSERT INTO public.pincode_ranges (state, region_label, range_start, range_end, is_excluded, notes) VALUES
  ('Andhra Pradesh', 'All Pincodes', 515001, 535594, false, 'Post-bifurcation Andhra Pradesh pincode range'),
  ('Tamil Nadu', 'All Pincodes', 600001, 643253, false, 'Tamil Nadu pincode range'),
  ('Kerala', 'All Pincodes', 670001, 695615, false, 'Kerala pincode range'),
  ('Dadra & Nagar Haveli and Daman & Diu', 'DNH', 396210, 396240, false, 'Dadra & Nagar Haveli'),
  ('Dadra & Nagar Haveli and Daman & Diu', 'Daman', 396210, 396220, false, 'Daman'),
  ('Dadra & Nagar Haveli and Daman & Diu', 'Diu', 362520, 362570, false, 'Diu'),
  ('Uttar Pradesh', 'All Pincodes', 201001, 285223, false, 'Uttar Pradesh pincode range'),
  ('Telangana', 'All Pincodes', 500001, 509412, false, 'Telangana pincode range'),
  ('Madhya Pradesh', 'All Pincodes', 450001, 488448, false, 'Madhya Pradesh pincode range'),
  ('Maharashtra', 'All Pincodes', 400001, 445402, false, 'Maharashtra pincode range'),
  ('Karnataka', 'All Pincodes', 560001, 591346, false, 'Karnataka pincode range'),
  ('Gujarat', 'Gujarat (excluding Baroda)', 360001, 396590, false, 'Gujarat pincode range — full state'),
  ('Gujarat', 'Gujarat (excluding Baroda)', 390001, 390025, true, 'Baroda block excluded from rest-of-Gujarat slab'),
  ('Gujarat', 'Baroda', 390001, 390025, false, 'Baroda (Vadodara) city pincodes');

-- 2) Multi-GSTIN per organisation
CREATE TABLE public.customer_gst_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  gstin text NOT NULL,
  state_code text NOT NULL DEFAULT '',
  state_name text NOT NULL DEFAULT '',
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gstin_unique_per_customer UNIQUE (customer_id, gstin)
);

CREATE INDEX idx_customer_gst_numbers_customer ON public.customer_gst_numbers (customer_id);

ALTER TABLE public.customer_gst_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read customer_gst_numbers" ON public.customer_gst_numbers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write customer_gst_numbers" ON public.customer_gst_numbers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update customer_gst_numbers" ON public.customer_gst_numbers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete customer_gst_numbers" ON public.customer_gst_numbers FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_customer_gst_numbers_updated
  BEFORE UPDATE ON public.customer_gst_numbers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
