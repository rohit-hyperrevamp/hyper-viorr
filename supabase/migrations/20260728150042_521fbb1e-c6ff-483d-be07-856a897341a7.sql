-- ============ Workflow engine ============
CREATE TABLE public.workflow_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  entity_type text NOT NULL DEFAULT 'rehire',
  route_path text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_definitions TO authenticated;
GRANT ALL ON public.workflow_definitions TO service_role;
ALTER TABLE public.workflow_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_defs_select" ON public.workflow_definitions FOR SELECT TO authenticated
  USING (public.is_current_employee_active());
CREATE POLICY "workflow_defs_write" ON public.workflow_definitions FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.current_user_has_permission('control_center','workflows','edit'))
  WITH CHECK (public.is_admin_user() OR public.current_user_has_permission('control_center','workflows','edit'));

CREATE TABLE public.workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflow_definitions(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  approver_role_key text NOT NULL,
  action_label text NOT NULL DEFAULT 'Approve',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, step_order),
  UNIQUE (workflow_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_steps TO authenticated;
GRANT ALL ON public.workflow_steps TO service_role;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_steps_select" ON public.workflow_steps FOR SELECT TO authenticated
  USING (public.is_current_employee_active());
CREATE POLICY "workflow_steps_write" ON public.workflow_steps FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.current_user_has_permission('control_center','workflows','edit'))
  WITH CHECK (public.is_admin_user() OR public.current_user_has_permission('control_center','workflows','edit'));

-- ============ Rehire requests ============
CREATE SEQUENCE IF NOT EXISTS public.rehire_request_seq START 1;

CREATE TABLE public.rehire_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text UNIQUE,
  workflow_key text NOT NULL DEFAULT 'rehire',
  previous_candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  new_candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  aadhaar_number text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  mobile text NOT NULL DEFAULT '',
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  requested_by uuid,
  requested_by_candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  resignation_url text NOT NULL DEFAULT '',
  id_card_url text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  current_step_order int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  rejection_reason text NOT NULL DEFAULT '',
  new_employee_code text NOT NULL DEFAULT '',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rehire_requests_status ON public.rehire_requests(status, current_step_order);
CREATE INDEX idx_rehire_requests_aadhaar ON public.rehire_requests(aadhaar_number);

CREATE OR REPLACE FUNCTION public.set_rehire_request_number()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.request_number IS NULL OR NEW.request_number = '' THEN
    NEW.request_number := 'RH-' || lpad(nextval('public.rehire_request_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_set_rehire_request_number BEFORE INSERT ON public.rehire_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_rehire_request_number();
CREATE TRIGGER trg_rehire_requests_updated_at BEFORE UPDATE ON public.rehire_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_workflow_defs_updated_at BEFORE UPDATE ON public.workflow_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_workflow_steps_updated_at BEFORE UPDATE ON public.workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: role that owns the current step of a request
CREATE OR REPLACE FUNCTION public.rehire_current_step_role(_request_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.approver_role_key
  FROM public.rehire_requests r
  JOIN public.workflow_definitions d ON d.key = r.workflow_key
  JOIN public.workflow_steps s ON s.workflow_id = d.id AND s.step_order = r.current_step_order
  WHERE r.id = _request_id AND s.is_active
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_action_rehire(_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_admin_user()
      OR COALESCE(public.current_user_role_key(), '') = COALESCE(public.rehire_current_step_role(_request_id), '~none~');
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_rehire_participant()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_admin_user()
      OR EXISTS (
        SELECT 1 FROM public.workflow_steps s
        WHERE s.approver_role_key = COALESCE(public.current_user_role_key(), '~none~')
      );
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rehire_requests TO authenticated;
GRANT ALL ON public.rehire_requests TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rehire_request_seq TO authenticated, service_role;
ALTER TABLE public.rehire_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rehire_select" ON public.rehire_requests FOR SELECT TO authenticated
  USING (
    public.is_admin_user()
    OR requested_by = auth.uid()
    OR public.current_user_is_rehire_participant()
  );
CREATE POLICY "rehire_insert" ON public.rehire_requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND public.is_current_employee_active()
  );
CREATE POLICY "rehire_update" ON public.rehire_requests FOR UPDATE TO authenticated
  USING (public.current_user_can_action_rehire(id) OR requested_by = auth.uid())
  WITH CHECK (public.current_user_can_action_rehire(id) OR requested_by = auth.uid());
CREATE POLICY "rehire_delete" ON public.rehire_requests FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- ============ Rehire request events (audit trail) ============
CREATE TABLE public.rehire_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.rehire_requests(id) ON DELETE CASCADE,
  step_order int NOT NULL DEFAULT 0,
  step_name text NOT NULL DEFAULT '',
  actor_id uuid,
  actor_name text NOT NULL DEFAULT '',
  actor_role_key text NOT NULL DEFAULT '',
  action text NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rehire_events_request ON public.rehire_request_events(request_id, created_at);
GRANT SELECT, INSERT ON public.rehire_request_events TO authenticated;
GRANT ALL ON public.rehire_request_events TO service_role;
ALTER TABLE public.rehire_request_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rehire_events_select" ON public.rehire_request_events FOR SELECT TO authenticated
  USING (
    public.is_admin_user()
    OR public.current_user_is_rehire_participant()
    OR EXISTS (SELECT 1 FROM public.rehire_requests r WHERE r.id = request_id AND r.requested_by = auth.uid())
  );
CREATE POLICY "rehire_events_insert" ON public.rehire_request_events FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND public.is_current_employee_active());