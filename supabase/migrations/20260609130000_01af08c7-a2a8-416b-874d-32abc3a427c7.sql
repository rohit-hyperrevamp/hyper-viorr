
DO $$
DECLARE
  v_unit_id uuid := '38946b1a-e570-4536-a60f-a965e3c25c25';
  v_contract_id uuid;
  v_service_type_id uuid;
  v_payroll_day_base_id uuid;
  v_desig_id uuid;
  v_cand_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_mobile text := '9100000005';
  v_email text := 'phone-9100000005@radiantguard.local';
BEGIN
  SELECT id INTO v_desig_id FROM public.designations WHERE name = 'Senior Guard';
  IF v_desig_id IS NULL THEN
    INSERT INTO public.designations (name, code, enabled, billable)
    VALUES ('Senior Guard', 'SRG', true, true)
    RETURNING id INTO v_desig_id;
  END IF;

  SELECT cr.contract_id, cr.service_type_id, cr.payroll_day_base_id
    INTO v_contract_id, v_service_type_id, v_payroll_day_base_id
  FROM public.contract_resources cr
  JOIN public.client_contracts cc ON cc.id = cr.contract_id
  WHERE cc.unit_id = v_unit_id
  LIMIT 1;

  INSERT INTO public.contract_resources (
    contract_id, designation_id, service_type_id, quantity,
    components, gross, sort_order, payroll_day_base_id,
    benefits, deductions, employer_contributions, role_key
  ) VALUES (
    v_contract_id, v_desig_id, v_service_type_id, 1,
    '[
      {"name": "Basic", "amount": 14766, "allowanceId": "44e4177f-b612-44ac-9b4b-227da493a4c9"},
      {"name": "DA", "amount": 4014, "allowanceId": "4ac31d78-dafd-44d2-9123-2168ce28917a"},
      {"name": "HRA", "amount": 2832, "allowanceId": "c22f90cd-5a7f-45de-9b1e-755d9a162d6f"},
      {"name": "Addl. Allow.", "amount": 2100, "allowanceId": "d2727847-2a69-43ce-aba0-8216ffb95d41"},
      {"name": "WA", "amount": 1000, "allowanceId": "9a96de53-a582-4f5a-a8de-bb349335cb47"},
      {"name": "Skill Allowance", "amount": 2500, "allowanceId": "5c82ab94-a77c-4ea6-8237-4e051496cebb"}
    ]'::jsonb,
    27212, 1, v_payroll_day_base_id,
    '[
      {"name": "NFH (National & Festival Holidays)", "state": "N/A", "amount": 200, "calcType": "fixed", "capAmount": null, "percentage": 0, "baseComponents": [], "costComponentId": "17ff3d75-20d0-40b7-8b74-1d2f16766a4b"},
      {"name": "LWW (Leave with Wages)", "state": "N/A", "amount": 1200, "calcType": "fixed", "capAmount": null, "percentage": 0, "baseComponents": [], "costComponentId": "45236ac8-1a73-4506-bfc1-7df8968aa12e"}
    ]'::jsonb,
    '[]'::jsonb, '[]'::jsonb, 'guard'
  );

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, crypt(v_mobile, gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_user_id, v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    'email', now(), now(), now()
  );

  INSERT INTO public.candidates (
    id, full_name, mobile, gender, role_key, designation_id, status, unit_id,
    kyc_completed, is_enabled, application_date
  ) VALUES (
    v_cand_id, 'Rohit Singh', v_mobile, 'Male', 'guard', v_desig_id, 'active', v_unit_id,
    true, true, CURRENT_DATE
  );

  INSERT INTO public.candidate_units (candidate_id, unit_id, is_primary)
  VALUES (v_cand_id, v_unit_id, true);
END $$;
