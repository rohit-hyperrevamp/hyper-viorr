REVOKE EXECUTE ON FUNCTION public.get_hierarchy_user_ids(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_hierarchy_user_ids(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_hierarchy_user_ids(uuid) TO authenticated, service_role;