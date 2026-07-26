CREATE OR REPLACE FUNCTION public.get_user_id_by_candidate_id(_candidate_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.id
  FROM public.candidates c
  JOIN auth.users u
    ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
  WHERE c.id = _candidate_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_id_by_candidate_id(uuid) TO authenticated;