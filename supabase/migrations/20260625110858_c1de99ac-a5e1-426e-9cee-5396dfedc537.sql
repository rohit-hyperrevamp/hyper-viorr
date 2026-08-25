CREATE POLICY "Inventory managers read employee scope assignments"
ON public.employee_scope_assignments
FOR SELECT
TO authenticated
USING (public.current_user_is_inventory_manager());