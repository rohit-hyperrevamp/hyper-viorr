CREATE OR REPLACE FUNCTION public.enforce_contract_present_day_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_counts_as_present boolean := false;
  v_day_value numeric := 0;
  v_method text;
  v_fixed_days integer;
  v_contract_id uuid;
  v_current_present numeric := 0;
  v_period_start date;
  v_period_end date;
  v_start_day integer;
  v_end_day integer;
  v_anchor date;
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

  -- Period = the contract's payroll window, not the calendar month. A "26 to 25"
  -- window must cap the 26th->25th cycle; a "1 to 30/31" window is the month.
  SELECT pw.window_start_day, pw.window_end_day
    INTO v_start_day, v_end_day
  FROM public.client_contracts cc
  JOIN public.payroll_windows pw ON pw.id = cc.payroll_window_id
  WHERE cc.id = v_contract_id;

  IF COALESCE(v_start_day, 1) > 1 AND COALESCE(v_end_day, 0) > 0 AND v_end_day < v_start_day THEN
    IF EXTRACT(DAY FROM NEW.entry_date)::int >= v_start_day THEN
      v_anchor := date_trunc('month', NEW.entry_date)::date;
    ELSE
      v_anchor := (date_trunc('month', NEW.entry_date) - interval '1 month')::date;
    END IF;
    v_period_start := LEAST(
      v_anchor + (v_start_day - 1),
      (v_anchor + interval '1 month - 1 day')::date
    );
    v_period_end := LEAST(
      (v_anchor + interval '1 month')::date + (v_end_day - 1),
      (v_anchor + interval '2 month - 1 day')::date
    );
  ELSE
    v_period_start := date_trunc('month', NEW.entry_date)::date;
    v_period_end := (date_trunc('month', NEW.entry_date) + interval '1 month - 1 day')::date;
  END IF;

  -- Exclude the row this statement is replacing. On INSERT ... ON CONFLICT
  -- DO UPDATE, Postgres fires the BEFORE INSERT trigger before conflict
  -- resolution, so the pre-existing row for the same (unit, candidate,
  -- designation, date) is still visible and must not be double-counted.
  SELECT COALESCE(SUM(COALESCE(ac.day_value, 1)), 0)
    INTO v_current_present
  FROM public.attendance_entries ae
  JOIN public.attendance_codes ac ON ac.code = ae.code
  WHERE ae.unit_id = NEW.unit_id
    AND ae.candidate_id = NEW.candidate_id
    AND ae.designation_id IS NOT DISTINCT FROM NEW.designation_id
    AND ae.entry_date BETWEEN v_period_start AND v_period_end
    AND ac.counts_as_present = true
    AND ae.entry_date <> NEW.entry_date
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
$function$;