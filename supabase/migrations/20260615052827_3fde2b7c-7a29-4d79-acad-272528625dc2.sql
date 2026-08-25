CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND (
        u.email IN ('phone-8373914073@radiantguard.local', 'phone-8373149073@radiantguard.local', 'phone-8373914072@radiantguard.local')
        OR EXISTS (
          SELECT 1 FROM public.candidates c
          WHERE u.email = 'phone-' || c.mobile || '@radiantguard.local'
            AND c.role_key IN ('admin','super_admin')
        )
      )
  );
$$;