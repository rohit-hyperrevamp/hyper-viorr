GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_units TO authenticated;
GRANT ALL ON public.candidate_units TO service_role;

INSERT INTO public.candidate_units (candidate_id, unit_id, is_primary, sort_order)
SELECT c.id, c.unit_id, true, 0
FROM public.candidates c
WHERE c.unit_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.candidate_units cu
    WHERE cu.candidate_id = c.id
      AND cu.unit_id = c.unit_id
  )
ON CONFLICT (candidate_id, unit_id) DO NOTHING;