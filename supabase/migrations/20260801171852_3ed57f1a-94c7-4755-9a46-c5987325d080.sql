UPDATE public.attendance_entries
SET ot_hours = 1
WHERE entry_date = DATE '2026-08-01'
  AND ot_hours = 8
  AND unit_id IN (
    '0d96b552-083f-4b5f-aca7-2af7ec3e6c2c'::uuid,
    '055981ff-793b-415b-bc37-a045ae1d25c4'::uuid
  );

UPDATE public.contract_resources
SET components = jsonb_build_array(
      jsonb_build_object(
        'name', 'Basic',
        'amount', gross,
        'includeInOt', true,
        'formulaMode', 'preset',
        'formulaExpression', NULL,
        'formulaVersion', 1
      )
    ),
    updated_at = now()
WHERE id = 'f1ee7171-c77a-4944-ac78-47d478df9abb'::uuid
  AND gross > 0
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(components, '[]'::jsonb)) AS component
    WHERE COALESCE((component->>'amount')::numeric, 0) <> 0
  );

CREATE OR REPLACE FUNCTION public.autofill_daily_attendance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF CURRENT_DATE > DATE '2026-08-04' THEN
    RETURN;
  END IF;

  INSERT INTO public.attendance_entries (unit_id, candidate_id, designation_id, entry_date, code, ot_hours)
  SELECT x.unit_id, x.candidate_id, x.designation_id, CURRENT_DATE, 'P',
         CASE
           WHEN x.unit_id IN (
             '0d96b552-083f-4b5f-aca7-2af7ec3e6c2c'::uuid,
             '055981ff-793b-415b-bc37-a045ae1d25c4'::uuid
           ) THEN 1
           ELSE 0
         END
  FROM (
    SELECT DISTINCT u.id AS unit_id, c.id AS candidate_id, c.designation_id
    FROM public.units u
    JOIN public.candidates c ON (
      c.unit_id = u.id OR EXISTS (
        SELECT 1
        FROM public.candidate_units cu
        WHERE cu.candidate_id = c.id
          AND cu.unit_id = u.id
          AND cu.is_reliever = false
      )
    )
    WHERE u.id IN (
      SELECT unit_id
      FROM public.client_contracts
      WHERE status = 'active'
    )
      AND u.id <> '92541381-14d3-4be6-ae8c-078b79c2e0f1'::uuid
      AND c.status = 'active'
      AND c.is_enabled
      AND NOT c.non_billable
      AND COALESCE(c.role_key, '') NOT IN (
        'field_officer','branch_manager','hr','leadership','transport','inventory',
        'admin','super_admin','user','accounts','operations','operations_manager',
        'area_manager','regional_manager','vp_operations'
      )
  ) x
  ON CONFLICT (unit_id, candidate_id, designation_id, entry_date) DO UPDATE
  SET code = 'P', ot_hours = EXCLUDED.ot_hours;
END;
$function$;