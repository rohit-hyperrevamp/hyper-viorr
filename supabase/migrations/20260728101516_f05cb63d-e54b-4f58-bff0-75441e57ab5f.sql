CREATE OR REPLACE FUNCTION public.notify_guard_asset_issuance_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;