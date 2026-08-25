DROP POLICY IF EXISTS "Admins read candidates" ON public.candidates;

CREATE POLICY "Read own or admin candidates"
ON public.candidates
FOR SELECT
TO authenticated
USING (
  public.is_admin_user()
  OR EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND u.email = 'phone-' || public.candidates.mobile || '@radiantguard.local'
  )
);