
DROP POLICY IF EXISTS "Non-branch users read inv_warehouses" ON public.inv_warehouses;

CREATE POLICY "Authenticated read inv_warehouses"
  ON public.inv_warehouses FOR SELECT
  TO authenticated
  USING (true);
