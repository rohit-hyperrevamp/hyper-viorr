WITH active_template AS (
  SELECT id, version, body
  FROM public.company_document_templates
  WHERE doc_type = 'form_vii' AND is_active = true AND is_archived = false
  LIMIT 1
), unsigned_docs AS (
  SELECT esd.id AS signed_doc_id, esd.candidate_id, at.id AS template_id, at.version, at.body
  FROM public.employee_signed_documents esd
  CROSS JOIN active_template at
  WHERE esd.doc_type = 'form_vii' AND esd.signed_at IS NULL
), nominee_rows AS (
  SELECT
    ud.signed_doc_id,
    string_agg(
      '<tr><td class="d-sr">' || nom.ordinal || '</td>' ||
      '<td class="d-1">' || coalesce(nullif(ct.contact_json->>'name', ''), split_part(nom.nominee_json->>'contact', '|', 1), '&nbsp;') || '</td>' ||
      '<td class="d-2">' || coalesce(nullif(ct.contact_json->>'address', ''), '&nbsp;') || '</td>' ||
      '<td class="d-3">' || coalesce(nullif(ct.contact_json->>'relation', ''), '&nbsp;') || '</td>' ||
      '<td class="d-4">' || coalesce(to_char(nullif(ct.contact_json->>'dob', '')::date, 'DD Mon YYYY'), '&nbsp;') || '</td>' ||
      '<td class="d-5">' || coalesce(nullif(nom.nominee_json->>'percent', ''), '0') || '%</td>' ||
      '<td class="d-6">' || coalesce(nullif(concat_ws(', ', nullif(ct.contact_json->>'guardian_name', ''), nullif(ct.contact_json->>'guardian_address', ''), nullif(ct.contact_json->>'guardian_mobile', '')), ''), '&nbsp;') || '</td></tr>',
      '' ORDER BY nom.ordinal) AS rows_html
  FROM unsigned_docs ud
  JOIN public.candidates c ON c.id = ud.candidate_id
  JOIN LATERAL jsonb_array_elements(coalesce(c.compliance::jsonb->'nominees', '[]'::jsonb)) WITH ORDINALITY AS nom(nominee_json, ordinal) ON true
  LEFT JOIN LATERAL (
    SELECT contact_json
    FROM jsonb_array_elements(coalesce(c.contacts::jsonb, '[]'::jsonb)) AS contact(contact_json)
    WHERE concat(coalesce(contact_json->>'name', ''), '|', coalesce(contact_json->>'mobile', contact_json->>'phone', '')) = coalesce(nom.nominee_json->>'contact', '')
       OR coalesce(contact_json->>'name', '') = split_part(coalesce(nom.nominee_json->>'contact', ''), '|', 1)
    LIMIT 1
  ) ct ON true
  GROUP BY ud.signed_doc_id
), base_data AS (
  SELECT
    ud.signed_doc_id,
    ud.template_id,
    ud.version,
    ud.body,
    coalesce(c.full_name, '_______') AS employee_name,
    coalesce(c.gender, '_______') AS sex,
    coalesce(c.marital_status, '_______') AS marital_status,
    coalesce(u.name, '_______') AS unit_name,
    coalesce(d.name, '_______') AS designation,
    coalesce(c.employee_code, c.candidate_code, '_______') AS employee_code,
    coalesce(to_char(c.preferred_joining_date, 'DD Mon YYYY'), '_______') AS joining_date,
    coalesce(nullif(concat_ws(', ', c.permanent_address1, c.permanent_address2, c.permanent_city, c.permanent_state, c.permanent_pincode), ''), nullif(concat_ws(', ', c.present_address1, c.present_address2, c.present_city, c.present_state, c.present_pincode), ''), '_______') AS permanent_address,
    coalesce(u.billing_city, u.shipping_city, c.present_city, '_______') AS unit_city,
    to_char(now(), 'DD Mon YYYY') AS doc_date,
    '<table class="nomination-table"><thead><tr>' ||
    '<th class="col-1">Name of<br/>nominee/nominees</th>' ||
    '<th class="col-2">Address</th>' ||
    '<th class="col-3">Nominee''s<br/>relationship<br/>with the<br/>employee</th>' ||
    '<th class="col-4">Date<br/>of<br/>Birth</th>' ||
    '<th class="col-5">Total amount of share<br/>of accumulations in<br/>credit to be paid to<br/>each nominee</th>' ||
    '<th class="col-6">If the nominee is minor,<br/>name, relationship, and<br/>address of the guardian who<br/>may receive the amount<br/>during the minority of<br/>nominee</th>' ||
    '</tr></thead><tfoot><tr><td>(1)</td><td>(2)</td><td>(3)</td><td>(4)</td><td>(5)</td><td>(6)</td></tr></tfoot></table>' ||
    '<div class="nominee-detail-title">Particulars of nominee(s) as recorded</div>' ||
    '<table class="nominee-detail-table"><thead><tr>' ||
    '<th class="d-sr">Sr.</th><th class="d-1">Name of nominee</th><th class="d-2">Address</th><th class="d-3">Relationship</th><th class="d-4">Date of Birth</th><th class="d-5">Share</th><th class="d-6">Guardian (if nominee is minor)</th>' ||
    '</tr></thead><tbody>' ||
    coalesce(nr.rows_html,
      '<tr><td class="d-sr">1</td><td class="d-1">&nbsp;</td><td class="d-2">&nbsp;</td><td class="d-3">&nbsp;</td><td class="d-4">&nbsp;</td><td class="d-5">&nbsp;</td><td class="d-6">&nbsp;</td></tr>' ||
      '<tr><td class="d-sr">2</td><td class="d-1">&nbsp;</td><td class="d-2">&nbsp;</td><td class="d-3">&nbsp;</td><td class="d-4">&nbsp;</td><td class="d-5">&nbsp;</td><td class="d-6">&nbsp;</td></tr>') ||
    '</tbody></table>' AS nominee_table
  FROM unsigned_docs ud
  JOIN public.candidates c ON c.id = ud.candidate_id
  LEFT JOIN public.units u ON u.id = c.unit_id
  LEFT JOIN public.designations d ON d.id = c.designation_id
  LEFT JOIN nominee_rows nr ON nr.signed_doc_id = ud.signed_doc_id
), rendered AS (
  SELECT
    signed_doc_id,
    template_id,
    version,
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
      body,
      '$employee_name', employee_name),
      '$sex', sex),
      '$marital_status', marital_status),
      '$unit_name', unit_name),
      '$designation', designation),
      '$employee_code', employee_code),
      '$joining_date', joining_date),
      '$permanent_address', permanent_address),
      '$unit_city', unit_city),
      '$date', doc_date) AS partial,
    nominee_table
  FROM base_data
)
UPDATE public.employee_signed_documents esd
SET rendered_body = replace(r.partial, '$nominee_table', r.nominee_table),
    template_id = r.template_id,
    version = r.version
FROM rendered r
WHERE esd.id = r.signed_doc_id;