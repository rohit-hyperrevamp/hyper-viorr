CREATE OR REPLACE FUNCTION public.enforce_single_primary_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Non-primary mappings are always reliever (extra duty only) postings.
  IF NEW.is_primary THEN
    NEW.is_reliever := false;
  ELSE
    NEW.is_reliever := true;
  END IF;

  IF NEW.is_primary THEN
    UPDATE public.candidate_units
       SET is_primary = false,
           is_reliever = true,
           updated_at = now()
     WHERE candidate_id = NEW.candidate_id
       AND id <> NEW.id
       AND is_primary;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_candidate_units_single_primary ON public.candidate_units;
CREATE TRIGGER trg_candidate_units_single_primary
BEFORE INSERT OR UPDATE OF is_primary, is_reliever ON public.candidate_units
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_primary_unit();

-- Backfill: keep the earliest/primary mapping per candidate, demote the rest.
WITH ranked AS (
  SELECT id, candidate_id,
         ROW_NUMBER() OVER (
           PARTITION BY candidate_id
           ORDER BY is_primary DESC, sort_order ASC, created_at ASC
         ) AS rn
    FROM public.candidate_units
)
UPDATE public.candidate_units cu
   SET is_primary = (r.rn = 1),
       is_reliever = (r.rn <> 1),
       updated_at = now()
  FROM ranked r
 WHERE r.id = cu.id
   AND (cu.is_primary <> (r.rn = 1) OR cu.is_reliever <> (r.rn <> 1));