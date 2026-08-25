-- Vehicles main table -> vehicle_inventory sub-module
DROP POLICY IF EXISTS "Authenticated read vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated write vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated delete vehicles" ON public.vehicles;

CREATE POLICY "Permitted users read vehicles" ON public.vehicles
  FOR SELECT TO authenticated
  USING (is_admin_user() OR current_user_has_permission('vehicles','vehicle_inventory','view'));
CREATE POLICY "Permitted users insert vehicles" ON public.vehicles
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_user() OR current_user_has_permission('vehicles','vehicle_inventory','edit'));
CREATE POLICY "Permitted users update vehicles" ON public.vehicles
  FOR UPDATE TO authenticated
  USING (is_admin_user() OR current_user_has_permission('vehicles','vehicle_inventory','edit'))
  WITH CHECK (is_admin_user() OR current_user_has_permission('vehicles','vehicle_inventory','edit'));
CREATE POLICY "Permitted users delete vehicles" ON public.vehicles
  FOR DELETE TO authenticated
  USING (is_admin_user() OR current_user_has_permission('vehicles','vehicle_inventory','delete'));

-- Vehicle insurances -> insurance_manager
DROP POLICY IF EXISTS "Authenticated read vehicle_insurances" ON public.vehicle_insurances;
DROP POLICY IF EXISTS "Authenticated write vehicle_insurances" ON public.vehicle_insurances;
DROP POLICY IF EXISTS "Authenticated update vehicle_insurances" ON public.vehicle_insurances;
DROP POLICY IF EXISTS "Authenticated delete vehicle_insurances" ON public.vehicle_insurances;

CREATE POLICY "Permitted users read vehicle_insurances" ON public.vehicle_insurances
  FOR SELECT TO authenticated
  USING (is_admin_user() OR current_user_has_permission('vehicles','insurance_manager','view'));
CREATE POLICY "Permitted users insert vehicle_insurances" ON public.vehicle_insurances
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_user() OR current_user_has_permission('vehicles','insurance_manager','edit'));
CREATE POLICY "Permitted users update vehicle_insurances" ON public.vehicle_insurances
  FOR UPDATE TO authenticated
  USING (is_admin_user() OR current_user_has_permission('vehicles','insurance_manager','edit'))
  WITH CHECK (is_admin_user() OR current_user_has_permission('vehicles','insurance_manager','edit'));
CREATE POLICY "Permitted users delete vehicle_insurances" ON public.vehicle_insurances
  FOR DELETE TO authenticated
  USING (is_admin_user() OR current_user_has_permission('vehicles','insurance_manager','delete'));

-- Vehicle PUCs -> puc_manager
DROP POLICY IF EXISTS "Authenticated read vehicle_pucs" ON public.vehicle_pucs;
DROP POLICY IF EXISTS "Authenticated write vehicle_pucs" ON public.vehicle_pucs;
DROP POLICY IF EXISTS "Authenticated update vehicle_pucs" ON public.vehicle_pucs;
DROP POLICY IF EXISTS "Authenticated delete vehicle_pucs" ON public.vehicle_pucs;

CREATE POLICY "Permitted users read vehicle_pucs" ON public.vehicle_pucs
  FOR SELECT TO authenticated
  USING (is_admin_user() OR current_user_has_permission('vehicles','puc_manager','view'));
CREATE POLICY "Permitted users insert vehicle_pucs" ON public.vehicle_pucs
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_user() OR current_user_has_permission('vehicles','puc_manager','edit'));
CREATE POLICY "Permitted users update vehicle_pucs" ON public.vehicle_pucs
  FOR UPDATE TO authenticated
  USING (is_admin_user() OR current_user_has_permission('vehicles','puc_manager','edit'))
  WITH CHECK (is_admin_user() OR current_user_has_permission('vehicles','puc_manager','edit'));
CREATE POLICY "Permitted users delete vehicle_pucs" ON public.vehicle_pucs
  FOR DELETE TO authenticated
  USING (is_admin_user() OR current_user_has_permission('vehicles','puc_manager','delete'));

-- Vehicle fuel entries -> service_manager (fuel/service tracking)
DROP POLICY IF EXISTS "Authenticated read vehicle_fuel_entries" ON public.vehicle_fuel_entries;
DROP POLICY IF EXISTS "Authenticated write vehicle_fuel_entries" ON public.vehicle_fuel_entries;
DROP POLICY IF EXISTS "Authenticated update vehicle_fuel_entries" ON public.vehicle_fuel_entries;
DROP POLICY IF EXISTS "Authenticated delete vehicle_fuel_entries" ON public.vehicle_fuel_entries;

CREATE POLICY "Permitted users read vehicle_fuel_entries" ON public.vehicle_fuel_entries
  FOR SELECT TO authenticated
  USING (
    is_admin_user()
    OR current_user_has_permission('vehicles','service_manager','view')
    OR current_user_has_permission('vehicles','expense_manager','view')
  );
CREATE POLICY "Permitted users insert vehicle_fuel_entries" ON public.vehicle_fuel_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin_user()
    OR current_user_has_permission('vehicles','service_manager','edit')
    OR current_user_has_permission('vehicles','expense_manager','edit')
  );
CREATE POLICY "Permitted users update vehicle_fuel_entries" ON public.vehicle_fuel_entries
  FOR UPDATE TO authenticated
  USING (
    is_admin_user()
    OR current_user_has_permission('vehicles','service_manager','edit')
    OR current_user_has_permission('vehicles','expense_manager','edit')
  )
  WITH CHECK (
    is_admin_user()
    OR current_user_has_permission('vehicles','service_manager','edit')
    OR current_user_has_permission('vehicles','expense_manager','edit')
  );
CREATE POLICY "Permitted users delete vehicle_fuel_entries" ON public.vehicle_fuel_entries
  FOR DELETE TO authenticated
  USING (
    is_admin_user()
    OR current_user_has_permission('vehicles','service_manager','delete')
    OR current_user_has_permission('vehicles','expense_manager','delete')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_insurances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_pucs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_fuel_entries TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
GRANT ALL ON public.vehicle_insurances TO service_role;
GRANT ALL ON public.vehicle_pucs TO service_role;
GRANT ALL ON public.vehicle_fuel_entries TO service_role;
