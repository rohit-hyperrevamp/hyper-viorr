
ALTER TABLE public.contract_resources
  ADD COLUMN IF NOT EXISTS role_key text REFERENCES public.roles(key) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contract_resources_role_key
  ON public.contract_resources(role_key);

CREATE UNIQUE INDEX IF NOT EXISTS contract_resources_unique_role_per_contract
  ON public.contract_resources(contract_id, role_key)
  WHERE role_key IS NOT NULL;

ALTER TABLE public.client_contracts
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS client_contracts_single_internal
  ON public.client_contracts((true))
  WHERE is_internal = true;
