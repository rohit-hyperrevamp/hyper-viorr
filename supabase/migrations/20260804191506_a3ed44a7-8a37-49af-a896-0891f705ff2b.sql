ALTER TABLE public.company_document_templates DROP CONSTRAINT IF EXISTS company_document_templates_doc_type_check;
ALTER TABLE public.company_document_templates ADD CONSTRAINT company_document_templates_doc_type_check CHECK (doc_type = ANY (ARRAY['nda'::text,'appointment_letter'::text,'form_vii'::text,'company_stamp'::text,'id_card'::text,'posting_order'::text,'wage_slip'::text]));

ALTER TABLE public.employee_signed_documents DROP CONSTRAINT IF EXISTS employee_signed_documents_doc_type_check;
ALTER TABLE public.employee_signed_documents ADD CONSTRAINT employee_signed_documents_doc_type_check CHECK (doc_type = ANY (ARRAY['nda'::text,'appointment_letter'::text,'form_vii'::text,'company_stamp'::text,'id_card'::text,'posting_order'::text,'wage_slip'::text]));

INSERT INTO public.company_document_templates (doc_type, version, title, body, is_active, is_archived)
SELECT 'wage_slip', 1, 'Form XVI — Wage Slip',
$body$<div class="wage-slip-doc">
  <div class="doc-title">FORM XVI</div>
  <div class="doc-rule" style="font-weight:400">(See rule 72(2))</div>
  <div class="doc-sub">Wage slip</div>

  <table class="plain ws-head">
    <tr><td>Date of issue: <b>$issue_date</b></td><td class="right">Period: <b>$period</b></td></tr>
    <tr><td colspan="2">Name of the Establishment: <b>$company_name</b></td></tr>
    <tr><td colspan="2">Address: $establishment_address</td></tr>
  </table>

  <table class="ws-table">
    <tr><td class="n">1.</td><td class="k">Name of the Employee</td><td class="v" colspan="3">$employee_name</td></tr>
    <tr><td class="n">2.</td><td class="k">Employee ID</td><td class="v" colspan="3">$employee_code</td></tr>
    <tr><td class="n">3.</td><td class="k">Designation</td><td class="v" colspan="3">$designation</td></tr>
    <tr><td class="n">4.</td><td class="k">UAN</td><td class="v" colspan="3">$uan</td></tr>
    <tr><td class="n">5.</td><td class="k">Bank Account Number</td><td class="v" colspan="3">$bank_account_number</td></tr>
    <tr><td class="n">6.</td><td class="k">Wage period</td><td class="v" colspan="3">$wage_period</td></tr>
    <tr>
      <td class="n">7.</td><td class="k">Rate of wages payable</td>
      <td class="v">a) Basic<br/><b>$rate_basic</b></td>
      <td class="v">b) D.A.<br/><b>$rate_da</b></td>
      <td class="v">c) Other allowances<br/><b>$rate_other</b></td>
    </tr>
    <tr><td class="n">8.</td><td class="k">Total attendance/unit of work done</td><td class="v" colspan="3">$total_attendance</td></tr>
    <tr><td class="n">9.</td><td class="k">Extra duty wages</td><td class="v" colspan="3">$extra_duty_wages</td></tr>
    <tr><td class="n">10.</td><td class="k">Gross wages payable</td><td class="v" colspan="3"><b>$gross_wages</b></td></tr>
    <tr>
      <td class="n">11.</td><td class="k">Total deductions <b>$total_deductions</b></td>
      <td class="v">a) PF<br/><b>$ded_pf</b></td>
      <td class="v">b) ESI<br/><b>$ded_esi</b></td>
      <td class="v">c) Others<br/><b>$ded_others</b></td>
    </tr>
    <tr><td class="n">12.</td><td class="k">Net wages paid</td><td class="v" colspan="3"><b>$net_wages</b></td></tr>
  </table>

  <div class="ws-sign">
    <img class="ws-stamp" src="$company_stamp" alt="" />
    <div class="sign-line">Employer / Pay-in-charge signature</div>
  </div>
</div>$body$,
true, false
WHERE NOT EXISTS (SELECT 1 FROM public.company_document_templates WHERE doc_type = 'wage_slip');