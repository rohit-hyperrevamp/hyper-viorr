CREATE POLICY "Employees read their reporting managers"
ON public.candidates
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT crm.manager_id
    FROM public.candidate_reporting_managers crm
    WHERE crm.candidate_id = public.current_user_candidate_id()
  )
);