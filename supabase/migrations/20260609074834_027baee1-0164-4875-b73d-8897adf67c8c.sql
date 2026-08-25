CREATE UNIQUE INDEX IF NOT EXISTS client_contracts_one_active_per_unit
  ON public.client_contracts (unit_id)
  WHERE record_type = 'client'
    AND status = 'active'
    AND approval_status = 'approved'
    AND unit_id IS NOT NULL;