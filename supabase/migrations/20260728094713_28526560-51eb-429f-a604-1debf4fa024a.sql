CREATE OR REPLACE FUNCTION public.resolve_candidate_issuance_field_officer(
  _candidate_id uuid,
  _unit_id uuid,
  _reports_to uuid
)
RETURNS TABLE(fo_candidate_id uuid, fo_user_id uuid, fo_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH candidates_fo AS (
    SELECT c.id AS fo_candidate_id,
           public.get_user_id_by_candidate(c.id) AS fo_user_id,
           c.full_name AS fo_name,
           1 AS priority
    FROM public.candidates c
    WHERE c.id = _reports_to
      AND c.role_key = 'field_officer'
      AND c.status IN ('active', 'approved')
      AND COALESCE(c.is_enabled, true) = true

    UNION ALL

    SELECT m.id AS fo_candidate_id,
           public.get_user_id_by_candidate(m.id) AS fo_user_id,
           m.full_name AS fo_name,
           2 AS priority
    FROM public.candidate_reporting_managers crm
    JOIN public.candidates m ON m.id = crm.manager_id
    WHERE crm.candidate_id = _candidate_id
      AND m.role_key = 'field_officer'
      AND m.status IN ('active', 'approved')
      AND COALESCE(m.is_enabled, true) = true

    UNION ALL

    SELECT f.id AS fo_candidate_id,
           public.get_user_id_by_candidate(f.id) AS fo_user_id,
           f.full_name AS fo_name,
           3 AS priority
    FROM public.candidate_units guard_units
    JOIN public.candidate_units fo_units ON fo_units.unit_id = guard_units.unit_id
    JOIN public.candidates f ON f.id = fo_units.candidate_id
    WHERE guard_units.candidate_id = _candidate_id
      AND f.role_key = 'field_officer'
      AND f.status IN ('active', 'approved')
      AND COALESCE(f.is_enabled, true) = true

    UNION ALL

    SELECT f.id AS fo_candidate_id,
           public.get_user_id_by_candidate(f.id) AS fo_user_id,
           f.full_name AS fo_name,
           4 AS priority
    FROM public.candidate_units fo_units
    JOIN public.candidates f ON f.id = fo_units.candidate_id
    WHERE fo_units.unit_id = _unit_id
      AND f.role_key = 'field_officer'
      AND f.status IN ('active', 'approved')
      AND COALESCE(f.is_enabled, true) = true
  )
  SELECT c.fo_candidate_id, c.fo_user_id, c.fo_name
  FROM candidates_fo c
  WHERE c.fo_user_id IS NOT NULL
  ORDER BY c.priority, c.fo_name
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.prepare_guard_asset_issuance_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  fo_row record;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.role_key, '') NOT IN ('guard', 'security_guard') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.status, '') NOT IN ('draft', 'pending', 'rejected') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status, '') NOT IN ('active', 'approved') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.onboarding_details->>'issuance_status', '') IN ('pending', 'completed') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(array_length(NEW.assigned_asset_ids, 1), 0) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO fo_row
  FROM public.resolve_candidate_issuance_field_officer(NEW.id, NEW.unit_id, NEW.reports_to)
  LIMIT 1;

  IF fo_row.fo_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.status := 'approved';
  NEW.is_enabled := true;
  NEW.onboarding_details := COALESCE(NEW.onboarding_details, '{}'::jsonb) || jsonb_build_object(
    'pending_issuance_fo_id', fo_row.fo_user_id::text,
    'pending_issuance_fo_name', fo_row.fo_name,
    'issuance_status', 'pending',
    'issuance_requested_at', now(),
    'issuance_asset_ids', to_jsonb(NEW.assigned_asset_ids)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_guard_asset_issuance_on_approval ON public.candidates;
CREATE TRIGGER trg_prepare_guard_asset_issuance_on_approval
BEFORE UPDATE OF status, assigned_asset_ids, reports_to, unit_id, onboarding_details
ON public.candidates
FOR EACH ROW
EXECUTE FUNCTION public.prepare_guard_asset_issuance_on_approval();

CREATE OR REPLACE FUNCTION public.notify_guard_asset_issuance_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pending_fo_user_id uuid;
  pending_fo_name text;
  asset_count integer;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.onboarding_details->>'issuance_status', '') <> 'pending' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.onboarding_details->>'issuance_status', '') = 'pending' THEN
    RETURN NEW;
  END IF;

  pending_fo_user_id := NULLIF(NEW.onboarding_details->>'pending_issuance_fo_id', '')::uuid;
  pending_fo_name := NULLIF(NEW.onboarding_details->>'pending_issuance_fo_name', '');
  asset_count := COALESCE(array_length(NEW.assigned_asset_ids, 1), 0);

  IF pending_fo_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    user_id,
    actor_id,
    type,
    title,
    message,
    link,
    entity_type,
    entity_id
  )
  SELECT
    pending_fo_user_id,
    auth.uid(),
    'candidate_issuance_pending',
    'Issue assets to new employee',
    CONCAT(
      COALESCE(NULLIF(NEW.full_name, ''), 'New employee'),
      CASE WHEN COALESCE(NEW.employee_code, '') <> '' THEN CONCAT(' (', NEW.employee_code, ')') ELSE '' END,
      ' is approved. Issue ',
      asset_count,
      CASE WHEN asset_count = 1 THEN ' assigned asset' ELSE ' assigned assets' END,
      ' to activate their account.'
    ),
    '/admin/inventory/collections',
    'candidate',
    NEW.id::text
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = pending_fo_user_id
      AND n.type = 'candidate_issuance_pending'
      AND n.entity_type = 'candidate'
      AND n.entity_id = NEW.id::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_guard_asset_issuance_pending ON public.candidates;
CREATE TRIGGER trg_notify_guard_asset_issuance_pending
AFTER UPDATE OF status, onboarding_details
ON public.candidates
FOR EACH ROW
EXECUTE FUNCTION public.notify_guard_asset_issuance_pending();

WITH latest_guard AS (
  SELECT c.id, fo.fo_user_id, fo.fo_name
  FROM public.candidates c
  CROSS JOIN LATERAL public.resolve_candidate_issuance_field_officer(c.id, c.unit_id, c.reports_to) fo
  WHERE c.role_key IN ('guard', 'security_guard')
    AND c.status = 'active'
    AND COALESCE(c.onboarding_details->>'issuance_status', '') = ''
    AND COALESCE(array_length(c.assigned_asset_ids, 1), 0) > 0
  ORDER BY c.created_at DESC
  LIMIT 1
)
UPDATE public.candidates c
SET status = 'approved',
    is_enabled = true,
    onboarding_details = COALESCE(c.onboarding_details, '{}'::jsonb) || jsonb_build_object(
      'pending_issuance_fo_id', latest_guard.fo_user_id::text,
      'pending_issuance_fo_name', latest_guard.fo_name,
      'issuance_status', 'pending',
      'issuance_requested_at', now(),
      'issuance_asset_ids', to_jsonb(c.assigned_asset_ids)
    )
FROM latest_guard
WHERE c.id = latest_guard.id;
