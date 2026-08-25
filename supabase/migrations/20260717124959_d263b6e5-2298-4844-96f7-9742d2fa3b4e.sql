
-- Allow field officers (and any branch-scoped user) to write attendance
-- entries for units within their scope. Admins retain full access.
DROP POLICY IF EXISTS "Admins insert attendance_entries" ON public.attendance_entries;
DROP POLICY IF EXISTS "Admins update attendance_entries" ON public.attendance_entries;
DROP POLICY IF EXISTS "Admins delete attendance_entries" ON public.attendance_entries;

CREATE POLICY "Scoped insert attendance_entries"
  ON public.attendance_entries FOR INSERT TO authenticated
  WITH CHECK (
    is_admin_user()
    OR (NOT current_user_has_branch_scope())
    OR is_unit_in_current_user_branch(unit_id)
  );

CREATE POLICY "Scoped update attendance_entries"
  ON public.attendance_entries FOR UPDATE TO authenticated
  USING (
    is_admin_user()
    OR (NOT current_user_has_branch_scope())
    OR is_unit_in_current_user_branch(unit_id)
  )
  WITH CHECK (
    is_admin_user()
    OR (NOT current_user_has_branch_scope())
    OR is_unit_in_current_user_branch(unit_id)
  );

CREATE POLICY "Scoped delete attendance_entries"
  ON public.attendance_entries FOR DELETE TO authenticated
  USING (
    is_admin_user()
    OR (NOT current_user_has_branch_scope())
    OR is_unit_in_current_user_branch(unit_id)
  );
