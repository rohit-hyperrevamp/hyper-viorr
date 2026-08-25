-- Add Prospect → Client workflow to client_contracts.

-- 1. Make contract_code nullable (only populated on promotion to client).
ALTER TABLE public.client_contracts
  ALTER COLUMN contract_code DROP NOT NULL;

-- 2. New columns.
ALTER TABLE public.client_contracts
  ADD COLUMN IF NOT EXISTS record_type text NOT NULL DEFAULT 'prospect',
  ADD COLUMN IF NOT EXISTS prospect_code text,
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz;

-- 3. Backfill: anything already approved or with a contract_code => client.
UPDATE public.client_contracts
   SET record_type = 'client',
       promoted_at = COALESCE(promoted_at, signed_at, approved_at, updated_at, now())
 WHERE approval_status = 'approved'
    OR (contract_code IS NOT NULL AND contract_code <> '');

-- Everything else => prospect (already default).
UPDATE public.client_contracts
   SET record_type = 'prospect'
 WHERE record_type IS DISTINCT FROM 'client';

-- 4. Sequence + backfill of prospect codes for existing prospects.
CREATE SEQUENCE IF NOT EXISTS public.prospect_code_seq START 1;

UPDATE public.client_contracts
   SET prospect_code = 'PROS-' || lpad(nextval('public.prospect_code_seq')::text, 4, '0')
 WHERE prospect_code IS NULL OR prospect_code = '';

-- 5. Unique prospect_code where present.
CREATE UNIQUE INDEX IF NOT EXISTS client_contracts_prospect_code_key
  ON public.client_contracts (prospect_code)
  WHERE prospect_code IS NOT NULL;

-- 6. Constraint: record_type must be one of the two values.
ALTER TABLE public.client_contracts
  DROP CONSTRAINT IF EXISTS client_contracts_record_type_chk;
ALTER TABLE public.client_contracts
  ADD CONSTRAINT client_contracts_record_type_chk
    CHECK (record_type IN ('prospect', 'client'));