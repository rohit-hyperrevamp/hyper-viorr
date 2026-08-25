
-- 1. attendance_entries: admin-only writes
DROP POLICY IF EXISTS "Authenticated write attendance_entries" ON public.attendance_entries;
DROP POLICY IF EXISTS "Authenticated update attendance_entries" ON public.attendance_entries;
DROP POLICY IF EXISTS "Authenticated delete attendance_entries" ON public.attendance_entries;
CREATE POLICY "Admins insert attendance_entries" ON public.attendance_entries FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins update attendance_entries" ON public.attendance_entries FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins delete attendance_entries" ON public.attendance_entries FOR DELETE TO authenticated USING (public.is_admin_user());

-- 2. candidate_units: admin-only writes
DROP POLICY IF EXISTS "Authenticated write candidate_units" ON public.candidate_units;
DROP POLICY IF EXISTS "Authenticated update candidate_units" ON public.candidate_units;
DROP POLICY IF EXISTS "Authenticated delete candidate_units" ON public.candidate_units;
CREATE POLICY "Admins insert candidate_units" ON public.candidate_units FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins update candidate_units" ON public.candidate_units FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins delete candidate_units" ON public.candidate_units FOR DELETE TO authenticated USING (public.is_admin_user());

-- 3. payroll_runs: admin-only everything
DROP POLICY IF EXISTS "payroll_runs select" ON public.payroll_runs;
DROP POLICY IF EXISTS "payroll_runs insert" ON public.payroll_runs;
DROP POLICY IF EXISTS "payroll_runs update" ON public.payroll_runs;
DROP POLICY IF EXISTS "payroll_runs delete" ON public.payroll_runs;
CREATE POLICY "Admins select payroll_runs" ON public.payroll_runs FOR SELECT TO authenticated USING (public.is_admin_user());
CREATE POLICY "Admins insert payroll_runs" ON public.payroll_runs FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins update payroll_runs" ON public.payroll_runs FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins delete payroll_runs" ON public.payroll_runs FOR DELETE TO authenticated USING (public.is_admin_user());

-- 4. inv_vendor_rate_cards: admin-only
DROP POLICY IF EXISTS "Authenticated read inv_vendor_rate_cards" ON public.inv_vendor_rate_cards;
DROP POLICY IF EXISTS "Authenticated write inv_vendor_rate_cards" ON public.inv_vendor_rate_cards;
DROP POLICY IF EXISTS "Authenticated update inv_vendor_rate_cards" ON public.inv_vendor_rate_cards;
DROP POLICY IF EXISTS "Authenticated delete inv_vendor_rate_cards" ON public.inv_vendor_rate_cards;
CREATE POLICY "Admins select inv_vendor_rate_cards" ON public.inv_vendor_rate_cards FOR SELECT TO authenticated USING (public.is_admin_user());
CREATE POLICY "Admins insert inv_vendor_rate_cards" ON public.inv_vendor_rate_cards FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins update inv_vendor_rate_cards" ON public.inv_vendor_rate_cards FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins delete inv_vendor_rate_cards" ON public.inv_vendor_rate_cards FOR DELETE TO authenticated USING (public.is_admin_user());

-- 5. employee_scope_assignments: admin-only reads
DROP POLICY IF EXISTS "Authenticated read employee_scope_assignments" ON public.employee_scope_assignments;
CREATE POLICY "Admins read employee_scope_assignments" ON public.employee_scope_assignments FOR SELECT TO authenticated USING (public.is_admin_user());

-- 6. role_permissions: admin or own role
DROP POLICY IF EXISTS "Authenticated read role_permissions" ON public.role_permissions;
CREATE POLICY "Admins or own role read role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (public.is_admin_user() OR role_key = public.current_user_role_key());

-- 7. system_logs INSERT: require user_id = auth.uid()
DROP POLICY IF EXISTS "Authenticated insert system_logs" ON public.system_logs;
CREATE POLICY "Users insert own system_logs" ON public.system_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 8. set_updated_at: fixed search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 9. Revoke SECURITY DEFINER function execute from anon/public; grant only where needed
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_role_key() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role_key() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_user_ids() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_ids_with_approve(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_ids_with_approve(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_display_name(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_display_name(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.nextval(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nextval(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.inv_apply_stock_movement() FROM PUBLIC, anon, authenticated;

-- 10. Storage: drop public-read on private candidate-files bucket and on org-logos (public URLs still work)
DROP POLICY IF EXISTS "Candidate files public read" ON storage.objects;
DROP POLICY IF EXISTS "Public read org-logos" ON storage.objects;
