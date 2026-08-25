CREATE OR REPLACE FUNCTION public.enforce_reliever_extra_duty_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reliever boolean;
  v_desig uuid;
  v_found boolean := false;
BEGIN
  SELECT cu.is_reliever, cu.designation_id
    INTO v_reliever, v_desig
  FROM public.candidate_units cu
  WHERE cu.candidate_id = NEW.candidate_id
    AND cu.unit_id = NEW.unit_id
  LIMIT 1;

  IF FOUND THEN
    v_found := true;
  END IF;

  IF NOT v_found THEN
    SELECT c.designation_id INTO v_desig
    FROM public.candidates c
    WHERE c.id = NEW.candidate_id
      AND c.unit_id = NEW.unit_id;
  END IF;

  IF COALESCE(v_reliever, false) THEN
    NEW.code := '';
    RETURN NEW;
  END IF;

  IF v_desig IS NOT NULL
     AND NEW.designation_id IS NOT NULL
     AND NEW.designation_id <> v_desig THEN
    NEW.code := '';
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.attendance_entries ae
SET code = ''
WHERE ae.code <> ''
  AND ae.designation_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.candidate_units cu
    WHERE cu.candidate_id = ae.candidate_id
      AND cu.unit_id = ae.unit_id
      AND (cu.is_reliever = true
           OR (cu.designation_id IS NOT NULL AND cu.designation_id <> ae.designation_id))
  );