ALTER TABLE public.contract_resources ADD COLUMN IF NOT EXISTS employer_contributions jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO public.cost_components (name, calc_type, percentage, base_components, cap_amount, amount, state, enabled, sort_order, notes)
VALUES ('Management Fee', 'fixed', 0, '[]'::jsonb, NULL, 2000, 'N/A', true, 0, 'Configurable management fee charged to client')
ON CONFLICT DO NOTHING;