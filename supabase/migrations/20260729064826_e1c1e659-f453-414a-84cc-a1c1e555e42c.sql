CREATE OR REPLACE FUNCTION public.find_rehire_candidate_by_aadhaar(_aadhaar text)
RETURNS TABLE(
  id uuid,
  full_name text,
  employee_code text,
  candidate_code text,
  mobile text,
  status text,
  aadhaar_number text,
  unit_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    c.full_name,
    c.employee_code,
    c.candidate_code,
    c.mobile,
    c.status,
    c.aadhaar_number,
    c.unit_id
  FROM public.candidates c
  WHERE auth.uid() IS NOT NULL
    AND public.current_user_can_submit_onboarding()
    AND regexp_replace(COALESCE(_aadhaar, ''), '\D', '', 'g') <> ''
    AND c.aadhaar_number = regexp_replace(COALESCE(_aadhaar, ''), '\D', '', 'g')
  ORDER BY c.created_at DESC
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.find_rehire_candidate_by_aadhaar(text) TO authenticated;