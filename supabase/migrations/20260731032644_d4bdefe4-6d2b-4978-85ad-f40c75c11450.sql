UPDATE public.company_document_templates
SET body = '<div class="govdoc" style="text-align:center"><img src="/__l5e/assets-v1/87ea9ec6-0ff1-4c65-8122-abc676b013d3/company-stamp.png" alt="Company stamp and authorised signature" style="width:320px;height:auto" /></div>',
    updated_at = now()
WHERE doc_type = 'company_stamp';