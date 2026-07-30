UPDATE public.company_document_templates
SET updated_at = now(),
    body = replace(
      body,
      '<th class="col-1">Name of<br/>nominee/nominees</th><th class="col-2">Address</th><th class="col-3">Nominee''s<br/>relationship<br/>with the<br/>employee</th><th class="col-4">Date<br/>of<br/>Birth</th><th class="col-5">Total amount of share<br/>of accumulations in<br/>credit to be paid to<br/>each nominee</th><th class="col-6">If the nominee is minor,<br/>name, relationship, and<br/>address of the guardian who<br/>may receive the amount<br/>during the minority of<br/>nominee</th>',
      '$nominee_table'
    )
WHERE doc_type = 'form_vii'
  AND is_active = true
  AND is_archived = false
  AND body LIKE '%class="form-vii-doc"%'
  AND body NOT LIKE '%$nominee_table%';