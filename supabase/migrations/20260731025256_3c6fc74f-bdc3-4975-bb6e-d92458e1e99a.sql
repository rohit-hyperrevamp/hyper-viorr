UPDATE public.company_document_templates SET is_active = false WHERE doc_type = 'form_vii';

INSERT INTO public.company_document_templates (doc_type, version, title, body, is_active, is_archived)
VALUES ('form_vii', 5, 'FORM VII — Nomination Form', '
<div class="form-vii-doc">
  <div class="doc-title">FORM-VII</div>
  <div class="doc-rule" style="font-weight:400">(See rule 28)</div>
  <div class="doc-sub">NOMINATION FORM</div>

  <div class="gov-fields">
    <div>1. Name of person making nomination: <span class="field-fill">$employee_name</span></div>
    <div>(In block letters): <span class="field-fill">$employee_name</span></div>
    <div>2. Father''s/Spouse''s Name: <span class="field-fill">$father_or_spouse_name</span></div>
    <div>3. Date of Birth: <span class="field-fill">$date_of_birth</span></div>
    <div>4. Sex: <span class="field-fill">$sex</span></div>
    <div>5. Marital Status: <span class="field-fill">$marital_status</span></div>
    <div>6. Address:</div>
    <div class="address-lines">
      <div>Permanent: <span class="field-fill">$permanent_address</span></div>
      <div>Temporary: <span class="field-fill">$temporary_address</span></div>
    </div>
  </div>

  <div class="nomination-text">I hereby nominate the person(s)/cancel the nomination made by me previously and nominate the person(s) mentioned below to receive any amount due to me from the employer in the event of my death:-</div>

  $nominee_table

  <div class="cert-list">
    <div>1. Certified that I have no family and if I acquire a family hereafter, the above nomination shall be deemed as cancelled.</div>
    <div>2. Certified that my father/mother is/are dependent upon me.</div>
    <div>3. Strike out whichever is not applicable.</div>
  </div>

  <div class="employee-sign"><span data-signature-slot="employee"></span>Signature or the thumb impression of the employee</div>

  <div class="employer-cert-title">CERTIFICATE BY EMPLOYER</div>
  <div class="employer-cert-copy">Certified that the above declaration and nomination has been signed/thumb impressed before me by Shri/Smt/Ku <span class="field-fill">$employee_name</span> employed in my establishment after he/she has read the entry/entries <u>or</u> have been read over to him/her by me and got confirmed by him/her in either of the cases.</div>

  <div class="employer-sign"><span data-signature-slot="company"></span>Signature of the employer or other authorised officer of the establishment and Designation</div>

  <div class="place-date">
    <div>Place: <span class="field-fill">$unit_city</span></div>
    <div>Date: <span class="field-fill">$date</span></div>
  </div>

  <div class="stamp-line">Name and Address of the Factory/Establishment and rubber stamp thereof</div>
</div>
', true, false);

DELETE FROM public.employee_signed_documents
WHERE doc_type = 'form_vii' AND signed_at IS NULL;