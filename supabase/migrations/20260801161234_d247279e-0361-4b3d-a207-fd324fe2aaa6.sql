UPDATE public.company_document_templates
SET body = replace(body, '/__l5e/assets-v1/20a50aa3-b6c2-4ed4-a3f3-7d4527ee1acd/radiant-logo.png', '/__l5e/assets-v1/de428422-b314-4b6d-811b-f955dd1350db/radiant-logo.png')
WHERE body LIKE '%20a50aa3-b6c2-4ed4-a3f3-7d4527ee1acd%';