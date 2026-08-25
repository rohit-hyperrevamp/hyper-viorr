CREATE OR REPLACE FUNCTION public.current_user_mobile()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT substring(u.email from 'phone-(\d+)@radiantguard\.local')
  FROM auth.users u
  WHERE u.id = auth.uid()
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_mobile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_mobile() TO authenticated;

DROP POLICY IF EXISTS "Read own or admin candidates" ON public.candidates;

CREATE POLICY "Read own or admin candidates"
ON public.candidates
FOR SELECT
TO authenticated
USING (
  public.is_admin_user()
  OR mobile = public.current_user_mobile()
);