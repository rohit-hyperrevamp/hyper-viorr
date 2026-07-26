UPDATE public.candidates
SET non_billable = true
WHERE non_billable IS DISTINCT FROM true
  AND lower(coalesce(role_key, '')) IN (
    'field_officer','branch_manager','hr','leadership','transport','inventory',
    'admin','super_admin','user','accounts','operations','operations_manager',
    'area_manager','regional_manager'
  );