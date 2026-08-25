
CREATE TABLE IF NOT EXISTS public.inv_payroll_recoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  writeoff_id uuid REFERENCES public.inv_write_offs(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE RESTRICT,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  payroll_period text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  posted_at timestamptz,
  posted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_payrec_candidate ON public.inv_payroll_recoveries(candidate_id);
CREATE INDEX IF NOT EXISTS idx_inv_payrec_status ON public.inv_payroll_recoveries(status);

ALTER TABLE public.inv_payroll_recoveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read inv_payroll_recoveries" ON public.inv_payroll_recoveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write inv_payroll_recoveries" ON public.inv_payroll_recoveries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update inv_payroll_recoveries" ON public.inv_payroll_recoveries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete inv_payroll_recoveries" ON public.inv_payroll_recoveries FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_updated_at_inv_payroll_recoveries BEFORE UPDATE ON public.inv_payroll_recoveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.inv_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inv_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read inv_settings" ON public.inv_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write inv_settings" ON public.inv_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update inv_settings" ON public.inv_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete inv_settings" ON public.inv_settings FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_updated_at_inv_settings BEFORE UPDATE ON public.inv_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.inv_settings (key, value, description) VALUES
  ('approval_thresholds', '{"po_amount": 50000, "writeoff_amount": 5000}'::jsonb, 'Amounts at/above which manual owner approval is required'),
  ('low_stock_alert', '{"enabled": true}'::jsonb, 'Whether to surface low-stock notifications on dashboard')
ON CONFLICT (key) DO NOTHING;
