INSERT INTO public.role_permissions (role_key, module_key, sub_module_key, can_view, can_edit, can_approve, can_delete)
VALUES
  ('field_officer','inventory','',true,true,false,false),
  ('field_officer','inventory','demands',true,true,false,false),
  ('field_officer','inventory','issuances',true,true,false,false),
  ('field_officer','inventory','collections',true,true,false,false),
  ('field_officer','inventory','my_inventory',true,false,false,false)
ON CONFLICT DO NOTHING;