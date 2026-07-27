-- 1) SBI Bank organization
INSERT INTO public.customers (id, code, name, short_name, industry_type, status, billing_city, billing_state, billing_country)
VALUES (
  'aa11bb22-cc33-4dd4-8ee5-ff6600000001',
  'CUST-SBIBANK',
  'SBI Bank',
  'SBI',
  'Banking',
  'active',
  'Pune',
  'Maharashtra',
  'India'
);

-- 2) 10 SBI Bank units in Pune (branch = PUNE / 8897587c)
INSERT INTO public.units (code, name, customer_id, branch_id, billing_city, billing_state, billing_country, latitude, longitude, status)
VALUES
  ('SBI-PUNE-01', 'SBI Pune Main Branch (Camp)',   'aa11bb22-cc33-4dd4-8ee5-ff6600000001', '8897587c-e532-47ad-af01-353409cc6b23', 'Pune', 'Maharashtra', 'India', 18.5158000, 73.8815000, 'active'),
  ('SBI-PUNE-02', 'SBI FC Road',                   'aa11bb22-cc33-4dd4-8ee5-ff6600000001', '8897587c-e532-47ad-af01-353409cc6b23', 'Pune', 'Maharashtra', 'India', 18.5231000, 73.8419000, 'active'),
  ('SBI-PUNE-03', 'SBI Koregaon Park',             'aa11bb22-cc33-4dd4-8ee5-ff6600000001', '8897587c-e532-47ad-af01-353409cc6b23', 'Pune', 'Maharashtra', 'India', 18.5362000, 73.8935000, 'active'),
  ('SBI-PUNE-04', 'SBI Hadapsar',                  'aa11bb22-cc33-4dd4-8ee5-ff6600000001', '8897587c-e532-47ad-af01-353409cc6b23', 'Pune', 'Maharashtra', 'India', 18.5089000, 73.9260000, 'active'),
  ('SBI-PUNE-05', 'SBI Kothrud',                   'aa11bb22-cc33-4dd4-8ee5-ff6600000001', '8897587c-e532-47ad-af01-353409cc6b23', 'Pune', 'Maharashtra', 'India', 18.5074000, 73.8077000, 'active'),
  ('SBI-PUNE-06', 'SBI Aundh',                     'aa11bb22-cc33-4dd4-8ee5-ff6600000001', '8897587c-e532-47ad-af01-353409cc6b23', 'Pune', 'Maharashtra', 'India', 18.5593000, 73.8078000, 'active'),
  ('SBI-PUNE-07', 'SBI Baner',                     'aa11bb22-cc33-4dd4-8ee5-ff6600000001', '8897587c-e532-47ad-af01-353409cc6b23', 'Pune', 'Maharashtra', 'India', 18.5590000, 73.7868000, 'active'),
  ('SBI-PUNE-08', 'SBI Viman Nagar',               'aa11bb22-cc33-4dd4-8ee5-ff6600000001', '8897587c-e532-47ad-af01-353409cc6b23', 'Pune', 'Maharashtra', 'India', 18.5679000, 73.9143000, 'active'),
  ('SBI-PUNE-09', 'SBI Wakad',                     'aa11bb22-cc33-4dd4-8ee5-ff6600000001', '8897587c-e532-47ad-af01-353409cc6b23', 'Pune', 'Maharashtra', 'India', 18.5975000, 73.7625000, 'active'),
  ('SBI-PUNE-10', 'SBI Shivaji Nagar',             'aa11bb22-cc33-4dd4-8ee5-ff6600000001', '8897587c-e532-47ad-af01-353409cc6b23', 'Pune', 'Maharashtra', 'India', 18.5304000, 73.8477000, 'active');

-- 3) Lakshay Sinha field officer (mobile 9900000000)
INSERT INTO public.candidates (
  id, full_name, mobile, email, role_key, status, non_billable, is_enabled,
  application_date, approved_at,
  gender, date_of_birth,
  permanent_address1, permanent_city, permanent_state, permanent_country, permanent_pincode,
  present_address1,   present_city,   present_state,   present_country,   present_pincode,
  same_as_permanent
) VALUES (
  'bb22cc33-dd44-4ee5-8ff6-000000000002',
  'Lakshay Sinha',
  '9900000000',
  'lakshay.sinha@radiantguard.local',
  'field_officer',
  'active',
  TRUE,
  TRUE,
  CURRENT_DATE,
  now(),
  'Male',
  '1995-01-01',
  'Pune HQ', 'Pune', 'Maharashtra', 'India', '411001',
  'Pune HQ', 'Pune', 'Maharashtra', 'India', '411001',
  TRUE
);

-- 4) Branch scope + unit mappings for Lakshay Sinha (PUNE branch + 10 SBI units)
INSERT INTO public.employee_scope_assignments (candidate_id, scope_type, scope_id, scope_label)
VALUES ('bb22cc33-dd44-4ee5-8ff6-000000000002', 'branch', '8897587c-e532-47ad-af01-353409cc6b23', 'PUNE');

INSERT INTO public.candidate_units (candidate_id, unit_id, is_primary)
SELECT 'bb22cc33-dd44-4ee5-8ff6-000000000002', u.id,
       (u.code = 'SBI-PUNE-01')
FROM public.units u
WHERE u.code LIKE 'SBI-PUNE-%';
