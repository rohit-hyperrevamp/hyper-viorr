CREATE OR REPLACE FUNCTION public.get_onboarding_approver_user_ids()
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT u.id FROM auth.users u
  WHERE u.email IN (
    'phone-8373914073@radiantguard.local',
    'phone-8373149073@radiantguard.local',
    'phone-8373914072@radiantguard.local'
  )
  UNION
  SELECT DISTINCT u.id FROM auth.users u
  JOIN public.candidates c
    ON u.email = 'phone-' || c.mobile || '@radiantguard.local'
  WHERE c.status = 'active'
    AND (
      c.role_key IN ('admin','super_admin')
      OR c.role_key IN (
        SELECT role_key FROM public.role_permissions
        WHERE module_key = 'employees' AND can_approve = true
      )
    );
$function$;