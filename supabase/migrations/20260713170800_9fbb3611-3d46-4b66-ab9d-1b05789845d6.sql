
-- 1) Candidates: disability flag for ESI ₹25k ceiling
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT false;

-- 2) Billing types: canonical code
ALTER TABLE public.billing_types
  ADD COLUMN IF NOT EXISTS code TEXT;

UPDATE public.billing_types SET code = CASE
  WHEN code IS NOT NULL AND code <> '' THEN code
  WHEN lower(name) LIKE '%hour%' THEN 'man_hours'
  WHEN lower(name) LIKE '%month%' THEN 'man_months'
  WHEN lower(name) LIKE '%lump%' OR lower(name) LIKE '%special%' OR lower(name) LIKE '%fixed%' THEN 'lumpsum'
  ELSE 'man_days'
END
WHERE code IS NULL OR code = '';

-- 3) Org settings singleton for GST / company state
CREATE TABLE IF NOT EXISTS public.org_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT,
  company_gstin TEXT,
  company_state TEXT,
  company_state_code TEXT,
  singleton BOOLEAN NOT NULL DEFAULT true UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_settings TO authenticated;
GRANT ALL ON public.org_settings TO service_role;

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_settings_read_all_authenticated"
  ON public.org_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "org_settings_write_admin"
  ON public.org_settings FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE TRIGGER org_settings_set_updated_at
  BEFORE UPDATE ON public.org_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.org_settings (company_name, company_state, company_state_code)
SELECT 'Radiant Guard Services', 'Maharashtra', '27'
WHERE NOT EXISTS (SELECT 1 FROM public.org_settings);
