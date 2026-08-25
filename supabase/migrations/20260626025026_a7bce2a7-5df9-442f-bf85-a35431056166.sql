
-- Office Assets module
CREATE TABLE public.office_asset_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_asset_categories TO authenticated;
GRANT ALL ON public.office_asset_categories TO service_role;
ALTER TABLE public.office_asset_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read categories" ON public.office_asset_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write categories" ON public.office_asset_categories FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.current_user_is_inventory_manager())
  WITH CHECK (public.is_admin_user() OR public.current_user_is_inventory_manager());

CREATE TABLE public.office_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES public.office_asset_categories(id) ON DELETE SET NULL,
  brand text DEFAULT '',
  model text DEFAULT '',
  description text DEFAULT '',
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  depreciation_months integer NOT NULL DEFAULT 36,
  image_url text DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_assets TO authenticated;
GRANT ALL ON public.office_assets TO service_role;
ALTER TABLE public.office_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read assets" ON public.office_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write assets" ON public.office_assets FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.current_user_is_inventory_manager())
  WITH CHECK (public.is_admin_user() OR public.current_user_is_inventory_manager());

CREATE TABLE public.office_asset_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.office_assets(id) ON DELETE RESTRICT,
  tag text NOT NULL,
  serial_number text DEFAULT '',
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock','allocated','scrap','repair')),
  purchase_date date,
  purchase_cost numeric(12,2) DEFAULT 0,
  current_value numeric(12,2) DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tag)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_asset_units TO authenticated;
GRANT ALL ON public.office_asset_units TO service_role;
ALTER TABLE public.office_asset_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read units" ON public.office_asset_units FOR SELECT TO authenticated USING (
  public.is_admin_user() OR public.current_user_is_inventory_manager()
  OR (branch_id IS NOT NULL AND branch_id::text IN (SELECT public.current_user_branch_scope_ids()))
);
CREATE POLICY "admin write units" ON public.office_asset_units FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.current_user_is_inventory_manager()
    OR (branch_id IS NOT NULL AND branch_id::text IN (SELECT public.current_user_branch_scope_ids())))
  WITH CHECK (public.is_admin_user() OR public.current_user_is_inventory_manager()
    OR (branch_id IS NOT NULL AND branch_id::text IN (SELECT public.current_user_branch_scope_ids())));

CREATE TABLE public.office_asset_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.office_asset_units(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz,
  condition_out text DEFAULT 'good',
  condition_in text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_asset_allocations TO authenticated;
GRANT ALL ON public.office_asset_allocations TO service_role;
ALTER TABLE public.office_asset_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read allocations" ON public.office_asset_allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write allocations" ON public.office_asset_allocations FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.current_user_is_inventory_manager()
    OR (branch_id IS NOT NULL AND branch_id::text IN (SELECT public.current_user_branch_scope_ids())))
  WITH CHECK (public.is_admin_user() OR public.current_user_is_inventory_manager()
    OR (branch_id IS NOT NULL AND branch_id::text IN (SELECT public.current_user_branch_scope_ids())));

CREATE TRIGGER trg_office_asset_categories_uat BEFORE UPDATE ON public.office_asset_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_office_assets_uat BEFORE UPDATE ON public.office_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_office_asset_units_uat BEFORE UPDATE ON public.office_asset_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_office_asset_allocations_uat BEFORE UPDATE ON public.office_asset_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add non_billable flag to candidates
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS non_billable boolean NOT NULL DEFAULT false;

-- Seed categories + assets
INSERT INTO public.office_asset_categories (name, description) VALUES
  ('IT Equipment', 'Laptops, computers, peripherals, cables'),
  ('Furniture', 'Chairs, tables, desks, cabinets'),
  ('Electrical', 'Lights, fans, extension cords'),
  ('Stationery', 'Notebooks, pens, organizers')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.office_assets (name, category_id, brand, model, unit_cost, depreciation_months)
SELECT 'Dell Latitude Laptop', id, 'Dell', 'Latitude 5440', 85000, 36 FROM public.office_asset_categories WHERE name='IT Equipment'
ON CONFLICT DO NOTHING;
INSERT INTO public.office_assets (name, category_id, brand, model, unit_cost, depreciation_months)
SELECT 'Logitech Wireless Mouse', id, 'Logitech', 'M331', 800, 24 FROM public.office_asset_categories WHERE name='IT Equipment'
ON CONFLICT DO NOTHING;
INSERT INTO public.office_assets (name, category_id, brand, model, unit_cost, depreciation_months)
SELECT 'Mechanical Keyboard', id, 'Keychron', 'K2', 7500, 36 FROM public.office_asset_categories WHERE name='IT Equipment'
ON CONFLICT DO NOTHING;
INSERT INTO public.office_assets (name, category_id, brand, model, unit_cost, depreciation_months)
SELECT 'Ergonomic Office Chair', id, 'Featherlite', 'Optima', 12000, 60 FROM public.office_asset_categories WHERE name='Furniture'
ON CONFLICT DO NOTHING;
INSERT INTO public.office_assets (name, category_id, brand, model, unit_cost, depreciation_months)
SELECT 'Workstation Desk', id, 'Godrej', 'WD-120', 9500, 72 FROM public.office_asset_categories WHERE name='Furniture'
ON CONFLICT DO NOTHING;
