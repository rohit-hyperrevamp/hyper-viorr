CREATE TABLE public.contract_resources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id uuid NOT NULL REFERENCES public.client_contracts(id) ON DELETE CASCADE,
  designation_id uuid,
  service_type_id uuid,
  quantity integer NOT NULL DEFAULT 1,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  gross numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_resources_contract ON public.contract_resources(contract_id);

ALTER TABLE public.contract_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read contract_resources" ON public.contract_resources FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write contract_resources" ON public.contract_resources FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update contract_resources" ON public.contract_resources FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete contract_resources" ON public.contract_resources FOR DELETE TO authenticated USING (true);

CREATE TRIGGER contract_resources_updated_at BEFORE UPDATE ON public.contract_resources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();