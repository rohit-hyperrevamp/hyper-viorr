update public.company_document_templates
set body = jsonb_set(
  jsonb_set(body::jsonb, '{frontLogoHeight}', '22'::jsonb, true),
  '{footer,contactLines}', '["Mob. No. : 09156453001"]'::jsonb, true
)::text,
updated_at = now()
where doc_type = 'id_card' and body like '{%';