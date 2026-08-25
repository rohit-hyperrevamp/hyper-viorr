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
      ' is approved. Create a Field Officer to Guard issuance for ',
      asset_count,
      CASE WHEN asset_count = 1 THEN ' assigned asset' ELSE ' assigned assets' END,
      '. The guard must confirm receipt with OTP before activation.'
    ),
    '/admin/inventory/issuances',
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

CREATE OR REPLACE FUNCTION public.complete_guard_onboarding_after_issuance_ack()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  candidate_details jsonb;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status, '') <> 'completed' OR COALESCE(OLD.status, '') = 'completed' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.destination_type, '') NOT IN ('guard', 'security_guard') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.ack_method, '') <> 'otp' OR COALESCE(NEW.ack_otp_verified, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(c.onboarding_details, '{}'::jsonb)
    INTO candidate_details
  FROM public.candidates c
  WHERE c.id = NEW.destination_id
    AND c.role_key IN ('guard', 'security_guard')
    AND c.status = 'approved'
    AND COALESCE(c.onboarding_details->>'issuance_status', '') = 'pending'
  LIMIT 1;

  IF candidate_details IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.candidates c
     SET status = 'active',
         is_enabled = true,
         onboarding_details = candidate_details || jsonb_build_object(
           'issuance_status', 'completed',
           'issuance_completed_at', COALESCE(NEW.acknowledged_at, now()),
           'issuance_completed_by', COALESCE(NEW.received_by::text, ''),
           'issuance_completed_via', 'otp',
           'issuance_id', NEW.id::text,
           'issuance_number', NEW.issuance_number
         ),
         updated_at = now()
   WHERE c.id = NEW.destination_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complete_guard_onboarding_after_issuance_ack ON public.inv_issuances;
CREATE TRIGGER trg_complete_guard_onboarding_after_issuance_ack
AFTER UPDATE OF status, acknowledged_at, ack_otp_verified
ON public.inv_issuances
FOR EACH ROW
EXECUTE FUNCTION public.complete_guard_onboarding_after_issuance_ack();