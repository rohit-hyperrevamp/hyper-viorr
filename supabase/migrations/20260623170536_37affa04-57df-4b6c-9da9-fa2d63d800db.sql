
ALTER TABLE public.inv_issuances ADD COLUMN IF NOT EXISTS demand_id uuid REFERENCES public.inv_demands(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inv_issuances_demand ON public.inv_issuances(demand_id);

ALTER TABLE public.inv_demands ADD COLUMN IF NOT EXISTS requester_candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inv_demands_requester_cand ON public.inv_demands(requester_candidate_id);
