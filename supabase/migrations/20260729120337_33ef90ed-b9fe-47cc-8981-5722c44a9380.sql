
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
  unit_fee numeric := 0;
  flat_ref text;
  line_count integer := 0;
  src_ref text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status,'') <> 'completed' OR COALESCE(OLD.status,'') = 'completed' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.ack_otp_verified,false) IS NOT TRUE THEN RETURN NEW; END IF;
  IF COALESCE(NEW.destination_type,'') NOT IN ('guard','security_guard') THEN RETURN NEW; END IF;

  SELECT c.id, c.unit_id, c.full_name INTO cand
  FROM public.candidates c WHERE c.id = NEW.destination_id LIMIT 1;
  IF cand.id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(u.uniform_included, true), COALESCE(u.uniform_fee_amount, 0)
    INTO uniform_free, unit_fee
  FROM public.units u WHERE u.id = cand.unit_id LIMIT 1;
  IF COALESCE(uniform_free, true) THEN RETURN NEW; END IF;

  SELECT id INTO uniform_type_id FROM public.deduction_types WHERE code = 'uniform' LIMIT 1;
  IF uniform_type_id IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO line_count
  FROM public.inv_issuance_lines l WHERE l.issuance_id = NEW.id;

  -- No items on the issuance: single flat unit-fee line (once per guard/unit)
  IF line_count = 0 THEN
    IF COALESCE(unit_fee,0) > 0 THEN
      flat_ref := 'uniform_fee:' || cand.id::text || ':' || cand.unit_id::text;
      IF NOT EXISTS (
        SELECT 1 FROM public.deductions d
        WHERE d.source_kind = 'unit_fee' AND d.source_ref = flat_ref
      ) THEN
        INSERT INTO public.deductions (
          candidate_id, deduction_type_id, deduction_date, deduction_name,
          calculation_type, amount, installments, description, status,
          computed_amount, entry_mode, source_kind, source_ref
        ) VALUES (
          cand.id, uniform_type_id, COALESCE(NEW.acknowledged_at::date, CURRENT_DATE), 'Uniform Fee',
          'lumpsum', ROUND(unit_fee::numeric, 2), 1,
          'Auto-created from unit setting (uniform not included in contract) on OTP acknowledgement of issuance '
            || NEW.issuance_number || '. Admin can split into EMIs.',
          'active', ROUND(unit_fee::numeric, 2), 'lumpsum', 'unit_fee', flat_ref
        );
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Itemised deductions: charge each item at its ACTUAL product value × qty.
  FOR line IN
    SELECT l.item_id, l.size_value, l.qty, i.name AS item_name,
           COALESCE(NULLIF(i.standard_issue_price,0), NULLIF(i.standard_cost,0), NULLIF(i.last_purchase_price,0), 0) AS price
    FROM public.inv_issuance_lines l
    JOIN public.inv_items i ON i.id = l.item_id
    WHERE l.issuance_id = NEW.id
    ORDER BY i.name, l.size_value
  LOOP
    unit_price := COALESCE(line.price, 0);
    line_amount := ROUND(unit_price * COALESCE(line.qty,0), 2);

    IF line_amount <= 0 THEN CONTINUE; END IF;

    src_ref := NEW.id::text || ':' || line.item_id::text || ':' || COALESCE(line.size_value,'');
    IF EXISTS (
      SELECT 1 FROM public.deductions d
      WHERE d.source_kind = 'issuance' AND d.source_ref = src_ref
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
        || ' × ' || line.qty || ' @ ₹' || unit_price
        || ' (unit uniform not included in contract)',
      'active', line.qty, line_amount, 'lumpsum', 'issuance', src_ref
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Correct historical rows created by the previous apportioning logic:
-- reprice each issuance-sourced deduction to actual item price × qty.
UPDATE public.deductions d
SET amount = ROUND(COALESCE(NULLIF(i.standard_issue_price,0), NULLIF(i.standard_cost,0), NULLIF(i.last_purchase_price,0), 0) * COALESCE(l.qty,0), 2),
    computed_amount = ROUND(COALESCE(NULLIF(i.standard_issue_price,0), NULLIF(i.standard_cost,0), NULLIF(i.last_purchase_price,0), 0) * COALESCE(l.qty,0), 2),
    qty = COALESCE(l.qty, d.qty),
    description = 'Repriced to actual item value. ' || COALESCE(d.description,'')
FROM public.inv_issuance_lines l
JOIN public.inv_items i ON i.id = l.item_id
WHERE d.source_kind = 'issuance'
  AND d.source_ref LIKE (l.issuance_id::text || ':' || l.item_id::text || ':%')
  AND d.amount <> ROUND(COALESCE(NULLIF(i.standard_issue_price,0), NULLIF(i.standard_cost,0), NULLIF(i.last_purchase_price,0), 0) * COALESCE(l.qty,0), 2);
