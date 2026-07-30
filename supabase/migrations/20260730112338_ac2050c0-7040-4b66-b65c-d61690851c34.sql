UPDATE public.company_document_templates
SET updated_at = now()
WHERE doc_type = 'form_vii'
  AND is_active = true
  AND is_archived = false;