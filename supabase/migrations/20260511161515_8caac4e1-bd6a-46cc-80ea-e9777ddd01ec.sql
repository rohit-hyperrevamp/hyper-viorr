
CREATE TABLE public.system_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  entity_label TEXT NOT NULL DEFAULT '',
  user_phone TEXT NOT NULL DEFAULT '',
  user_id UUID,
  user_role TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_system_logs_created_at ON public.system_logs (created_at DESC);
CREATE INDEX idx_system_logs_module ON public.system_logs (module);
CREATE INDEX idx_system_logs_action ON public.system_logs (action);
CREATE INDEX idx_system_logs_user_phone ON public.system_logs (user_phone);
CREATE INDEX idx_system_logs_entity_id ON public.system_logs (entity_id);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read system_logs"
  ON public.system_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert system_logs"
  ON public.system_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);
