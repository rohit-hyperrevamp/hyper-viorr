ALTER TABLE public.candidate_units
  ADD COLUMN IF NOT EXISTS designation_id uuid REFERENCES public.designations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_candidate_units_designation ON public.candidate_units(designation_id);

-- Backfill: use the candidate's own designation when that designation is actually
-- contracted on that unit.
UPDATE public.candidate_units cu
SET designation_id = c.designation_id
FROM public.candidates c
WHERE cu.candidate_id = c.id
  AND cu.designation_id IS NULL
  AND c.designation_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.units u
    JOIN public.client_contracts cc ON cc.unit_id = u.id AND cc.record_type = 'client'
    JOIN public.contract_resources cr ON cr.contract_id = cc.id
    WHERE u.id = cu.unit_id
      AND cr.designation_id = c.designation_id
  );