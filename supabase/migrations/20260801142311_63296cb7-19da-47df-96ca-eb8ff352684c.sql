ALTER TABLE public.candidate_units
  ADD COLUMN IF NOT EXISTS is_reliever boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.candidate_units.is_reliever IS
  'True when the employee was added to this unit ad-hoc from the muster roll (stand-in). Reliever lines are tracked as overtime only. Regular multi-unit deployments stay false.';