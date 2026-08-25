CREATE OR REPLACE FUNCTION public.current_user_has_permission(_module_key text, _sub_module_key text DEFAULT '', _action text DEFAULT 'view')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH user_role AS (
    SELECT c.role_key
    FROM auth.users u
    JOIN public.candidates c
      ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
    WHERE u.id = auth.uid()
    LIMIT 1
  )
  SELECT COALESCE((
    SELECT
      CASE
        WHEN ur.role_key IN ('admin', 'super_admin') THEN true
        WHEN _action = 'view' THEN rp.can_view
        WHEN _action = 'edit' THEN rp.can_edit
        WHEN _action = 'delete' THEN rp.can_delete
        WHEN _action = 'approve' THEN rp.can_approve
        ELSE false
      END
    FROM user_role ur
    JOIN public.role_permissions rp
      ON rp.role_key = ur.role_key
     AND rp.module_key = _module_key
     AND COALESCE(rp.sub_module_key, '') = COALESCE(_sub_module_key, '')
    LIMIT 1
  ), false);
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_fastags TO authenticated;
GRANT ALL ON public.vehicle_fastags TO service_role;

DROP POLICY IF EXISTS "Admins read vehicle_fastags" ON public.vehicle_fastags;
DROP POLICY IF EXISTS "Admins insert vehicle_fastags" ON public.vehicle_fastags;
DROP POLICY IF EXISTS "Admins update vehicle_fastags" ON public.vehicle_fastags;
DROP POLICY IF EXISTS "Admins delete vehicle_fastags" ON public.vehicle_fastags;

CREATE POLICY "Permitted users read vehicle_fastags"
ON public.vehicle_fastags
FOR SELECT
TO authenticated
USING (
  public.is_admin_user()
  OR public.current_user_has_permission('vehicles', 'fastag_manager', 'view')
);

CREATE POLICY "Permitted users insert vehicle_fastags"
ON public.vehicle_fastags
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_user()
  OR public.current_user_has_permission('vehicles', 'fastag_manager', 'edit')
);

CREATE POLICY "Permitted users update vehicle_fastags"
ON public.vehicle_fastags
FOR UPDATE
TO authenticated
USING (
  public.is_admin_user()
  OR public.current_user_has_permission('vehicles', 'fastag_manager', 'edit')
)
WITH CHECK (
  public.is_admin_user()
  OR public.current_user_has_permission('vehicles', 'fastag_manager', 'edit')
);

CREATE POLICY "Permitted users delete vehicle_fastags"
ON public.vehicle_fastags
FOR DELETE
TO authenticated
USING (
  public.is_admin_user()
  OR public.current_user_has_permission('vehicles', 'fastag_manager', 'delete')
);