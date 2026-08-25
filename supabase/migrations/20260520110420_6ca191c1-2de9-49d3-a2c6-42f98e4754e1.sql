
CREATE SEQUENCE IF NOT EXISTS public.vehicle_code_seq START 1;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS vehicle_id text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.set_vehicle_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.vehicle_id IS NULL OR NEW.vehicle_id = '' THEN
    NEW.vehicle_id := 'VEH-' || lpad(nextval('public.vehicle_code_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_vehicle_id ON public.vehicles;
CREATE TRIGGER trg_set_vehicle_id
BEFORE INSERT ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.set_vehicle_id();

-- Backfill existing rows
UPDATE public.vehicles
SET vehicle_id = 'VEH-' || lpad(nextval('public.vehicle_code_seq')::text, 3, '0')
WHERE vehicle_id = '' OR vehicle_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_vehicle_id_key ON public.vehicles(vehicle_id);
