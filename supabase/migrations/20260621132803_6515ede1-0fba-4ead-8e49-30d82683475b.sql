
CREATE OR REPLACE FUNCTION public.apply_fpl_master_fill(_id uuid, p jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  refs jsonb := COALESCE(p->'refs','[]'::jsonb);
  langs jsonb := p->'langs';
BEGIN
  UPDATE candidates SET
    mobile = COALESCE(NULLIF(mobile,''), p->>'mobile', mobile),
    alt_mobile = COALESCE(NULLIF(alt_mobile,''), p->>'alt_mobile', alt_mobile),
    email = COALESCE(NULLIF(email,''), p->>'email', email),
    gender = COALESCE(NULLIF(gender,''), p->>'gender', gender),
    date_of_birth = COALESCE(date_of_birth, (p->>'dob')::date),
    marital_status = COALESCE(NULLIF(marital_status,''), p->>'marital_status', marital_status),
    religion = COALESCE(NULLIF(religion,''), p->>'religion', religion),
    caste_category = COALESCE(NULLIF(caste_category,''), p->>'caste_category', caste_category),
    birthplace = COALESCE(NULLIF(birthplace,''), p->>'birthplace', birthplace),
    aadhaar_number = COALESCE(NULLIF(aadhaar_number,''), p->>'aadhaar', aadhaar_number),
    pan_number = COALESCE(NULLIF(pan_number,''), p->>'pan', pan_number),
    bank_name = COALESCE(NULLIF(bank_name,''), p->>'bank_name', bank_name),
    bank_branch = COALESCE(NULLIF(bank_branch,''), p->>'bank_branch', bank_branch),
    bank_account_number = COALESCE(NULLIF(bank_account_number,''), p->>'bank_acc', bank_account_number),
    bank_ifsc = COALESCE(NULLIF(bank_ifsc,''), p->>'bank_ifsc', bank_ifsc),
    bank_account_holder = COALESCE(NULLIF(bank_account_holder,''), p->>'bank_holder', bank_account_holder),
    emergency_contact_name = COALESCE(NULLIF(emergency_contact_name,''), p->>'em_name', emergency_contact_name),
    emergency_contact_mobile = COALESCE(NULLIF(emergency_contact_mobile,''), p->>'em_mob', emergency_contact_mobile),
    emergency_contact_relation = COALESCE(NULLIF(emergency_contact_relation,''), p->>'em_rel', emergency_contact_relation),
    present_address1 = COALESCE(NULLIF(present_address1,''), p->>'pres_a1', present_address1),
    present_address2 = COALESCE(NULLIF(present_address2,''), p->>'pres_a2', present_address2),
    present_city = COALESCE(NULLIF(present_city,''), p->>'pres_city', present_city),
    present_district = COALESCE(NULLIF(present_district,''), p->>'pres_dist', present_district),
    present_state = COALESCE(NULLIF(present_state,''), p->>'pres_state', present_state),
    present_country = COALESCE(NULLIF(present_country,''), p->>'pres_country', present_country),
    present_police_station = COALESCE(NULLIF(present_police_station,''), p->>'pres_ps', present_police_station),
    present_pincode = COALESCE(NULLIF(present_pincode,''), p->>'pres_pin', present_pincode),
    permanent_address1 = COALESCE(NULLIF(permanent_address1,''), p->>'perm_a1', permanent_address1),
    permanent_address2 = COALESCE(NULLIF(permanent_address2,''), p->>'perm_a2', permanent_address2),
    permanent_city = COALESCE(NULLIF(permanent_city,''), p->>'perm_city', permanent_city),
    permanent_district = COALESCE(NULLIF(permanent_district,''), p->>'perm_dist', permanent_district),
    permanent_state = COALESCE(NULLIF(permanent_state,''), p->>'perm_state', permanent_state),
    permanent_country = COALESCE(NULLIF(permanent_country,''), p->>'perm_country', permanent_country),
    permanent_police_station = COALESCE(NULLIF(permanent_police_station,''), p->>'perm_ps', permanent_police_station),
    permanent_pincode = COALESCE(NULLIF(permanent_pincode,''), p->>'perm_pin', permanent_pincode),
    is_ex_service = CASE WHEN (p->>'ex_service')::boolean IS TRUE THEN COALESCE(is_ex_service, TRUE) ELSE is_ex_service END,
    languages = CASE WHEN langs IS NOT NULL AND (languages IS NULL OR languages::text IN ('[]','{}','null')) THEN langs ELSE languages END,
    physical_health = COALESCE(physical_health,'{}'::jsonb) || (COALESCE(p->'ph','{}'::jsonb) - ARRAY(SELECT jsonb_object_keys(COALESCE(physical_health,'{}'::jsonb)))),
    compliance = COALESCE(compliance,'{}'::jsonb) || (COALESCE(p->'comp','{}'::jsonb) - ARRAY(SELECT jsonb_object_keys(COALESCE(compliance,'{}'::jsonb)))),
    other_info = COALESCE(other_info,'{}'::jsonb) || (COALESCE(p->'oi','{}'::jsonb) - ARRAY(SELECT jsonb_object_keys(COALESCE(other_info,'{}'::jsonb)))),
    "references" = CASE WHEN jsonb_array_length(refs) > 0 THEN
       (SELECT COALESCE("references",'[]'::jsonb) || COALESCE(jsonb_agg(item), '[]'::jsonb)
          FROM jsonb_array_elements(refs) AS item
         WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE("references",'[]'::jsonb)) e
                            WHERE lower(e->>'name') = lower(item->>'name')
                              AND lower(e->>'relation') = lower(item->>'relation')))
       ELSE "references" END
  WHERE id = _id;
END;
$$;
