CREATE OR REPLACE FUNCTION public.get_admin_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users
  WHERE email LIKE 'phone-%@radiantguard.local'
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_user_ids() TO authenticated;