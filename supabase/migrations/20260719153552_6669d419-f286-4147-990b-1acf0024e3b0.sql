
-- Preflight login check: does this mobile belong to a super admin OR an active/approved & enabled employee?
CREATE OR REPLACE FUNCTION public.can_phone_login(_mobile text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Super-admin allowlist (matches is_admin_user() list)
    _mobile IN ('8373914073','8373149073','8373914072')
    OR EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.mobile = _mobile
        AND c.status IN ('active','approved')
        AND COALESCE(c.is_enabled, true) = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_phone_login(text) TO anon, authenticated;

-- Mid-session check: is the currently signed-in user still an active employee?
CREATE OR REPLACE FUNCTION public.is_current_employee_active()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin_user()
    OR EXISTS (
      SELECT 1
      FROM auth.users u
      JOIN public.candidates c
        ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
      WHERE u.id = auth.uid()
        AND c.status IN ('active','approved')
        AND COALESCE(c.is_enabled, true) = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_current_employee_active() TO authenticated;
