
-- Allow employees to see teammates in their assigned units
CREATE OR REPLACE FUNCTION public.current_user_unit_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT id, unit_id FROM public.candidates WHERE mobile = public.current_user_mobile() LIMIT 1
  )
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT u FROM (
        SELECT unit_id AS u FROM me WHERE unit_id IS NOT NULL
        UNION
        SELECT cu.unit_id FROM public.candidate_units cu JOIN me ON cu.candidate_id = me.id WHERE cu.unit_id IS NOT NULL
      ) s
    ),
    ARRAY[]::uuid[]
  );
$$;

CREATE POLICY "Employees read teammates in their units"
ON public.candidates
FOR SELECT
USING (
  unit_id IS NOT NULL
  AND status = ANY (ARRAY['approved'::text, 'active'::text])
  AND unit_id = ANY (public.current_user_unit_ids())
);
