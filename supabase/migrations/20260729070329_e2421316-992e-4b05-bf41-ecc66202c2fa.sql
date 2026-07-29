DROP FUNCTION IF EXISTS public.find_rehire_candidate_by_aadhaar(text);

CREATE OR REPLACE FUNCTION public.find_rehire_candidate_by_aadhaar(_aadhaar text)
RETURNS TABLE(
  id uuid,
  full_name text,
  employee_code text,
  candidate_code text,
  mobile text,
  status text,
  aadhaar_number text,
  unit_id uuid,
  resignation_url text,
  id_card_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.full_name,
    c.employee_code,
    c.candidate_code,
    c.mobile,
    c.status,
    c.aadhaar_number,
    c.unit_id,
    (
      SELECT d.value ->> 'file_url'
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(COALESCE(c.offboarding_details, '{}'::jsonb) -> 'exit_documents') = 'array'
            THEN COALESCE(c.offboarding_details, '{}'::jsonb) -> 'exit_documents'
          ELSE '[]'::jsonb
        END
      ) AS d
      WHERE d.value ->> 'key' = 'resignation_letter'
        AND COALESCE(d.value ->> 'file_url', '') <> ''
      LIMIT 1
    ) AS resignation_url,
    (
      SELECT d.value ->> 'file_url'
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(COALESCE(c.offboarding_details, '{}'::jsonb) -> 'exit_documents') = 'array'
            THEN COALESCE(c.offboarding_details, '{}'::jsonb) -> 'exit_documents'
          ELSE '[]'::jsonb
        END
      ) AS d
      WHERE d.value ->> 'key' = 'id_card_photo'
        AND COALESCE(d.value ->> 'file_url', '') <> ''
      LIMIT 1
    ) AS id_card_url
  FROM public.candidates c
  WHERE regexp_replace(COALESCE(c.aadhaar_number, ''), '\D', '', 'g') = regexp_replace(COALESCE(_aadhaar, ''), '\D', '', 'g')
    AND regexp_replace(COALESCE(_aadhaar, ''), '\D', '', 'g') <> ''
  ORDER BY c.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_rehire_candidate_by_aadhaar(text) TO authenticated;