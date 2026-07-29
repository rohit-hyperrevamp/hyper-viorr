
CREATE OR REPLACE FUNCTION public.current_user_is_people_ops()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_admin_user()
      OR COALESCE(public.current_user_role_key(), '') IN ('hr','leadership','operations_manager','vp_operations');
$$;

DROP POLICY IF EXISTS "People ops manage candidate_units" ON public.candidate_units;
CREATE POLICY "People ops manage candidate_units"
  ON public.candidate_units FOR ALL TO authenticated
  USING (public.current_user_is_people_ops())
  WITH CHECK (public.current_user_is_people_ops());

DROP POLICY IF EXISTS "People ops manage candidate_designations" ON public.candidate_designations;
CREATE POLICY "People ops manage candidate_designations"
  ON public.candidate_designations FOR ALL TO authenticated
  USING (public.current_user_is_people_ops())
  WITH CHECK (public.current_user_is_people_ops());

DROP POLICY IF EXISTS "People ops manage candidate_reporting_managers" ON public.candidate_reporting_managers;
CREATE POLICY "People ops manage candidate_reporting_managers"
  ON public.candidate_reporting_managers FOR ALL TO authenticated
  USING (public.current_user_is_people_ops())
  WITH CHECK (public.current_user_is_people_ops());
