ALTER TABLE public.units ADD COLUMN IF NOT EXISTS esic_branch_id uuid REFERENCES public.esic_branches(id) ON DELETE SET NULL;

UPDATE public.units u SET esic_branch_id = b.id
FROM public.esic_branches b
WHERE u.esic_branch_id IS NULL AND b.location = CASE
  WHEN lower(coalesce(u.billing_city,'') || ' ' || coalesce(u.location,'') || ' ' || coalesce(u.name,'')) LIKE '%baramati%' THEN 'Baramati'
  WHEN lower(coalesce(u.billing_city,'')) = 'pune' THEN 'PUNE Pune City'
  WHEN lower(coalesce(u.billing_city,'')) = 'mumbai' THEN 'MUMBAI'
  WHEN lower(coalesce(u.billing_city,'')) = 'ahmedabad' THEN 'AHMEDABAD'
  WHEN lower(coalesce(u.billing_city,'')) = 'bangalore' THEN 'BANGALORE (Karnataka)'
  WHEN lower(coalesce(u.billing_city,'')) = 'hyderabad' THEN 'Hyderabad'
  WHEN lower(coalesce(u.billing_city,'')) = 'nashik' THEN 'NASHIK 1'
  WHEN lower(coalesce(u.billing_city,'')) = 'nagpur' THEN 'NAGPUR'
  WHEN lower(coalesce(u.billing_city,'')) = 'kolhapur' THEN 'KOLHAPUR'
  WHEN lower(coalesce(u.billing_city,'')) = 'satara' THEN 'SATARA'
  WHEN lower(coalesce(u.billing_city,'')) = 'sangli' THEN 'SANGLI'
  WHEN lower(coalesce(u.billing_city,'')) = 'solapur' THEN 'SOLAPUR'
  WHEN lower(coalesce(u.billing_city,'')) = 'jalgaon' THEN 'JALGAON'
  WHEN lower(coalesce(u.billing_city,'')) = 'surat' THEN 'SURAT'
  WHEN lower(coalesce(u.billing_city,'')) = 'rajkot' THEN 'RAJKOT'
  WHEN lower(coalesce(u.billing_city,'')) = 'bhopal' THEN 'BHOPAL'
  WHEN lower(coalesce(u.billing_city,'')) = 'udaipur' THEN 'UDAIPUR'
  WHEN lower(coalesce(u.billing_city,'')) = 'alwar' THEN 'Alwar'
  WHEN lower(coalesce(u.billing_city,'')) = 'guwahati' THEN 'GUWAHATI'
  WHEN lower(coalesce(u.billing_city,'')) = 'gurgaon' THEN 'GURGAON'
  WHEN lower(coalesce(u.billing_state,'')) = 'goa' THEN 'GOA'
  ELSE NULL END;

ALTER TABLE public.client_contracts DROP COLUMN IF EXISTS esic_branch_id;