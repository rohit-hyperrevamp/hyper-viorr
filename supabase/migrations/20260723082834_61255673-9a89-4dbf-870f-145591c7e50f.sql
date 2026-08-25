CREATE OR REPLACE FUNCTION public.get_user_ids_by_unit(_unit_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT u.id
  FROM auth.users u
  JOIN public.candidates c
    ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
  WHERE c.status IN ('active','approved')
    AND (
      c.unit_id = _unit_id
      OR EXISTS (
        SELECT 1 FROM public.candidate_units cu
        WHERE cu.candidate_id = c.id AND cu.unit_id = _unit_id
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_user_ids_by_unit(uuid) TO authenticated, service_role;