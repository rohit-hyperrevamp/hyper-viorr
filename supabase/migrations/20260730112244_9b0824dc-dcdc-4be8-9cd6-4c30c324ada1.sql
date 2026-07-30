UPDATE public.employee_signed_documents
SET rendered_body = replace(
      replace(
        rendered_body,
        '<div class="employee-sign">Signature or thumb-impression<br/>of the employee.</div>',
        '<div class="employee-sign"><span data-signature-slot="employee"></span>Signature or thumb-impression<br/>of the employee.</div>'
      ),
      '<div class="employer-sign">Signature of the employer or other<br/>authorised officers of the Establishment.</div>',
      '<div class="employer-sign"><span data-signature-slot="company"></span>Signature of the employer or other<br/>authorised officers of the Establishment.</div>'
    ),
    updated_at = now()
WHERE doc_type = 'form_vii'
  AND signed_at IS NULL
  AND rendered_body LIKE '%class="form-vii-doc"%';