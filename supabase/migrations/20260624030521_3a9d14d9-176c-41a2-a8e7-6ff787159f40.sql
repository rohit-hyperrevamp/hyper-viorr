
-- 1. Schema changes
ALTER TABLE public.inv_demands
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.inv_warehouses(id);

ALTER TABLE public.inv_demands
  ALTER COLUMN branch_id DROP NOT NULL;

-- 2. Backfill: convert old "warehouse" demands so warehouse_id is set and branch_id is cleared
UPDATE public.inv_demands d
SET warehouse_id = COALESCE(
      (SELECT w.id FROM public.inv_warehouses w WHERE w.is_default = true AND w.enabled = true LIMIT 1),
      (SELECT w.id FROM public.inv_warehouses w WHERE w.enabled = true ORDER BY w.created_at LIMIT 1)
    ),
    branch_id = NULL
WHERE d.fulfillment_source = 'warehouse'
  AND d.warehouse_id IS NULL;

-- 3. Add consistency check: exactly one destination
ALTER TABLE public.inv_demands DROP CONSTRAINT IF EXISTS inv_demands_destination_chk;
ALTER TABLE public.inv_demands
  ADD CONSTRAINT inv_demands_destination_chk
  CHECK (
    (branch_id IS NOT NULL AND warehouse_id IS NULL)
    OR (branch_id IS NULL AND warehouse_id IS NOT NULL)
  );

-- 4. Drop old policies on inv_demands
DROP POLICY IF EXISTS "Admins read inv_demands" ON public.inv_demands;
DROP POLICY IF EXISTS "Branch users delete own draft inv_demands" ON public.inv_demands;
DROP POLICY IF EXISTS "Branch users insert own inv_demands" ON public.inv_demands;
DROP POLICY IF EXISTS "Branch users read own inv_demands" ON public.inv_demands;
DROP POLICY IF EXISTS "Branch users update own inv_demands" ON public.inv_demands;
DROP POLICY IF EXISTS "Read inv_demands by scope" ON public.inv_demands;
DROP POLICY IF EXISTS "Scoped read inv_demands" ON public.inv_demands;

-- 5. Recreate policies on inv_demands
-- READ: admin OR inventory manager OR requester OR (branch user AND demand is for their branch)
CREATE POLICY "Read inv_demands"
  ON public.inv_demands FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.current_user_is_inventory_manager()
    OR (requester_id = auth.uid())
    OR (requester_candidate_id = public.current_user_candidate_id())
    OR (branch_id IS NOT NULL AND branch_id = public.current_user_branch_id())
    OR (NOT public.current_user_has_branch_scope() AND warehouse_id IS NOT NULL)
  );

-- INSERT: requester themselves, branch users for their branch, inv mgr / admin anywhere
CREATE POLICY "Insert inv_demands"
  ON public.inv_demands FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_user()
    OR public.current_user_is_inventory_manager()
    OR (
      (requester_id = auth.uid() OR requester_candidate_id = public.current_user_candidate_id())
      AND (
        warehouse_id IS NOT NULL
        OR (branch_id IS NOT NULL AND branch_id = public.current_user_branch_id())
      )
    )
  );

-- UPDATE: admin / inv mgr always; requester on their own non-final demand; branch user on their branch's demand
CREATE POLICY "Update inv_demands"
  ON public.inv_demands FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.current_user_is_inventory_manager()
    OR (
      (requester_id = auth.uid() OR requester_candidate_id = public.current_user_candidate_id())
      AND status = ANY (ARRAY['draft','submitted'])
    )
    OR (branch_id IS NOT NULL AND branch_id = public.current_user_branch_id()
        AND status = ANY (ARRAY['draft','submitted','in_transit']))
  )
  WITH CHECK (
    public.is_admin_user()
    OR public.current_user_is_inventory_manager()
    OR (
      (requester_id = auth.uid() OR requester_candidate_id = public.current_user_candidate_id())
      AND status = ANY (ARRAY['draft','submitted'])
    )
    OR (branch_id IS NOT NULL AND branch_id = public.current_user_branch_id()
        AND status = ANY (ARRAY['draft','submitted','in_transit','fulfilled']))
  );

-- DELETE: only drafts, by admin or requester or branch user
CREATE POLICY "Delete inv_demands"
  ON public.inv_demands FOR DELETE
  TO authenticated
  USING (
    public.is_admin_user()
    OR (
      status = 'draft'
      AND (
        requester_id = auth.uid()
        OR requester_candidate_id = public.current_user_candidate_id()
        OR (branch_id IS NOT NULL AND branch_id = public.current_user_branch_id())
      )
    )
  );

-- 6. Update inv_demand_lines policies to follow the new parent visibility
DROP POLICY IF EXISTS "Branch users update own inv_demand_lines" ON public.inv_demand_lines;
DROP POLICY IF EXISTS "Delete inv_demand_lines via parent" ON public.inv_demand_lines;
DROP POLICY IF EXISTS "Read inv_demand_lines by scope" ON public.inv_demand_lines;
DROP POLICY IF EXISTS "Read inv_demand_lines via parent" ON public.inv_demand_lines;
DROP POLICY IF EXISTS "Update inv_demand_lines via parent" ON public.inv_demand_lines;
DROP POLICY IF EXISTS "Write inv_demand_lines via parent" ON public.inv_demand_lines;

CREATE POLICY "Read inv_demand_lines"
  ON public.inv_demand_lines FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.inv_demands d
      WHERE d.id = inv_demand_lines.demand_id
        AND (
          public.current_user_is_inventory_manager()
          OR d.requester_id = auth.uid()
          OR d.requester_candidate_id = public.current_user_candidate_id()
          OR (d.branch_id IS NOT NULL AND d.branch_id = public.current_user_branch_id())
          OR (NOT public.current_user_has_branch_scope() AND d.warehouse_id IS NOT NULL)
        )
    )
  );

CREATE POLICY "Insert inv_demand_lines"
  ON public.inv_demand_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.inv_demands d
      WHERE d.id = inv_demand_lines.demand_id
        AND (
          public.current_user_is_inventory_manager()
          OR d.requester_id = auth.uid()
          OR d.requester_candidate_id = public.current_user_candidate_id()
          OR (d.branch_id IS NOT NULL AND d.branch_id = public.current_user_branch_id())
        )
    )
  );

CREATE POLICY "Update inv_demand_lines"
  ON public.inv_demand_lines FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.inv_demands d
      WHERE d.id = inv_demand_lines.demand_id
        AND (
          public.current_user_is_inventory_manager()
          OR d.requester_id = auth.uid()
          OR d.requester_candidate_id = public.current_user_candidate_id()
          OR (d.branch_id IS NOT NULL AND d.branch_id = public.current_user_branch_id())
        )
    )
  );

CREATE POLICY "Delete inv_demand_lines"
  ON public.inv_demand_lines FOR DELETE
  TO authenticated
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.inv_demands d
      WHERE d.id = inv_demand_lines.demand_id
        AND (
          public.current_user_is_inventory_manager()
          OR d.requester_id = auth.uid()
          OR d.requester_candidate_id = public.current_user_candidate_id()
          OR (d.branch_id IS NOT NULL AND d.branch_id = public.current_user_branch_id())
        )
    )
  );
