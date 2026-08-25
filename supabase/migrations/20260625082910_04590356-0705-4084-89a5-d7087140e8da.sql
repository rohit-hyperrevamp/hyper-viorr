-- Auto-bump formula_version on Allowance/Cost master edits so contracts can
-- detect "newer master available" and the snapshot semantics actually work.

CREATE OR REPLACE FUNCTION public.bump_formula_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.formula_version IS NULL OR NEW.formula_version < 1 THEN
      NEW.formula_version := 1;
    END IF;
    RETURN NEW;
  END IF;

  IF (COALESCE(OLD.formula_mode, '') IS DISTINCT FROM COALESCE(NEW.formula_mode, ''))
     OR (COALESCE(OLD.formula_expression, '') IS DISTINCT FROM COALESCE(NEW.formula_expression, '')) THEN
    NEW.formula_version := COALESCE(OLD.formula_version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_formula_version_allowance ON public.allowance_types;
CREATE TRIGGER trg_bump_formula_version_allowance
  BEFORE INSERT OR UPDATE ON public.allowance_types
  FOR EACH ROW EXECUTE FUNCTION public.bump_formula_version();

DROP TRIGGER IF EXISTS trg_bump_formula_version_cost ON public.cost_components;
CREATE TRIGGER trg_bump_formula_version_cost
  BEFORE INSERT OR UPDATE ON public.cost_components
  FOR EACH ROW EXECUTE FUNCTION public.bump_formula_version();

-- Backfill: rows that already had a formula but version 0/NULL start at v1
UPDATE public.allowance_types
   SET formula_version = 1
 WHERE (formula_version IS NULL OR formula_version = 0)
   AND COALESCE(formula_expression, '') <> '';

UPDATE public.cost_components
   SET formula_version = 1
 WHERE (formula_version IS NULL OR formula_version = 0)
   AND COALESCE(formula_expression, '') <> '';