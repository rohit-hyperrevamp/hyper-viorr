WITH active_template AS (
  SELECT id, version, body
  FROM public.company_document_templates
  WHERE doc_type = 'form_vii'
    AND is_active = true
    AND is_archived = false
  LIMIT 1
), candidate_doc_data AS (
  SELECT
    esd.id AS signed_doc_id,
    at.id AS template_id,
    at.version,
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
                                  at.body,
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
              '$nominee_table', '<table class="nomination-table"><thead><tr><th class="col-1">Name of<br/>nominee/nominees</th><th class="col-2">Address</th><th class="col-3">Nominee''s<br/>relationship<br/>with the<br/>employee</th><th class="col-4">Date<br/>of<br/>Birth</th><th class="col-5">Total amount of share<br/>of accumulations in<br/>credit to be paid to<br/>each nominee</th><th class="col-6">If the nominee is minor,<br/>name, relationship, and<br/>address of the guardian who<br/>may receive the amount<br/>during the minority of<br/>nominee</th></tr></thead><tfoot><tr><td>(1)</td><td>(2)</td><td>(3)</td><td>(4)</td><td>(5)</td><td>(6)</td></tr></tfoot></table>'
            ),
            '$company_name', 'Radiant Guard Services Pvt. Ltd.'
          ),
          '$aadhaar', coalesce(c.aadhaar_number, '_______')
        ),
        '$employee_mobile', coalesce(c.mobile, '_______')
      ),
      '$date_of_birth', coalesce(to_char(c.date_of_birth, 'DD Mon YYYY'), '_______')
    ) AS rendered_body
  FROM public.employee_signed_documents esd
  JOIN public.candidates c ON c.id = esd.candidate_id
  CROSS JOIN active_template at
  LEFT JOIN public.units u ON u.id = c.unit_id
  LEFT JOIN public.designations d ON d.id = c.designation_id
  WHERE esd.doc_type = 'form_vii'
    AND esd.signed_at IS NULL
)
UPDATE public.employee_signed_documents esd
SET template_id = cdd.template_id,
    version = cdd.version,
    rendered_body = cdd.rendered_body,
    updated_at = now()
FROM candidate_doc_data cdd
WHERE esd.id = cdd.signed_doc_id;