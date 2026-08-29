ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS units_single_internal_idx
  ON public.units ((true)) WHERE is_internal;

COMMENT ON COLUMN public.units.is_internal IS 'Marks this unit as the internal / non-billable unit. Non-billable employees are auto-assigned here as their billing unit. Only one unit can be internal.';