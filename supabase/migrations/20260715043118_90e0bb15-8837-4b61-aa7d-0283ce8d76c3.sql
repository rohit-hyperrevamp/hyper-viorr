CREATE OR REPLACE FUNCTION public.apply_field_officer_onboarding_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  submitter_role text;
  submitter_candidate_id uuid;
BEGIN
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.role_key, c.id
    INTO submitter_role, submitter_candidate_id
  FROM auth.users u
  JOIN public.candidates c
    ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
  WHERE u.id = NEW.created_by
  LIMIT 1;

  IF submitter_role = 'field_officer' THEN
    IF COALESCE(NEW.role_key, '') = '' THEN
      NEW.role_key := 'guard';
    END IF;
    IF NEW.reports_to IS NULL THEN
      NEW.reports_to := submitter_candidate_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_field_officer_onboarding_defaults ON public.candidates;
CREATE TRIGGER trg_apply_field_officer_onboarding_defaults
BEFORE INSERT OR UPDATE OF created_by, role_key, reports_to ON public.candidates
FOR EACH ROW
EXECUTE FUNCTION public.apply_field_officer_onboarding_defaults();