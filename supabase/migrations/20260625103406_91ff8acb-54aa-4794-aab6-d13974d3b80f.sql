-- Allow inventory_manager full access on vendor master + rate cards
DROP POLICY IF EXISTS "Admins read inv_vendors" ON public.inv_vendors;
DROP POLICY IF EXISTS "Admins insert inv_vendors" ON public.inv_vendors;
DROP POLICY IF EXISTS "Admins update inv_vendors" ON public.inv_vendors;
DROP POLICY IF EXISTS "Admins delete inv_vendors" ON public.inv_vendors;

CREATE POLICY "Admins or inv mgr read inv_vendors" ON public.inv_vendors
  FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.current_user_is_inventory_manager());
CREATE POLICY "Admins or inv mgr insert inv_vendors" ON public.inv_vendors
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user() OR public.current_user_is_inventory_manager());
CREATE POLICY "Admins or inv mgr update inv_vendors" ON public.inv_vendors
  FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR public.current_user_is_inventory_manager())
  WITH CHECK (public.is_admin_user() OR public.current_user_is_inventory_manager());
CREATE POLICY "Admins or inv mgr delete inv_vendors" ON public.inv_vendors
  FOR DELETE TO authenticated
  USING (public.is_admin_user() OR public.current_user_is_inventory_manager());

DROP POLICY IF EXISTS "Admins select inv_vendor_rate_cards" ON public.inv_vendor_rate_cards;
DROP POLICY IF EXISTS "Admins insert inv_vendor_rate_cards" ON public.inv_vendor_rate_cards;
DROP POLICY IF EXISTS "Admins update inv_vendor_rate_cards" ON public.inv_vendor_rate_cards;
DROP POLICY IF EXISTS "Admins delete inv_vendor_rate_cards" ON public.inv_vendor_rate_cards;

CREATE POLICY "Admins or inv mgr select inv_vendor_rate_cards" ON public.inv_vendor_rate_cards
  FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.current_user_is_inventory_manager());
CREATE POLICY "Admins or inv mgr insert inv_vendor_rate_cards" ON public.inv_vendor_rate_cards
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user() OR public.current_user_is_inventory_manager());
CREATE POLICY "Admins or inv mgr update inv_vendor_rate_cards" ON public.inv_vendor_rate_cards
  FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR public.current_user_is_inventory_manager())
  WITH CHECK (public.is_admin_user() OR public.current_user_is_inventory_manager());
CREATE POLICY "Admins or inv mgr delete inv_vendor_rate_cards" ON public.inv_vendor_rate_cards
  FOR DELETE TO authenticated
  USING (public.is_admin_user() OR public.current_user_is_inventory_manager());