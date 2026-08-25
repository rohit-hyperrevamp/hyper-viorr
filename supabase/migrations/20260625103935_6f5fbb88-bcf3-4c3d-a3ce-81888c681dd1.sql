CREATE OR REPLACE FUNCTION public.current_user_is_inventory_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role_key() IN ('inventory_manager', 'inventory');
$$;