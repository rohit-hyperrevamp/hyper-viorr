
-- Templates
CREATE TABLE public.company_document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL CHECK (doc_type IN ('nda','appointment_letter')),
  version integer NOT NULL DEFAULT 1,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_active_template_per_type
  ON public.company_document_templates (doc_type)
  WHERE is_active = true AND is_archived = false;

ALTER TABLE public.company_document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read company_document_templates"
  ON public.company_document_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write company_document_templates"
  ON public.company_document_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update company_document_templates"
  ON public.company_document_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete company_document_templates"
  ON public.company_document_templates FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_cdt_updated_at
  BEFORE UPDATE ON public.company_document_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Signed documents
CREATE TABLE public.employee_signed_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  template_id uuid NOT NULL,
  doc_type text NOT NULL CHECK (doc_type IN ('nda','appointment_letter')),
  version integer NOT NULL,
  rendered_body text NOT NULL DEFAULT '',
  employee_signature_data text NOT NULL DEFAULT '',
  company_signature_data text NOT NULL DEFAULT '',
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_esd_candidate ON public.employee_signed_documents(candidate_id);

ALTER TABLE public.employee_signed_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read employee_signed_documents"
  ON public.employee_signed_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write employee_signed_documents"
  ON public.employee_signed_documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update employee_signed_documents"
  ON public.employee_signed_documents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete employee_signed_documents"
  ON public.employee_signed_documents FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_esd_updated_at
  BEFORE UPDATE ON public.employee_signed_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed two initial active templates
INSERT INTO public.company_document_templates (doc_type, version, title, body, is_active, is_archived) VALUES
('nda', 1, 'One-Pager Non-Disclosure Agreement',
$body$NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into on $date between Radiant Guard Services Pvt. Ltd. ("Company") and $employee_name, holding Employee Code $employee_code, residing at $employee_address ("Employee").

1. CONFIDENTIAL INFORMATION
The Employee acknowledges that during the course of employment with the Company, the Employee may have access to confidential and proprietary information including but not limited to client lists, deployment schedules, security plans, pricing, financial data, and operational procedures ("Confidential Information").

2. OBLIGATIONS
The Employee agrees to (a) hold all Confidential Information in strict confidence, (b) not disclose any Confidential Information to any third party without prior written consent of the Company, and (c) use Confidential Information solely for the purpose of performing duties on behalf of the Company.

3. DURATION
The obligations under this Agreement shall survive the termination of employment and shall continue for a period of three (3) years thereafter.

4. RETURN OF MATERIALS
Upon termination of employment, the Employee shall return all documents, records, and materials containing Confidential Information to the Company.

5. GOVERNING LAW
This Agreement shall be governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts at $unit_city.

IN WITNESS WHEREOF, the parties have executed this Agreement on the date first written above.$body$,
true, false),
('appointment_letter', 1, 'One-Pager Appointment Letter',
$body$APPOINTMENT LETTER

Date: $date
Ref: $employee_code

Dear $employee_name,

We are pleased to offer you the position of $designation at Radiant Guard Services Pvt. Ltd., to be deployed at $unit_name ($unit_city), with effect from $joining_date.

1. DESIGNATION & REPORTING
You will be designated as $designation and will report to your Unit-In-Charge. Your primary place of duty will be $unit_name.

2. REMUNERATION
Your monthly compensation, allowances, and statutory contributions shall be as per the Company's payroll policy applicable to your designation and unit, communicated to you separately.

3. WORKING HOURS
You shall observe the duty roster assigned by the Unit-In-Charge. Standard duty hours, weekly off, and overtime rules apply as per the Labour Laws and Company policy.

4. PROBATION & CONFIRMATION
You shall be on probation for a period of six (6) months from the date of joining. Confirmation in service shall be subject to satisfactory performance and verification of credentials.

5. CONDUCT & DISCIPLINE
You shall abide by the Company's Code of Conduct, Standing Orders, and all lawful instructions of your superiors. Any breach may lead to disciplinary action including termination.

6. TERMINATION
Either party may terminate this employment by giving thirty (30) days written notice or salary in lieu thereof.

7. CONFIDENTIALITY
You shall maintain strict confidentiality of all Company and client information, in accordance with the separate Non-Disclosure Agreement executed by you.

We welcome you to the Radiant Guard family and wish you a long and successful career with us.$body$,
true, false);
