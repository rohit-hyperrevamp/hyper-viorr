-- Tag existing one-time GPAIP rows with their joining year so the annual
-- generator treats them as the first-year premium.
UPDATE public.deductions d
SET source_ref = d.source_ref || ':' || to_char(d.deduction_date, 'YYYY')
WHERE d.source_kind = 'unit_fee'
  AND d.source_ref LIKE 'gpaip:%'
  AND array_length(string_to_array(d.source_ref, ':'), 1) = 3;

-- Annual GPAIP: one premium per joining anniversary, per active unit mapping.
CREATE OR REPLACE FUNCTION public.ensure_annual_gpaip_deductions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_id uuid;
  inserted integer := 0;
  r record;
  yr integer;
  anniv date;
  ref text;
BEGIN
  SELECT id INTO t_id FROM public.deduction_types WHERE code = 'gpaip' LIMIT 1;
  IF t_id IS NULL THEN RETURN 0; END IF;

  FOR r IN
    SELECT DISTINCT c.id AS candidate_id, c.preferred_joining_date AS doj,
           u.id AS unit_id, u.gpaip_amount
    FROM public.candidates c
    JOIN public.candidate_units cu ON cu.candidate_id = c.id
    JOIN public.units u ON u.id = cu.unit_id
    WHERE COALESCE(c.status,'') IN ('active','approved')
      AND c.preferred_joining_date IS NOT NULL
      AND COALESCE(u.gpaip_enabled,false)
      AND COALESCE(u.gpaip_amount,0) > 0
  LOOP
    FOR yr IN EXTRACT(YEAR FROM r.doj)::int .. EXTRACT(YEAR FROM CURRENT_DATE)::int LOOP
      anniv := make_date(yr, EXTRACT(MONTH FROM r.doj)::int, LEAST(EXTRACT(DAY FROM r.doj)::int, 28));
      IF anniv < r.doj OR anniv > CURRENT_DATE + INTERVAL '31 days' THEN CONTINUE; END IF;
      ref := 'gpaip:' || r.candidate_id::text || ':' || r.unit_id::text || ':' || yr::text;
      IF NOT EXISTS (SELECT 1 FROM public.deductions d WHERE d.source_kind='unit_fee' AND d.source_ref = ref) THEN
        INSERT INTO public.deductions (candidate_id, deduction_type_id, deduction_date, deduction_name,
          calculation_type, amount, installments, description, status, computed_amount, entry_mode, source_kind, source_ref)
        VALUES (r.candidate_id, t_id, anniv, 'GPAIP', 'lumpsum', ROUND(r.gpaip_amount::numeric,2), 1,
          'Annual GPAIP premium (joining anniversary ' || yr::text || ').',
          'active', ROUND(r.gpaip_amount::numeric,2), 'lumpsum', 'unit_fee', ref);
        inserted := inserted + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_annual_gpaip_deductions() FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_annual_gpaip_deductions() TO authenticated, service_role;

-- Keep the on-activation trigger for the joining-year premium consistent
-- with the annual ref format.
CREATE OR REPLACE FUNCTION public.apply_unit_fee_deductions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u record;
  t_id uuid;
  ref text;
  d_date date;
BEGIN
  IF COALESCE(NEW.status,'') NOT IN ('active','approved') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status,'') IN ('active','approved') THEN RETURN NEW; END IF;
  IF NEW.unit_id IS NULL THEN RETURN NEW; END IF;

  SELECT id, gpaip_enabled, gpaip_amount, recruitment_fee_enabled, recruitment_fee_amount
    INTO u FROM public.units WHERE id = NEW.unit_id LIMIT 1;
  IF u.id IS NULL THEN RETURN NEW; END IF;

  d_date := COALESCE(NEW.preferred_joining_date, CURRENT_DATE);

  IF COALESCE(u.gpaip_enabled,false) AND COALESCE(u.gpaip_amount,0) > 0 THEN
    SELECT id INTO t_id FROM public.deduction_types WHERE code = 'gpaip' LIMIT 1;
    ref := 'gpaip:' || NEW.id::text || ':' || u.id::text || ':' || to_char(d_date,'YYYY');
    IF t_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.deductions d WHERE d.source_kind='unit_fee' AND d.source_ref=ref) THEN
      INSERT INTO public.deductions (candidate_id, deduction_type_id, deduction_date, deduction_name,
        calculation_type, amount, installments, description, status, computed_amount, entry_mode, source_kind, source_ref)
      VALUES (NEW.id, t_id, d_date, 'GPAIP', 'lumpsum', ROUND(u.gpaip_amount::numeric,2), 1,
        'Annual GPAIP premium (joining year).', 'active', ROUND(u.gpaip_amount::numeric,2), 'lumpsum', 'unit_fee', ref);
    END IF;
  END IF;

  IF COALESCE(u.recruitment_fee_enabled,false) AND COALESCE(u.recruitment_fee_amount,0) > 0 THEN
    SELECT id INTO t_id FROM public.deduction_types WHERE code = 'recruitment_fee' LIMIT 1;
    ref := 'recruitment_fee:' || NEW.id::text || ':' || u.id::text;
    IF t_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.deductions d WHERE d.source_kind='unit_fee' AND d.source_ref=ref) THEN
      INSERT INTO public.deductions (candidate_id, deduction_type_id, deduction_date, deduction_name,
        calculation_type, amount, installments, description, status, computed_amount, entry_mode, source_kind, source_ref)
      VALUES (NEW.id, t_id, d_date, 'Recruitment Fee', 'lumpsum', ROUND(u.recruitment_fee_amount::numeric,2), 1,
        'One-time recruitment fee (unit setting).', 'active', ROUND(u.recruitment_fee_amount::numeric,2), 'lumpsum', 'unit_fee', ref);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;