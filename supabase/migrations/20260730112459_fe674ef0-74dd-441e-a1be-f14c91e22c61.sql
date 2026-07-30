UPDATE public.company_document_templates
SET updated_at = now(),
    body = $formvii$
<div class="form-vii-doc">
  <div class="gazette-head"><span>214</span><span>BOMBAY LABOUR WELFARE FUND ACT, 1953</span><span>B.L.F. ACT, 1953</span></div>
  <div class="gazette-rule"></div>

  <div class="doc-title">FORM-VII</div>
  <div class="doc-rule">(See Rule 21)</div>
  <div class="doc-sub">Nomination Form</div>

  <div class="gov-fields">
    <div>Name of Establishment : <span class="field-fill">Radiant Guard Services Pvt. Ltd.</span></div>
    <div>Name of the employee in full : <span class="field-fill">$employee_name</span></div>
    <div>Sex : <span class="field-fill">$sex</span></div>
    <div>Religion : <span class="field-fill">_______</span></div>
    <div>Whether unmarried/married/widow/widower : <span class="field-fill">$marital_status</span></div>
    <div>Department/Branch/Section where employed : <span class="field-fill">$unit_name</span></div>
    <div>Post held with Ticket or Serial No., if any : <span class="field-fill">$designation / $employee_code</span></div>
    <div>Date of appointment : <span class="field-fill">$joining_date</span></div>
    <div>Permanent address :</div>
    <div class="address-lines field-fill">
      <div>$permanent_address</div>
      <div>&nbsp;</div>
    </div>
  </div>

  <div class="nomination-text">I hereby nominate the person/persons mentioned below to receive the amount standing to my credit in the Labour Welfare Fund in the event of my death before the amount has become payable or having become payable has not been paid.</div>

  $nominee_table

  <div class="cert-list">
    <div>1. Certified that I have no family as defined in the Bombay Labour Welfare Fund Act, 1953, and should I acquire a family hereafter the above nomination should be deemed as cancelled.</div>
    <div>2. Certified that my father/mother is/are dependent upon me.</div>
    <div>3. Certified that my husband has by a notice in writing to the Board waived his right to receive the amount due to me.</div>
  </div>

  <div class="employee-sign"><span data-signature-slot="employee"></span>Signature or thumb-impression<br/>of the employee.</div>

  <div class="employer-cert-title">Certificate by Employer</div>
  <div class="employer-cert-copy">Certified that the above declaration and nomination has been signed/thumb-impressed before me by Shri/Smt./Kumari <span class="field-fill">$employee_name</span> employed in my establishment after he/she has read the entries/the entries have been read over to him/her by me and got confirmed by him/her.</div>

  <div class="employer-sign"><span data-signature-slot="company"></span>Signature of the employer or other<br/>authorised officers of the Establishment.</div>

  <div class="place-date">
    <div>Place : <span class="field-fill">$unit_city</span></div>
    <div>Date : <span class="field-fill">$date</span></div>
  </div>

  <div class="stamp-line">Name, designation and stamp</div>
</div>
$formvii$
WHERE doc_type = 'form_vii'
  AND is_active = true
  AND is_archived = false;