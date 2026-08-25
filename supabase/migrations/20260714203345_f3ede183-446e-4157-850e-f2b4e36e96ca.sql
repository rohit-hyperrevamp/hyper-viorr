CREATE OR REPLACE FUNCTION public.is_active_field_officer(_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.candidates c
    WHERE c.id = _candidate_id
      AND c.role_key = 'field_officer'
      AND c.status IN ('approved','active')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_active_field_officer(uuid) TO authenticated;

DROP POLICY IF EXISTS "Organization managers insert unit scope assignments" ON public.employee_scope_assignments;
CREATE POLICY "Organization managers insert unit scope assignments"
ON public.employee_scope_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  scope_type = 'unit'
  AND public.current_user_can_edit_organizations()
  AND public.is_active_field_officer(candidate_id)
);