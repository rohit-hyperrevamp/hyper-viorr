CREATE OR REPLACE FUNCTION public.create_issuance_deductions_on_ack()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uniform_type_id uuid;
  cand record;
  line record;
  unit_price numeric;
  line_amount numeric;
  uniform_free boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status,'') <> 'completed' OR COALESCE(OLD.status,'') = 'completed' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.ack_otp_verified,false) IS NOT TRUE THEN RETURN NEW; END IF;
  IF COALESCE(NEW.destination_type,'') NOT IN ('guard','security_guard') THEN RETURN NEW; END IF;

  SELECT c.id, c.unit_id, c.full_name INTO cand
  FROM public.candidates c WHERE c.id = NEW.destination_id LIMIT 1;
  IF cand.id IS NULL THEN RETURN NEW; END IF;

  -- Uniform included in the contract => no recovery from the guard
  SELECT COALESCE(u.uniform_included, true) INTO uniform_free
  FROM public.units u WHERE u.id = cand.unit_id LIMIT 1;
  IF COALESCE(uniform_free, true) THEN RETURN NEW; END IF;

  SELECT id INTO uniform_type_id FROM public.deduction_types WHERE code = 'uniform' LIMIT 1;
  IF uniform_type_id IS NULL THEN RETURN NEW; END IF;

  FOR line IN
    SELECT l.item_id, l.size_value, l.qty, i.name AS item_name,
           COALESCE(NULLIF(i.standard_issue_price,0), NULLIF(i.standard_cost,0), NULLIF(i.last_purchase_price,0), 0) AS price
    FROM public.inv_issuance_lines l
    JOIN public.inv_items i ON i.id = l.item_id
    WHERE l.issuance_id = NEW.id
  LOOP
    unit_price := COALESCE(line.price, 0);
    line_amount := ROUND(unit_price * COALESCE(line.qty,0), 2);
    IF line_amount <= 0 THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM public.deductions d
      WHERE d.source_kind = 'issuance'
        AND d.source_ref = NEW.id::text || ':' || line.item_id::text || ':' || COALESCE(line.size_value,'')
    ) THEN CONTINUE; END IF;

    INSERT INTO public.deductions (
      candidate_id, deduction_type_id, deduction_date, deduction_name,
      calculation_type, amount, installments, description, status,
      qty, computed_amount, entry_mode, source_kind, source_ref
    ) VALUES (
      cand.id, uniform_type_id, COALESCE(NEW.acknowledged_at::date, CURRENT_DATE), line.item_name,
      'lumpsum', line_amount, 1,
      'Auto-created on OTP acknowledgement of issuance ' || NEW.issuance_number
        || ' — ' || line.item_name
        || CASE WHEN COALESCE(line.size_value,'') <> '' THEN ' (size ' || line.size_value || ')' ELSE '' END
        || ' × ' || line.qty || ' @ ' || unit_price
        || ' (unit uniform not included)',
      'active', line.qty, line_amount, 'lumpsum', 'issuance',
      NEW.id::text || ':' || line.item_id::text || ':' || COALESCE(line.size_value,'')
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_unit_fee_deductions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  u record;
  t_id uuid;
  ref text;
BEGIN
  IF COALESCE(NEW.status,'') NOT IN ('active','approved') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status,'') IN ('active','approved') THEN RETURN NEW; END IF;
  IF NEW.unit_id IS NULL THEN RETURN NEW; END IF;

  SELECT id, gpaip_enabled, gpaip_amount, recruitment_fee_enabled, recruitment_fee_amount
    INTO u FROM public.units WHERE id = NEW.unit_id LIMIT 1;
  IF u.id IS NULL THEN RETURN NEW; END IF;

  IF COALESCE(u.gpaip_enabled,false) AND COALESCE(u.gpaip_amount,0) > 0 THEN
    SELECT id INTO t_id FROM public.deduction_types WHERE code = 'gpaip' LIMIT 1;
    ref := 'gpaip:' || NEW.id::text || ':' || u.id::text;
    IF t_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.deductions d WHERE d.source_kind='unit_fee' AND d.source_ref=ref) THEN
      INSERT INTO public.deductions (candidate_id, deduction_type_id, deduction_date, deduction_name,
        calculation_type, amount, installments, description, status, computed_amount, entry_mode, source_kind, source_ref)
      VALUES (NEW.id, t_id, CURRENT_DATE, 'GPAIP', 'lumpsum', ROUND(u.gpaip_amount::numeric,2), 1,
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
      VALUES (NEW.id, t_id, CURRENT_DATE, 'Recruitment Fee', 'lumpsum', ROUND(u.recruitment_fee_amount::numeric,2), 1,
        'Auto-created from unit setting (recruitment fee applicable). Admin can split into monthly instalments.',
        'active', ROUND(u.recruitment_fee_amount::numeric,2), 'lumpsum', 'unit_fee', ref);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_apply_unit_fee_deductions ON public.candidates;
CREATE TRIGGER trg_apply_unit_fee_deductions
AFTER INSERT OR UPDATE OF status ON public.candidates
FOR EACH ROW EXECUTE FUNCTION public.apply_unit_fee_deductions();