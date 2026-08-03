WITH ranked_present AS (
  SELECT
    ae.id,
    pdb.fixed_days,
    SUM(COALESCE(ac.day_value, 1)) OVER (
      PARTITION BY ae.unit_id, ae.candidate_id, ae.designation_id, date_trunc('month', ae.entry_date)
      ORDER BY ae.entry_date, ae.created_at, ae.id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_present_days
  FROM public.attendance_entries ae
  JOIN public.attendance_codes ac
    ON ac.code = ae.code
   AND ac.counts_as_present = true
  JOIN public.client_contracts cc
    ON cc.unit_id = ae.unit_id
   AND cc.record_type = 'client'
   AND cc.status = 'active'
   AND cc.start_date <= ae.entry_date
   AND (cc.end_date IS NULL OR cc.end_date >= ae.entry_date)
  JOIN public.contract_resources cr
    ON cr.contract_id = cc.id
   AND cr.designation_id = ae.designation_id
  JOIN public.payroll_day_bases pdb
    ON pdb.id = cr.payroll_day_base_id
   AND pdb.method = 'fixed_days'
   AND pdb.fixed_days > 0
), excess AS (
  SELECT id
  FROM ranked_present
  WHERE running_present_days > fixed_days
)
UPDATE public.attendance_entries ae
SET code = 'A', updated_at = now()
FROM excess
WHERE ae.id = excess.id;