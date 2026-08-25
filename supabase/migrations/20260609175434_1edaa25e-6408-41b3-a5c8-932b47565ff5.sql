INSERT INTO public.role_permissions (role_key, module_key, sub_module_key, can_view, can_edit, can_delete, can_approve)
VALUES
  ('hr','invoice','',true,true,false,false),
  ('leadership','invoice','',true,true,false,true)
ON CONFLICT (role_key, module_key, sub_module_key) DO UPDATE SET
  can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete, can_approve = EXCLUDED.can_approve;