
-- Rename acknowledged → completed across issuance-related data
UPDATE public.inv_issuances SET status = 'completed' WHERE status = 'acknowledged';

-- If a check constraint restricts status values, recreate it
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'inv_issuances'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%acknowledged%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.inv_issuances DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE public.inv_issuances
  ADD CONSTRAINT inv_issuances_status_check
  CHECK (status IN ('draft','issued','completed'));
