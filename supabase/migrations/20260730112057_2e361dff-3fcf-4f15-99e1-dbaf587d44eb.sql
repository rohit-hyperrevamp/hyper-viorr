WITH active_template AS (
  SELECT id, version, body
  FROM public.company_document_templates
  WHERE doc_type = 'form_vii'
    AND is_active = true
    AND is_archived = false
  LIMIT 1
), unsigned_docs AS (
  SELECT esd.id AS signed_doc_id, esd.candidate_id, at.id AS template_id, at.version, at.body
  FROM public.employee_signed_documents esd
  CROSS JOIN active_template at
  WHERE esd.doc_type = 'form_vii'
    AND esd.signed_at IS NULL
), nominee_tables AS (
  SELECT
    ud.signed_doc_id,
    '<table class="nomination-table"><thead><tr>' ||
    '<th class="col-1">Name of<br/>nominee/nominees' || coalesce(string_agg('<span class="nominee-entry">' || coalesce(nullif(ct.contact_json->>'name', ''), split_part(nom.nominee_json->>'contact', '|', 1), '&nbsp;') || '</span>', '' ORDER BY nom.ordinal), '') || '</th>' ||
    '<th class="col-2">Address' || coalesce(string_agg('<span class="nominee-entry">' || coalesce(nullif(ct.contact_json->>'address', ''), '&nbsp;') || '</span>', '' ORDER BY nom.ordinal), '') || '</th>' ||
    '<th class="col-3">Nominee''s<br/>relationship<br/>with the<br/>employee' || coalesce(string_agg('<span class="nominee-entry">' || coalesce(nullif(ct.contact_json->>'relation', ''), '&nbsp;') || '</span>', '' ORDER BY nom.ordinal), '') || '</th>' ||
    '<th class="col-4">Date<br/>of<br/>Birth' || coalesce(string_agg('<span class="nominee-entry">' || coalesce(to_char(nullif(ct.contact_json->>'dob', '')::date, 'DD Mon YYYY'), '&nbsp;') || '</span>', '' ORDER BY nom.ordinal), '') || '</th>' ||
    '<th class="col-5">Total amount of share<br/>of accumulations in<br/>credit to be paid to<br/>each nominee' || coalesce(string_agg('<span class="nominee-entry">' || coalesce(nullif(nom.nominee_json->>'percent', ''), '0') || '%</span>', '' ORDER BY nom.ordinal), '') || '</th>' ||
    '<th class="col-6">If the nominee is minor,<br/>name, relationship, and<br/>address of the guardian who<br/>may receive the amount<br/>during the minority of<br/>nominee' || coalesce(string_agg('<span class="nominee-entry">' || coalesce(nullif(concat_ws(', ', nullif(ct.contact_json->>'guardian_name', ''), nullif(ct.contact_json->>'guardian_address', ''), nullif(ct.contact_json->>'guardian_mobile', '')), ''), '&nbsp;') || '</span>', '' ORDER BY nom.ordinal), '') || '</th>' ||
    '</tr></thead><tfoot><tr><td>(1)</td><td>(2)</td><td>(3)</td><td>(4)</td><td>(5)</td><td>(6)</td></tr></tfoot></table>' AS nominee_table
  FROM unsigned_docs ud
  JOIN public.candidates c ON c.id = ud.candidate_id
  LEFT JOIN LATERAL jsonb_array_elements(coalesce(c.compliance::jsonb->'nominees', '[]'::jsonb)) WITH ORDINALITY AS nom(nominee_json, ordinal) ON true
  LEFT JOIN LATERAL (
    SELECT contact_json
    FROM jsonb_array_elements(coalesce(c.contacts::jsonb, '[]'::jsonb)) AS contact(contact_json)
    WHERE concat(coalesce(contact_json->>'name', ''), '|', coalesce(contact_json->>'mobile', contact_json->>'phone', '')) = coalesce(nom.nominee_json->>'contact', '')
       OR coalesce(contact_json->>'name', '') = split_part(coalesce(nom.nominee_json->>'contact', ''), '|', 1)
    LIMIT 1
  ) ct ON true
  GROUP BY ud.signed_doc_id
), candidate_doc_data AS (
  SELECT
    ud.signed_doc_id,
    ud.template_id,
    ud.version,
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(
                          replace(
                            replace(
                              replace(
                                replace(
                                  ud.body,
                                  '$employee_name', coalesce(c.full_name, '_______')
                                ),
                                '$sex', coalesce(c.gender, '_______')
                              ),
                              '$marital_status', coalesce(c.marital_status, '_______')
                            ),
                            '$unit_name', coalesce(u.name, '_______')
                          ),
                          '$designation', coalesce(d.name, '_______')
                        ),
                        '$employee_code', coalesce(c.employee_code, c.candidate_code, '_______')
                      ),
                      '$joining_date', coalesce(to_char(c.preferred_joining_date, 'DD Mon YYYY'), '_______')
                    ),
                    '$permanent_address', coalesce(nullif(concat_ws(', ', c.permanent_address1, c.permanent_address2, c.permanent_city, c.permanent_state, c.permanent_pincode), ''), nullif(concat_ws(', ', c.present_address1, c.present_address2, c.present_city, c.present_state, c.present_pincode), ''), '_______')
                  ),
                  '$unit_city', coalesce(u.billing_city, u.shipping_city, c.present_city, '_______')
                ),
                '$date', to_char(now(), 'DD Mon YYYY')
              ),
              '$nominee_table', coalesce(nt.nominee_table, '<table class="nomination-table"><thead><tr><th class="col-1">Name of<br/>nominee/nominees</th><th class="col-2">Address</th><th class="col-3">Nominee''s<br/>relationship<br/>with the<br/>employee</th><th class="col-4">Date<br/>of<br/>Birth</th><th class="col-5">Total amount of share<br/>of accumulations in<br/>credit to be paid to<br/>each nominee</th><th class="col-6">If the nominee is minor,<br/>name, relationship, and<br/>address of the guardian who<br/>may receive the amount<br/>during the minority of<br/>nominee</th></tr></thead><tfoot><tr><td>(1)</td><td>(2)</td><td>(3)</td><td>(4)</td><td>(5)</td><td>(6)</td></tr></tfoot></table>')
            ),
            '$company_name', 'Radiant Guard Services Pvt. Ltd.'
          ),
          '$aadhaar', coalesce(c.aadhaar_number, '_______')
        ),
        '$employee_mobile', coalesce(c.mobile, '_______')
      ),
      '$date_of_birth', coalesce(to_char(c.date_of_birth, 'DD Mon YYYY'), '_______')
    ) AS rendered_body
  FROM unsigned_docs ud
  JOIN public.candidates c ON c.id = ud.candidate_id
  LEFT JOIN public.units u ON u.id = c.unit_id
  LEFT JOIN public.designations d ON d.id = c.designation_id
  LEFT JOIN nominee_tables nt ON nt.signed_doc_id = ud.signed_doc_id
)
UPDATE public.employee_signed_documents esd
SET template_id = cdd.template_id,
    version = cdd.version,
    rendered_body = cdd.rendered_body,
    updated_at = now()
FROM candidate_doc_data cdd
WHERE esd.id = cdd.signed_doc_id;