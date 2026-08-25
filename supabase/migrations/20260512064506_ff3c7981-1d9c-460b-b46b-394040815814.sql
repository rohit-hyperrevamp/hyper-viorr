CREATE TABLE public.cost_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  calc_type text NOT NULL DEFAULT 'percentage',
  percentage numeric NOT NULL DEFAULT 0,
  base_components jsonb NOT NULL DEFAULT '[]'::jsonb,
  cap_amount numeric,
  amount numeric,
  state text NOT NULL DEFAULT 'N/A',
  notes text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cost_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read cost_components" ON public.cost_components FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write cost_components" ON public.cost_components FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update cost_components" ON public.cost_components FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete cost_components" ON public.cost_components FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_cost_components_updated
BEFORE UPDATE ON public.cost_components
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_cost_components_sort ON public.cost_components(sort_order, name);

INSERT INTO public.cost_components (name, calc_type, percentage, base_components, cap_amount, state, sort_order) VALUES
('EPF Employer Contribution', 'percentage', 12, '[{"label":"Basic","operator":"+"},{"label":"DA","operator":"+"}]'::jsonb, NULL, 'N/A', 10),
('EPF Employer Contribution (Capped)', 'percentage', 12, '[{"label":"Gross","operator":"+"},{"label":"HRA","operator":"-"}]'::jsonb, 15000, 'N/A', 20),
('ESI Employer Contribution', 'percentage', 3.25, '[{"label":"Basic","operator":"+"},{"label":"DA","operator":"+"}]'::jsonb, NULL, 'N/A', 30),
('ESI Employer Contribution (Net)', 'percentage', 3.25, '[{"label":"Gross","operator":"+"},{"label":"Washing Allowance","operator":"-"},{"label":"Travelling Allowance","operator":"-"}]'::jsonb, NULL, 'N/A', 40),
('Bonus', 'percentage', 8.33, '[{"label":"Basic","operator":"+"},{"label":"DA","operator":"+"}]'::jsonb, NULL, 'N/A', 50),
('Bonus (Enhanced)', 'percentage', 10, '[{"label":"Basic","operator":"+"},{"label":"DA","operator":"+"}]'::jsonb, NULL, 'N/A', 60),
('GB Levy', 'percentage', 3, '[{"label":"Basic","operator":"+"},{"label":"DA","operator":"+"}]'::jsonb, NULL, 'N/A', 70),
('Gratuity', 'percentage', 4.81, '[{"label":"Basic","operator":"+"},{"label":"DA","operator":"+"}]'::jsonb, NULL, 'N/A', 80),
('Gratuity (Standard)', 'percentage', 4, '[{"label":"Basic","operator":"+"},{"label":"DA","operator":"+"}]'::jsonb, NULL, 'N/A', 90),
('LWF Employer Contribution', 'fixed', 0, '[]'::jsonb, NULL, 'Maharashtra', 100),
('LWF Employer Contribution', 'fixed', 0, '[]'::jsonb, NULL, 'Gujarat', 110),
('LWF Employer Contribution', 'fixed', 0, '[]'::jsonb, NULL, 'Karnataka', 120),
('LWF Employer Contribution', 'fixed', 0, '[]'::jsonb, NULL, 'Telangana', 130),
('LWF Employer Contribution', 'fixed', 0, '[]'::jsonb, NULL, 'Goa', 140),
('Uniform Charges', 'fixed', 0, '[]'::jsonb, NULL, 'N/A', 150),
('LWW (Leave with Wages)', 'fixed', 0, '[]'::jsonb, NULL, 'N/A', 160),
('NFH (National & Festival Holidays)', 'fixed', 0, '[]'::jsonb, NULL, 'N/A', 170),
('Reliever Charges', 'percentage', 16.67, '[{"label":"CTC","operator":"+"}]'::jsonb, NULL, 'N/A', 180);