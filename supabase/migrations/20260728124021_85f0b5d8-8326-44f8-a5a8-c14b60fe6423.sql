CREATE OR REPLACE FUNCTION public.prepare_guard_asset_issuance_on_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Keep the account enabled so the guard can log in and acknowledge issuance via OTP.
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
$function$;

UPDATE public.candidates
   SET is_enabled = true,
       updated_at = now()
 WHERE status = 'approved'
   AND COALESCE(onboarding_details->>'issuance_status', '') = 'pending'
   AND COALESCE(is_enabled, false) = false;