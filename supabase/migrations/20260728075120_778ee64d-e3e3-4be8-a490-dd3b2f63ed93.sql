ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS uniform_included boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.units.uniform_included IS
  'When true, uniforms issued to staff on this unit are covered by the client contract (free to the staff member). When false, uniform value is charged to the staff member.';