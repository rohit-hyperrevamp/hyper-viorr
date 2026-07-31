ALTER TABLE public.company_document_templates DROP CONSTRAINT IF EXISTS company_document_templates_doc_type_check;
ALTER TABLE public.company_document_templates ADD CONSTRAINT company_document_templates_doc_type_check
  CHECK (doc_type IN ('nda','appointment_letter','form_vii','company_stamp'));

INSERT INTO public.company_document_templates (doc_type, version, title, body, is_active, is_archived)
SELECT 'company_stamp', 1, 'Company Stamp and Signatures',
'<div class="govdoc"><h2 style="text-align:center;margin:0 0 8px">COMPANY STAMP AND SIGNATURES</h2><p style="text-align:center;margin:0 0 18px">Radiant Guard Services Pvt. Ltd. — Official round seal with authorised signatory sign.</p><div style="text-align:center"><img src="/__l5e/assets-v1/87ea9ec6-0ff1-4c65-8122-abc676b013d3/company-stamp.png" alt="Company stamp and authorised signature" style="width:260px;height:auto" /></div><p style="text-align:center;margin-top:18px">Authorised Signatory</p></div>',
true, false
WHERE NOT EXISTS (SELECT 1 FROM public.company_document_templates WHERE doc_type = 'company_stamp');