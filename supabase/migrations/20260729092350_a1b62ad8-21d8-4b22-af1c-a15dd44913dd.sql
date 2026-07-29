CREATE OR REPLACE FUNCTION public.notify_rehire_current_approver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step RECORD;
  v_user RECORD;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.current_step_order = OLD.current_step_order AND OLD.status = 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT s.name, s.approver_role_key
    INTO v_step
  FROM public.workflow_steps s
  JOIN public.workflow_definitions d ON d.id = s.workflow_id
  WHERE d.key = NEW.workflow_key
    AND s.is_active
    AND s.step_order = NEW.current_step_order
  LIMIT 1;

  IF v_step.approver_role_key IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_user IN SELECT user_id FROM public.get_user_ids_by_role(v_step.approver_role_key) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = v_user.user_id
        AND n.entity_type = 'rehire_request'
        AND n.entity_id = NEW.id::text
        AND n.type = 'rehire_request_pending'
        AND n.read_at IS NULL
    ) THEN
      INSERT INTO public.notifications (user_id, actor_id, type, title, message, link, entity_type, entity_id)
      VALUES (
        v_user.user_id,
        NEW.requested_by,
        'rehire_request_pending',
        'Rehire pending: ' || COALESCE(v_step.name, 'approval'),
        COALESCE(NULLIF(NEW.full_name, ''), 'A rehire request') || ' is awaiting your approval.',
        '/admin/workflows/rehire?request=' || NEW.id::text,
        'rehire_request',
        NEW.id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;