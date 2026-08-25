-- Add employee_code field and auto-assign on approval
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS employee_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

CREATE SEQUENCE IF NOT EXISTS public.employee_code_seq START 1;

CREATE OR REPLACE FUNCTION public.set_employee_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('approved','active')
     AND (NEW.employee_code IS NULL OR NEW.employee_code = '') THEN
    NEW.employee_code := 'EMP-' || lpad(nextval('public.employee_code_seq')::text, 3, '0');
    IF NEW.approved_at IS NULL THEN
      NEW.approved_at := now();
    END IF;
  END IF;
  IF NEW.status = 'rejected' AND NEW.rejected_at IS NULL THEN
    NEW.rejected_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_employee_code_ins ON public.candidates;
CREATE TRIGGER trg_set_employee_code_ins
  BEFORE INSERT ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_employee_code();

DROP TRIGGER IF EXISTS trg_set_employee_code_upd ON public.candidates;
CREATE TRIGGER trg_set_employee_code_upd
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_employee_code();