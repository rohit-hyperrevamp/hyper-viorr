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

  -- Joining date drives when the fee is deducted (falls back to today).
  d_date := COALESCE(NEW.preferred_joining_date, CURRENT_DATE);

  IF COALESCE(u.gpaip_enabled,false) AND COALESCE(u.gpaip_amount,0) > 0 THEN
    SELECT id INTO t_id FROM public.deduction_types WHERE code = 'gpaip' LIMIT 1;
    ref := 'gpaip:' || NEW.id::text || ':' || u.id::text;
    IF t_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.deductions d WHERE d.source_kind='unit_fee' AND d.source_ref=ref) THEN
      INSERT INTO public.deductions (candidate_id, deduction_type_id, deduction_date, deduction_name,
        calculation_type, amount, installments, description, status, computed_amount, entry_mode, source_kind, source_ref)
      VALUES (NEW.id, t_id, d_date, 'GPAIP', 'lumpsum', ROUND(u.gpaip_amount::numeric,2), 1,
        'Auto-created from unit setting (GPAIP applicable). Admin can split into monthly instalments.',
        'active', ROUND(u.gpaip_amount::numeric,2), 'lumpsum', 'unit_fee', ref);
    END IF;
  END IF;

  IF COALESCE(u.recruitment_fee_enabled,false) AND COALESCE(u.recruitment_fee_amount,0) > 0 THEN
    SELECT id INTO t_id FROM public.deduction_types WHERE code = 'recruitment_fee' LIMIT 1;
    ref := 'recruitment_fee:' || NEW.id::text || ':' || u.id::text;
    IF t_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.deductions d WHERE d.source_kind='unit_fee' AND d.source_ref=ref) THEN
      INSERT INTO public.deductions (candidate_id, deduction_type_id, deduction_date, deduction_name,
        calculation_type, amount, installments, description, status, computed_amount, entry_mode, source_kind, source_ref)
      VALUES (NEW.id, t_id, d_date, 'Recruitment Fee', 'lumpsum', ROUND(u.recruitment_fee_amount::numeric,2), 1,
        'Auto-created from unit setting (recruitment fee applicable). Admin can split into monthly instalments.',
        'active', ROUND(u.recruitment_fee_amount::numeric,2), 'lumpsum', 'unit_fee', ref);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;