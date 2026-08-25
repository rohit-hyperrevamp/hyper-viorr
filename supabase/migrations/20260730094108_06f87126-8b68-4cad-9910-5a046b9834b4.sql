UPDATE public.company_document_templates
SET title = 'FORM VII — Nomination Form',
    version = version + 1,
    body = '<div class="doc-title">FORM VII</div>
<div class="doc-rule">[See rule 86]</div>
<div class="doc-sub">NOMINATION FORM</div>
<div class="doc-act">(To be submitted by the employee to the employer in duplicate)</div>

<table class="plain" style="margin-top:14px">
  <tr><td style="width:22%">To,</td><td></td></tr>
  <tr><td colspan="2">The Employer,<br/>$company_name</td></tr>
</table>

<p>I, the undersigned, hereby nominate the person(s) mentioned below to receive the amount(s) payable to me under the applicable statutory benefits (Provident Fund, Employees'' Pension Scheme, Employees'' State Insurance and Gratuity) in the event of my death, and declare that the particulars furnished below are true and correct to the best of my knowledge and belief.</p>

<div class="sec">1. PARTICULARS OF THE EMPLOYEE</div>
<table>
  <tr><td class="num">1</td><td class="lbl">Name of the employee (in full)</td><td>$employee_name</td></tr>
  <tr><td class="num">2</td><td class="lbl">Employee code / Candidate code</td><td>$employee_code</td></tr>
  <tr><td class="num">3</td><td class="lbl">Sex</td><td>$sex</td></tr>
  <tr><td class="num">4</td><td class="lbl">Marital status</td><td>$marital_status</td></tr>
  <tr><td class="num">5</td><td class="lbl">Father''s / Husband''s name</td><td>$father_or_spouse_name</td></tr>
  <tr><td class="num">6</td><td class="lbl">Date of birth</td><td>$date_of_birth</td></tr>
  <tr><td class="num">7</td><td class="lbl">Date of joining / appointment</td><td>$joining_date</td></tr>
  <tr><td class="num">8</td><td class="lbl">Designation</td><td>$designation</td></tr>
  <tr><td class="num">9</td><td class="lbl">Unit / Place of work</td><td>$unit_name, $unit_city</td></tr>
  <tr><td class="num">10</td><td class="lbl">Aadhaar number</td><td>$aadhaar</td></tr>
  <tr><td class="num">11</td><td class="lbl">Mobile number</td><td>$employee_mobile</td></tr>
  <tr><td class="num">12</td><td class="lbl">Present address</td><td>$temporary_address</td></tr>
  <tr><td class="num">13</td><td class="lbl">Permanent address</td><td>$permanent_address</td></tr>
</table>

<div class="sec">2. PARTICULARS OF NOMINEE(S)</div>
$nominee_table
<p class="small">Note: The total share allotted to all nominees must equal 100 per cent. Where a nominee is a minor, the name and address of the guardian receiving the amount on the nominee''s behalf shall be recorded in the employee''s service file.</p>

<div class="sec">3. FAMILY MEMBERS FOR ESIC BENEFIT</div>
$esic_family_table
<p class="small">Note: Minimum one and maximum six family members may be declared for ESIC benefit. Where a single member is declared, the entire share of 100 per cent vests in that member; where more than one member is declared, the share is distributed equally among them.</p>

<div class="sec">4. DECLARATION</div>
<p>I hereby certify that the particulars furnished above are true and correct. I further undertake to inform the employer in writing of any change in the particulars of the nominee(s) or family member(s) declared above.</p>

<table class="plain" style="margin-top:16px">
  <tr><td style="width:50%">Place: $unit_city</td><td>Date: $date</td></tr>
</table>

<div class="sec">5. CERTIFICATE BY THE EMPLOYER</div>
<p>Certified that the above declaration has been signed by Shri / Smt. / Kum. <b>$employee_name</b>, employed in this establishment as <b>$designation</b>, in my presence, and that the nomination has been recorded in the records of the establishment on $date.</p>'
WHERE doc_type = 'form_vii';