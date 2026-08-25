
-- 1. Helper: get the current user's role_key based on email pattern
CREATE OR REPLACE FUNCTION public.current_user_role_key()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.role_key
  FROM auth.users u
  JOIN public.candidates c
    ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
  WHERE u.id = auth.uid()
  LIMIT 1;
$$;

-- 2. Helper: is admin or super_admin
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role_key() IN ('admin','super_admin'), false);
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_role_key() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_role_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

-- ============================================================
-- CANDIDATES — admin/super_admin only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated read candidates" ON public.candidates;
DROP POLICY IF EXISTS "Authenticated write candidates" ON public.candidates;
DROP POLICY IF EXISTS "Authenticated update candidates" ON public.candidates;
DROP POLICY IF EXISTS "Authenticated delete candidates" ON public.candidates;

CREATE POLICY "Admins read candidates" ON public.candidates
  FOR SELECT TO authenticated USING (public.is_admin_user());
CREATE POLICY "Admins insert candidates" ON public.candidates
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins update candidates" ON public.candidates
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins delete candidates" ON public.candidates
  FOR DELETE TO authenticated USING (public.is_admin_user());

-- ============================================================
-- ADDITIONS / DEDUCTIONS — admin only
-- ============================================================
DROP POLICY IF EXISTS "auth read additions" ON public.additions;
DROP POLICY IF EXISTS "auth insert additions" ON public.additions;
DROP POLICY IF EXISTS "auth update additions" ON public.additions;
DROP POLICY IF EXISTS "auth delete additions" ON public.additions;
CREATE POLICY "Admins read additions" ON public.additions
  FOR SELECT TO authenticated USING (public.is_admin_user());
CREATE POLICY "Admins insert additions" ON public.additions
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins update additions" ON public.additions
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins delete additions" ON public.additions
  FOR DELETE TO authenticated USING (public.is_admin_user());

DROP POLICY IF EXISTS "auth read deductions" ON public.deductions;
DROP POLICY IF EXISTS "auth insert deductions" ON public.deductions;
DROP POLICY IF EXISTS "auth update deductions" ON public.deductions;
DROP POLICY IF EXISTS "auth delete deductions" ON public.deductions;
CREATE POLICY "Admins read deductions" ON public.deductions
  FOR SELECT TO authenticated USING (public.is_admin_user());
CREATE POLICY "Admins insert deductions" ON public.deductions
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins update deductions" ON public.deductions
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins delete deductions" ON public.deductions
  FOR DELETE TO authenticated USING (public.is_admin_user());

-- ============================================================
-- EMPLOYEE SIGNED DOCUMENTS — admin only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated read employee_signed_documents" ON public.employee_signed_documents;
DROP POLICY IF EXISTS "Authenticated write employee_signed_documents" ON public.employee_signed_documents;
DROP POLICY IF EXISTS "Authenticated update employee_signed_documents" ON public.employee_signed_documents;
DROP POLICY IF EXISTS "Authenticated delete employee_signed_documents" ON public.employee_signed_documents;
CREATE POLICY "Admins read employee_signed_documents" ON public.employee_signed_documents
  FOR SELECT TO authenticated USING (public.is_admin_user());
CREATE POLICY "Admins insert employee_signed_documents" ON public.employee_signed_documents
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins update employee_signed_documents" ON public.employee_signed_documents
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins delete employee_signed_documents" ON public.employee_signed_documents
  FOR DELETE TO authenticated USING (public.is_admin_user());

-- ============================================================
-- INV_VENDORS — admin only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated read inv_vendors" ON public.inv_vendors;
DROP POLICY IF EXISTS "Authenticated write inv_vendors" ON public.inv_vendors;
DROP POLICY IF EXISTS "Authenticated update inv_vendors" ON public.inv_vendors;
DROP POLICY IF EXISTS "Authenticated delete inv_vendors" ON public.inv_vendors;
CREATE POLICY "Admins read inv_vendors" ON public.inv_vendors
  FOR SELECT TO authenticated USING (public.is_admin_user());
CREATE POLICY "Admins insert inv_vendors" ON public.inv_vendors
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins update inv_vendors" ON public.inv_vendors
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins delete inv_vendors" ON public.inv_vendors
  FOR DELETE TO authenticated USING (public.is_admin_user());

-- ============================================================
-- ROLES / ROLE_PERMISSIONS — read by authenticated, write admin only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated read role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Authenticated write role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Authenticated update role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Authenticated delete role_permissions" ON public.role_permissions;
CREATE POLICY "Authenticated read role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert role_permissions" ON public.role_permissions
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins update role_permissions" ON public.role_permissions
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins delete role_permissions" ON public.role_permissions
  FOR DELETE TO authenticated USING (public.is_admin_user());

DROP POLICY IF EXISTS "Authenticated read roles" ON public.roles;
DROP POLICY IF EXISTS "Authenticated write roles" ON public.roles;
DROP POLICY IF EXISTS "Authenticated update roles" ON public.roles;
DROP POLICY IF EXISTS "Authenticated delete roles" ON public.roles;
CREATE POLICY "Authenticated read roles" ON public.roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert roles" ON public.roles
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins update roles" ON public.roles
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins delete roles" ON public.roles
  FOR DELETE TO authenticated USING (public.is_admin_user());

-- ============================================================
-- VEHICLE_FASTAGS — admin only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated read vehicle_fastags" ON public.vehicle_fastags;
DROP POLICY IF EXISTS "Authenticated write vehicle_fastags" ON public.vehicle_fastags;
DROP POLICY IF EXISTS "Authenticated update vehicle_fastags" ON public.vehicle_fastags;
DROP POLICY IF EXISTS "Authenticated delete vehicle_fastags" ON public.vehicle_fastags;
CREATE POLICY "Admins read vehicle_fastags" ON public.vehicle_fastags
  FOR SELECT TO authenticated USING (public.is_admin_user());
CREATE POLICY "Admins insert vehicle_fastags" ON public.vehicle_fastags
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins update vehicle_fastags" ON public.vehicle_fastags
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins delete vehicle_fastags" ON public.vehicle_fastags
  FOR DELETE TO authenticated USING (public.is_admin_user());

-- ============================================================
-- EMPLOYEE_SCOPE_ASSIGNMENTS — read auth, write admin only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated read employee_scope_assignments" ON public.employee_scope_assignments;
DROP POLICY IF EXISTS "Authenticated write employee_scope_assignments" ON public.employee_scope_assignments;
DROP POLICY IF EXISTS "Authenticated update employee_scope_assignments" ON public.employee_scope_assignments;
DROP POLICY IF EXISTS "Authenticated delete employee_scope_assignments" ON public.employee_scope_assignments;
CREATE POLICY "Authenticated read employee_scope_assignments" ON public.employee_scope_assignments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert employee_scope_assignments" ON public.employee_scope_assignments
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins update employee_scope_assignments" ON public.employee_scope_assignments
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins delete employee_scope_assignments" ON public.employee_scope_assignments
  FOR DELETE TO authenticated USING (public.is_admin_user());

-- ============================================================
-- SYSTEM_LOGS — admin read only, authenticated insert with own actor
-- ============================================================
DROP POLICY IF EXISTS "Authenticated read system_logs" ON public.system_logs;
DROP POLICY IF EXISTS "Authenticated insert system_logs" ON public.system_logs;
CREATE POLICY "Admins read system_logs" ON public.system_logs
  FOR SELECT TO authenticated USING (public.is_admin_user());
CREATE POLICY "Authenticated insert system_logs" ON public.system_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- ============================================================
-- NOTIFICATIONS — restrict insert to enforce actor_id
-- ============================================================
DROP POLICY IF EXISTS "Authenticated insert notifications" ON public.notifications;
CREATE POLICY "Authenticated insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (actor_id IS NULL OR actor_id = auth.uid());

-- ============================================================
-- STORAGE — make sensitive buckets private and tighten policies
-- ============================================================
-- (bucket visibility is changed via storage_update_bucket tool calls)

DROP POLICY IF EXISTS "Public read candidate-files" ON storage.objects;
DROP POLICY IF EXISTS "Public can read candidate-files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read candidate-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read candidate-files" ON storage.objects;
CREATE POLICY "Authenticated read candidate-files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'candidate-files');

DROP POLICY IF EXISTS "Public read vehicle-fuel-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Public can read vehicle-fuel-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read vehicle-fuel-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read vehicle-fuel-proofs" ON storage.objects;
CREATE POLICY "Authenticated read vehicle-fuel-proofs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vehicle-fuel-proofs');
