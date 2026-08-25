
CREATE OR REPLACE FUNCTION public.is_unit_in_current_user_branch(_unit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = _unit_id
      AND u.branch_id::text IN (SELECT public.current_user_branch_scope_ids())
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_inventory_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_user_role_key() = 'inventory_manager';
$$;

CREATE OR REPLACE FUNCTION public.is_inv_location_in_current_user_scope(_type text, _id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (CASE
       WHEN _type = 'branch' THEN _id::text IN (SELECT public.current_user_branch_scope_ids())
       WHEN _type IN ('field_officer','guard','security_guard')
         THEN public.is_candidate_in_current_user_branch(_id)
       ELSE false
     END)
    OR (CASE
       WHEN _type = 'field_officer' THEN _id = public.current_user_candidate_id()
       WHEN _type IN ('guard','security_guard')
         THEN _id IN (SELECT public.current_user_assigned_guard_ids())
       ELSE false
     END)
    OR (_type IN ('guard','security_guard') AND _id = public.current_user_candidate_id());
$$;

DROP POLICY IF EXISTS "Authenticated read units" ON public.units;
DROP POLICY IF EXISTS "Scoped read units" ON public.units;
CREATE POLICY "Scoped read units" ON public.units FOR SELECT
USING (
  public.is_admin_user()
  OR public.current_user_is_inventory_manager()
  OR (NOT public.current_user_has_branch_scope())
  OR (branch_id::text IN (SELECT public.current_user_branch_scope_ids()))
);

DROP POLICY IF EXISTS "Authenticated read attendance_sheets" ON public.attendance_sheets;
DROP POLICY IF EXISTS "Scoped read attendance_sheets" ON public.attendance_sheets;
CREATE POLICY "Scoped read attendance_sheets" ON public.attendance_sheets FOR SELECT
USING (
  public.is_admin_user()
  OR (NOT public.current_user_has_branch_scope())
  OR public.is_unit_in_current_user_branch(unit_id)
);

DROP POLICY IF EXISTS "Authenticated read attendance_entries" ON public.attendance_entries;
DROP POLICY IF EXISTS "Scoped read attendance_entries" ON public.attendance_entries;
CREATE POLICY "Scoped read attendance_entries" ON public.attendance_entries FOR SELECT
USING (
  public.is_admin_user()
  OR (NOT public.current_user_has_branch_scope())
  OR public.is_unit_in_current_user_branch(unit_id)
);

DROP POLICY IF EXISTS "Authenticated read payroll_runs" ON public.payroll_runs;
DROP POLICY IF EXISTS "Scoped read payroll_runs" ON public.payroll_runs;
CREATE POLICY "Scoped read payroll_runs" ON public.payroll_runs FOR SELECT
USING (
  public.is_admin_user()
  OR (NOT public.current_user_has_branch_scope())
  OR public.is_unit_in_current_user_branch(unit_id)
);

DROP POLICY IF EXISTS "Authenticated read inv_demands" ON public.inv_demands;
DROP POLICY IF EXISTS "Scoped read inv_demands" ON public.inv_demands;
CREATE POLICY "Scoped read inv_demands" ON public.inv_demands FOR SELECT
USING (
  public.is_admin_user()
  OR public.current_user_is_inventory_manager()
  OR (NOT public.current_user_has_branch_scope())
  OR (branch_id::text IN (SELECT public.current_user_branch_scope_ids()))
);

DROP POLICY IF EXISTS "Authenticated read inv_goods_receipts" ON public.inv_goods_receipts;
DROP POLICY IF EXISTS "Scoped read inv_goods_receipts" ON public.inv_goods_receipts;
CREATE POLICY "Scoped read inv_goods_receipts" ON public.inv_goods_receipts FOR SELECT
USING (
  public.is_admin_user()
  OR public.current_user_is_inventory_manager()
  OR (NOT public.current_user_has_branch_scope())
  OR (branch_id::text IN (SELECT public.current_user_branch_scope_ids()))
);

DROP POLICY IF EXISTS "Authenticated read inv_issuances" ON public.inv_issuances;
DROP POLICY IF EXISTS "Scoped read inv_issuances" ON public.inv_issuances;
CREATE POLICY "Scoped read inv_issuances" ON public.inv_issuances FOR SELECT
USING (
  public.is_admin_user()
  OR public.current_user_is_inventory_manager()
  OR (NOT public.current_user_has_branch_scope())
  OR public.is_inv_location_in_current_user_scope(source_type, source_id)
  OR public.is_inv_location_in_current_user_scope(destination_type, destination_id)
);

DROP POLICY IF EXISTS "Authenticated read inv_transfers" ON public.inv_transfers;
DROP POLICY IF EXISTS "Scoped read inv_transfers" ON public.inv_transfers;
CREATE POLICY "Scoped read inv_transfers" ON public.inv_transfers FOR SELECT
USING (
  public.is_admin_user()
  OR public.current_user_is_inventory_manager()
  OR (NOT public.current_user_has_branch_scope())
  OR public.is_inv_location_in_current_user_scope(source_type, source_id)
  OR public.is_inv_location_in_current_user_scope(destination_type, destination_id)
);

DROP POLICY IF EXISTS "Authenticated read inv_stock_movements" ON public.inv_stock_movements;
DROP POLICY IF EXISTS "Scoped read inv_stock_movements" ON public.inv_stock_movements;
CREATE POLICY "Scoped read inv_stock_movements" ON public.inv_stock_movements FOR SELECT
USING (
  public.is_admin_user()
  OR public.current_user_is_inventory_manager()
  OR (NOT public.current_user_has_branch_scope())
  OR public.is_inv_location_in_current_user_scope(location_type, location_id)
);
