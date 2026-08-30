-- Who should hear about something an employee did, based on the reporting line.
CREATE OR REPLACE FUNCTION public.get_hierarchy_user_ids(_actor_user_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _candidate_id uuid;
BEGIN
  IF _actor_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT public.get_candidate_id_by_user_id(_actor_user_id) INTO _candidate_id;
  IF _candidate_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH actor_units AS (
    SELECT cu.unit_id FROM public.candidate_units cu WHERE cu.candidate_id = _candidate_id
    UNION
    SELECT c.unit_id FROM public.candidates c WHERE c.id = _candidate_id AND c.unit_id IS NOT NULL
  ),
  manager_candidates AS (
    -- explicit reporting managers
    SELECT crm.manager_id AS candidate_id
    FROM public.candidate_reporting_managers crm
    WHERE crm.candidate_id = _candidate_id AND crm.manager_id IS NOT NULL
    UNION
    SELECT c.reports_to
    FROM public.candidates c
    WHERE c.id = _candidate_id AND c.reports_to IS NOT NULL
    UNION
    -- field officers / managers mapped to the same units
    SELECT crm.manager_id
    FROM public.candidate_reporting_managers crm
    WHERE crm.manager_id IS NOT NULL
      AND crm.unit_id IN (SELECT unit_id FROM actor_units WHERE unit_id IS NOT NULL)
  ),
  manager_users AS (
    SELECT public.get_user_id_by_candidate(mc.candidate_id) AS uid
    FROM manager_candidates mc
    WHERE mc.candidate_id IS NOT NULL AND mc.candidate_id <> _candidate_id
  ),
  branch_users AS (
    SELECT b.user_id AS uid
    FROM actor_units au
    JOIN public.units u ON u.id = au.unit_id
    CROSS JOIN LATERAL public.get_user_ids_by_branch(u.branch_id) AS b(user_id)
    WHERE u.branch_id IS NOT NULL
  )
  SELECT DISTINCT uid
  FROM (
    SELECT uid FROM manager_users
    UNION
    SELECT uid FROM branch_users
  ) all_users
  WHERE uid IS NOT NULL AND uid <> _actor_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_hierarchy_user_ids(uuid) TO authenticated, service_role;