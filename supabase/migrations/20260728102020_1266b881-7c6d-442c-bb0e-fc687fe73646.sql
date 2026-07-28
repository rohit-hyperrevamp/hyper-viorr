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
  NEW.is_enabled := false;
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

CREATE OR REPLACE FUNCTION public.notify_guard_asset_issuance_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pending_fo_user_id uuid;
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
  asset_count := COALESCE(jsonb_array_length(COALESCE(NEW.onboarding_details->'issuance_asset_ids', '[]'::jsonb)), COALESCE(array_length(NEW.assigned_asset_ids, 1), 0), 0);

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
      ' is approved. Create a Field Officer to Guard issuance for ',
      asset_count,
      CASE WHEN asset_count = 1 THEN ' assigned asset' ELSE ' assigned assets' END,
      '. The guard must confirm receipt with OTP before activation.'
    ),
    CONCAT('/admin/inventory/issuances?candidate=', NEW.id::text, '&action=issue'),
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