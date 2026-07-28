CREATE OR REPLACE FUNCTION public.create_issuance_deductions_on_ack()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uniform_type_id uuid;
  cand record;
  line record;
  unit_price numeric;
  line_amount numeric;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status, '') <> 'completed' OR COALESCE(OLD.status, '') = 'completed' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.ack_otp_verified, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.destination_type, '') NOT IN ('guard', 'security_guard') THEN
    RETURN NEW;
  END IF;

  SELECT c.id, c.unit_id, c.full_name
    INTO cand
  FROM public.candidates c
  WHERE c.id = NEW.destination_id
  LIMIT 1;

  IF cand.id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO uniform_type_id
  FROM public.deduction_types
  WHERE code = 'uniform'
  LIMIT 1;

  IF uniform_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR line IN
    SELECT l.item_id, l.size_value, l.qty, i.name AS item_name, i.item_code,
           COALESCE(NULLIF(i.standard_issue_price, 0), NULLIF(i.standard_cost, 0), NULLIF(i.last_purchase_price, 0), 0) AS price
    FROM public.inv_issuance_lines l
    JOIN public.inv_items i ON i.id = l.item_id
    WHERE l.issuance_id = NEW.id
  LOOP
    unit_price := COALESCE(line.price, 0);
    line_amount := ROUND(unit_price * COALESCE(line.qty, 0), 2);

    IF line_amount <= 0 THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.deductions d
      WHERE d.source_kind = 'issuance'
        AND d.source_ref = NEW.id::text || ':' || line.item_id::text || ':' || COALESCE(line.size_value, '')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.deductions (
      candidate_id, deduction_type_id, deduction_date, deduction_name,
      calculation_type, amount, installments, description, status,
      qty, computed_amount, entry_mode, source_kind, source_ref
    )
    VALUES (
      cand.id,
      uniform_type_id,
      COALESCE(NEW.acknowledged_at::date, CURRENT_DATE),
      line.item_name,
      'lumpsum',
      line_amount,
      1,
      'Auto-created on OTP acknowledgement of issuance ' || NEW.issuance_number
        || ' — ' || line.item_name
        || CASE WHEN COALESCE(line.size_value, '') <> '' THEN ' (size ' || line.size_value || ')' ELSE '' END
        || ' × ' || line.qty || ' @ ' || unit_price,
      'active',
      line.qty,
      line_amount,
      'lumpsum',
      'issuance',
      NEW.id::text || ':' || line.item_id::text || ':' || COALESCE(line.size_value, '')
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_issuance_deductions_on_ack ON public.inv_issuances;
CREATE TRIGGER trg_create_issuance_deductions_on_ack
AFTER UPDATE ON public.inv_issuances
FOR EACH ROW EXECUTE FUNCTION public.create_issuance_deductions_on_ack();