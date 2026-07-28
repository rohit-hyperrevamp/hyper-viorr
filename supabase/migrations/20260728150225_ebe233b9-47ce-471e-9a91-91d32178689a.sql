CREATE OR REPLACE FUNCTION public.get_user_ids_by_role(_role_key text)
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT DISTINCT u.id
  FROM auth.users u
  JOIN public.candidates c
    ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
  WHERE c.role_key = _role_key
    AND c.status IN ('active','approved')
    AND COALESCE(c.is_enabled, true) = true;
$$;