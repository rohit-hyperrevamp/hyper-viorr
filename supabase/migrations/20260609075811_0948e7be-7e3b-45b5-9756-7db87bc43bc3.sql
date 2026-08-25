
-- 1. Approve permission flag (configurable per role per module)
ALTER TABLE public.role_permissions
  ADD COLUMN IF NOT EXISTS can_approve boolean NOT NULL DEFAULT false;

-- 2. New HR role
INSERT INTO public.roles (key, name, description, is_system, sort_order)
VALUES ('hr','HR','Human Resources — creates prospect contracts and onboards clients after approval.', false, 35)
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 3. Default permissions
-- HR: broad access for the workflow (configurable later via RBAC screen)
INSERT INTO public.role_permissions (role_key, module_key, sub_module_key, can_view, can_edit, can_delete, can_approve)
VALUES
  ('hr','organizations','',true,true,false,false),
  ('hr','contracts','',true,true,true,false),
  ('hr','employees','',true,true,false,false),
  ('hr','attendance','',true,true,false,false),
  ('hr','payroll','',true,true,false,false),
  ('hr','notification_center','',true,false,false,false)
ON CONFLICT (role_key, module_key, sub_module_key) DO UPDATE SET
  can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete, can_approve = EXCLUDED.can_approve;

-- Leadership: view contracts + approve them; visibility on organizations and notifications
INSERT INTO public.role_permissions (role_key, module_key, sub_module_key, can_view, can_edit, can_delete, can_approve)
VALUES
  ('leadership','contracts','',true,true,false,true),
  ('leadership','organizations','',true,false,false,false),
  ('leadership','notification_center','',true,false,false,false)
ON CONFLICT (role_key, module_key, sub_module_key) DO UPDATE SET
  can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete, can_approve = EXCLUDED.can_approve;

-- 4. Helper: list auth user IDs whose role has a given (module, action='approve') permission
CREATE OR REPLACE FUNCTION public.get_user_ids_with_approve(_module text)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM auth.users u
  JOIN public.candidates c
    ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
  WHERE c.status = 'active'
    AND c.role_key IN (
      SELECT role_key FROM public.role_permissions
      WHERE module_key = _module AND can_approve = true
    )
$$;

GRANT EXECUTE ON FUNCTION public.get_user_ids_with_approve(text) TO authenticated;
