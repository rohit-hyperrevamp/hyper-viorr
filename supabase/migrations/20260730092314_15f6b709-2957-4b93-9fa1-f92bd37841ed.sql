ALTER TABLE public.company_document_templates DROP CONSTRAINT IF EXISTS company_document_templates_doc_type_check;
ALTER TABLE public.company_document_templates ADD CONSTRAINT company_document_templates_doc_type_check
  CHECK (doc_type = ANY (ARRAY['nda'::text, 'appointment_letter'::text, 'form_vii'::text]));

ALTER TABLE public.employee_signed_documents DROP CONSTRAINT IF EXISTS employee_signed_documents_doc_type_check;
ALTER TABLE public.employee_signed_documents ADD CONSTRAINT employee_signed_documents_doc_type_check
  CHECK (doc_type = ANY (ARRAY['nda'::text, 'appointment_letter'::text, 'form_vii'::text]));

CREATE POLICY "People ops read employee_signed_documents"
  ON public.employee_signed_documents FOR SELECT TO authenticated
  USING (public.current_user_is_people_ops() OR candidate_id = public.current_user_candidate_id());

CREATE POLICY "People ops insert employee_signed_documents"
  ON public.employee_signed_documents FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_people_ops());

CREATE POLICY "People ops update employee_signed_documents"
  ON public.employee_signed_documents FOR UPDATE TO authenticated
  USING (public.current_user_is_people_ops())
  WITH CHECK (public.current_user_is_people_ops());

CREATE UNIQUE INDEX IF NOT EXISTS uq_esd_candidate_doc_version
  ON public.employee_signed_documents (candidate_id, doc_type, version);