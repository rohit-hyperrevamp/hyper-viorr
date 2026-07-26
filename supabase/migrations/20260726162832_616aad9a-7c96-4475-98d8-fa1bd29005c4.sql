
ALTER TABLE public.self_attendance_punches
  ADD COLUMN IF NOT EXISTS last_lat numeric,
  ADD COLUMN IF NOT EXISTS last_lng numeric,
  ADD COLUMN IF NOT EXISTS last_accuracy numeric,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS battery_pct integer,
  ADD COLUMN IF NOT EXISTS battery_charging boolean,
  ADD COLUMN IF NOT EXISTS network_type text;

ALTER TABLE public.self_attendance_punches REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'self_attendance_punches'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.self_attendance_punches';
  END IF;
END $$;
