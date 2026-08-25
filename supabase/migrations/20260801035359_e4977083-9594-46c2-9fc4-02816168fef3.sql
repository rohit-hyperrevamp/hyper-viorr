ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS payroll_status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS invoice_status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS payroll_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payroll_processed_by uuid,
  ADD COLUMN IF NOT EXISTS invoice_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_processed_by uuid;

DO $$ BEGIN
  ALTER TABLE public.payroll_runs ADD CONSTRAINT payroll_runs_payroll_status_check CHECK (payroll_status IN ('open','processed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.payroll_runs ADD CONSTRAINT payroll_runs_invoice_status_check CHECK (invoice_status IN ('open','processed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs TO authenticated;
GRANT ALL ON public.payroll_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_sheets TO authenticated;
GRANT ALL ON public.attendance_sheets TO service_role;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_entries;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_sheets;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.payroll_runs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;