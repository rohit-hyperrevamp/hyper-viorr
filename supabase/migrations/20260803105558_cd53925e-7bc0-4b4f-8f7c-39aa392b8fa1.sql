CREATE OR REPLACE FUNCTION public.enforce_contract_present_day_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts_as_present boolean := false;
  v_day_value numeric := 0;
  v_method text;
  v_fixed_days integer;
  v_contract_id uuid;
  v_current_present numeric := 0;
  v_period_start date;
  v_period_end date;
BEGIN
  SELECT COALESCE(ac.counts_as_present, false),
         CASE WHEN COALESCE(ac.counts_as_present, false) THEN COALESCE(ac.day_value, 1) ELSE 0 END
    INTO v_counts_as_present, v_day_value
  FROM public.attendance_codes ac
  WHERE ac.code = NEW.code;

  IF NOT COALESCE(v_counts_as_present, false) THEN
    RETURN NEW;
  END IF;

  SELECT cc.id
    INTO v_contract_id
  FROM public.client_contracts cc
  WHERE cc.unit_id = NEW.unit_id
    AND cc.record_type = 'client'
    AND cc.status = 'active'
    AND cc.start_date <= NEW.entry_date
    AND (cc.end_date IS NULL OR cc.end_date >= NEW.entry_date)
  ORDER BY cc.start_date DESC, cc.created_at DESC
  LIMIT 1;

  IF v_contract_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pdb.method, pdb.fixed_days
    INTO v_method, v_fixed_days
  FROM public.contract_resources cr
  JOIN public.payroll_day_bases pdb ON pdb.id = cr.payroll_day_base_id
  WHERE cr.contract_id = v_contract_id
    AND cr.designation_id = NEW.designation_id
  ORDER BY cr.sort_order ASC, cr.created_at ASC
  LIMIT 1;

  IF v_method IS DISTINCT FROM 'fixed_days' OR COALESCE(v_fixed_days, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  v_period_start := date_trunc('month', NEW.entry_date)::date;
  v_period_end := (date_trunc('month', NEW.entry_date) + interval '1 month - 1 day')::date;

  SELECT COALESCE(SUM(COALESCE(ac.day_value, 1)), 0)
    INTO v_current_present
  FROM public.attendance_entries ae
  JOIN public.attendance_codes ac ON ac.code = ae.code
  WHERE ae.unit_id = NEW.unit_id
    AND ae.candidate_id = NEW.candidate_id
    AND ae.designation_id IS NOT DISTINCT FROM NEW.designation_id
    AND ae.entry_date BETWEEN v_period_start AND v_period_end
    AND ac.counts_as_present = true
    AND NOT (
      TG_OP = 'UPDATE'
      AND ae.unit_id = OLD.unit_id
      AND ae.candidate_id = OLD.candidate_id
      AND ae.designation_id IS NOT DISTINCT FROM OLD.designation_id
      AND ae.entry_date = OLD.entry_date
    );

  IF v_current_present + v_day_value > v_fixed_days THEN
    RAISE EXCEPTION 'Payroll days limit (%) reached for this contract designation. Record additional duty as Extra Duty.', v_fixed_days
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_contract_present_day_limit_trigger ON public.attendance_entries;
CREATE TRIGGER enforce_contract_present_day_limit_trigger
BEFORE INSERT OR UPDATE OF code, unit_id, candidate_id, designation_id, entry_date
ON public.attendance_entries
FOR EACH ROW
EXECUTE FUNCTION public.enforce_contract_present_day_limit();