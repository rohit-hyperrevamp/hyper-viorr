CREATE OR REPLACE FUNCTION public.get_user_display_name(_user_id uuid)
RETURNS TABLE(full_name text, mobile text, role_key text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.full_name, c.mobile, c.role_key
  FROM auth.users u
  JOIN public.candidates c
    ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
  WHERE u.id = _user_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_display_name(uuid) TO authenticated;