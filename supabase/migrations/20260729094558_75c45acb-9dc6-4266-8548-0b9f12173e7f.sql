UPDATE public.workflow_definitions SET route_path = '/admin/candidates/rehire' WHERE key = 'rehire';

INSERT INTO public.role_permissions (role_key, module_key, sub_module_key, can_view, can_edit, can_delete, can_approve)
SELECT DISTINCT rp.role_key, 'employees', 'rehire', true, true, false, true
FROM public.role_permissions rp
WHERE rp.module_key = 'control_center' AND rp.sub_module_key = 'workflows' AND rp.can_view
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions x
    WHERE x.role_key = rp.role_key AND x.module_key = 'employees' AND x.sub_module_key = 'rehire'
  );

INSERT INTO public.role_permissions (role_key, module_key, sub_module_key, can_view, can_edit, can_delete, can_approve)
SELECT r.key, 'employees', 'rehire', true, true, false, true
FROM public.roles r
WHERE r.key IN ('super_admin','admin','hr','leadership','operations_manager','vp_operations','field_officer')
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions x
    WHERE x.role_key = r.key AND x.module_key = 'employees' AND x.sub_module_key = 'rehire'
  );

DELETE FROM public.role_permissions WHERE module_key = 'control_center' AND sub_module_key = 'workflows';