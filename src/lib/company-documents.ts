import { supabase } from "@/integrations/supabase/client";

export type DocType = "nda" | "appointment_letter" | "form_vii";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  nda: "Non-Disclosure Agreement",
  appointment_letter: "Appointment Letter",
  form_vii: "Form VII — Nomination Form",
};

export const DOC_TYPE_SHORT: Record<DocType, string> = {
  nda: "NDA",
  appointment_letter: "Appointment Letter",
  form_vii: "Form VII",
};

export type DocumentTemplate = {
  id: string;
  doc_type: DocType;
  version: number;
  title: string;
  body: string;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type SignedDocument = {
  id: string;
  candidate_id: string;
  template_id: string;
  doc_type: DocType;
  version: number;
  rendered_body: string;
  employee_signature_data: string;
  company_signature_data: string;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NomineeForRender = {
  name: string;
  address: string;
  relation: string;
  dob: string | null;
  share: number;
  guardian: string;
};

export type CandidateForRender = {
  id: string;
  full_name: string;
  employee_code: string;
  candidate_code: string;
  email: string;
  mobile: string;
  aadhaar_number: string;
  date_of_birth: string | null;
  designation_name: string;
  unit_name: string;
  unit_city: string;
  unit_id: string | null;
  designation_id: string | null;
  present_address1: string;
  present_address2: string;
  present_city: string;
  present_state: string;
  present_pincode: string;
  preferred_joining_date: string | null;
  gender: string;
  marital_status: string;
  father_or_spouse_name: string;
  permanent_address: string;
  nominees: NomineeForRender[];
  esic_family?: EsicFamilyForRender[];
};

export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "employee_name", label: "Employee Full Name" },
  { key: "employee_code", label: "Employee Code" },
  { key: "candidate_code", label: "Candidate Code" },
  { key: "designation", label: "Designation" },
  { key: "unit_name", label: "Unit Name" },
  { key: "unit_city", label: "Unit City" },
  { key: "employee_address", label: "Employee Full Address" },
  { key: "employee_email", label: "Employee Email" },
  { key: "employee_mobile", label: "Employee Mobile" },
  { key: "aadhaar", label: "Aadhaar Number" },
  { key: "date_of_birth", label: "Date of Birth" },
  { key: "joining_date", label: "Joining Date" },
  { key: "date", label: "Today's Date" },
  { key: "company_name", label: "Company Name" },
  { key: "father_or_spouse_name", label: "Father's / Spouse's Name" },
  { key: "sex", label: "Sex" },
  { key: "marital_status", label: "Marital Status" },
  { key: "permanent_address", label: "Permanent Address" },
  { key: "temporary_address", label: "Temporary (Present) Address" },
  { key: "nominee_table", label: "Nominee Table (all nominees)" },
  { key: "esic_family_table", label: "ESIC Family Members Table" },
  { key: "nominee_1_name", label: "Nominee 1 Name" },
  { key: "nominee_1_address", label: "Nominee 1 Address" },
  { key: "nominee_1_relation", label: "Nominee 1 Relationship" },
  { key: "nominee_1_dob", label: "Nominee 1 Date of Birth" },
  { key: "nominee_1_share", label: "Nominee 1 Share (%)" },
];

function fmtDate(s: string | null | undefined): string {
  if (!s) return "_______";
  try {
    return new Date(s).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

function nomineeTable(nominees: NomineeForRender[]): string {
  if (!nominees.length) return "(No nominee recorded)";
  return nominees
    .map(
      (n, i) =>
        `${i + 1}. Name: ${n.name || "_______"} | Address: ${n.address || "_______"} | Relationship: ${
          n.relation || "_______"
        } | Date of birth: ${n.dob ? fmtDate(n.dob) : "_______"} | Share: ${n.share || 0}%`,
    )
    .join("\n");
}

export function buildPlaceholderMap(c: CandidateForRender, html = false): Record<string, string> {
  const addr = [c.present_address1, c.present_address2, c.present_city, c.present_state, c.present_pincode]
    .filter((x) => x && x.trim())
    .join(", ");
  const n1 = c.nominees?.[0];
  return {
    employee_name: c.full_name || "_______",
    employee_code: c.employee_code || c.candidate_code || "_______",
    candidate_code: c.candidate_code || "_______",
    designation: c.designation_name || "_______",
    unit_name: c.unit_name || "_______",
    unit_city: c.unit_city || c.present_city || "_______",
    employee_address: addr || "_______",
    employee_email: c.email || "_______",
    employee_mobile: c.mobile || "_______",
    aadhaar: c.aadhaar_number || "_______",
    date_of_birth: fmtDate(c.date_of_birth),
    joining_date: fmtDate(c.preferred_joining_date),
    date: fmtDate(new Date().toISOString()),
    company_name: "Radiant Guard Services Pvt. Ltd.",
    father_or_spouse_name: c.father_or_spouse_name || "_______",
    sex: c.gender || "_______",
    marital_status: c.marital_status || "_______",
    permanent_address: c.permanent_address || addr || "_______",
    temporary_address: addr || "_______",
    nominee_table: html ? nomineeTableHtml(c.nominees ?? []) : nomineeTable(c.nominees ?? []),
    esic_family_table: html
      ? esicFamilyTableHtml(c.esic_family ?? [])
      : esicFamilyTableText(c.esic_family ?? []),
    nominee_1_name: n1?.name || "_______",
    nominee_1_address: n1?.address || "_______",
    nominee_1_relation: n1?.relation || "_______",
    nominee_1_dob: n1?.dob ? fmtDate(n1.dob) : "_______",
    nominee_1_share: n1 ? `${n1.share}` : "_______",
  };
}

export function renderTemplate(body: string, map: Record<string, string>): string {
  return body.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (m, key) => {
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : m;
  });
}

function contactKey(c: any, idx: number) {
  if (c?.id) return String(c.id);
  const name = (c?.name ?? "").trim();
  const mob = (c?.mobile ?? c?.phone ?? "").trim();
  return name || mob ? `${name}|${mob}` : `idx:${idx}`;
}

/** Nominees are stored as compliance.nominees = [{contact, percent}] pointing at candidates.contacts. */
export function resolveNominees(candidate: any): NomineeForRender[] {
  const contacts: any[] = Array.isArray(candidate?.contacts) ? candidate.contacts : [];
  const raw = candidate?.compliance?.nominees;
  const flat: { contact: string; percent: number }[] = [];
  const push = (v: any) => {
    if (!v) return;
    if (typeof v === "string") flat.push({ contact: v, percent: 100 });
    else if (Array.isArray(v)) {
      for (const e of v) {
        if (e && typeof e === "object") flat.push({ contact: String(e.contact ?? ""), percent: Number(e.percent ?? 0) });
      }
    }
  };
  if (Array.isArray(raw)) push(raw);
  else if (raw && typeof raw === "object") for (const k of Object.keys(raw)) push(raw[k]);

  const seen = new Set<string>();
  const out: NomineeForRender[] = [];
  for (const e of flat) {
    if (!e.contact || seen.has(e.contact)) continue;
    seen.add(e.contact);
    const idx = contacts.findIndex((c, i) => contactKey(c, i) === e.contact);
    const c = idx >= 0 ? contacts[idx] : null;
    out.push({
      name: (c?.name ?? "").trim() || e.contact.split("|")[0] || "",
      address: (c?.address ?? "").trim(),
      relation: (c?.relation ?? "").trim(),
      dob: (c?.dob as string) || null,
      share: Number.isFinite(e.percent) ? e.percent : 0,
      guardian: [c?.guardian_name, c?.guardian_address || c?.guardian_mobile].filter(Boolean).join(", "),
    });
  }
  return out;
}

export async function fetchCandidateForRender(id: string): Promise<CandidateForRender> {
  const { data, error } = await supabase
    .from("candidates")
    .select(
      "id,full_name,employee_code,candidate_code,email,mobile,aadhaar_number,date_of_birth,unit_id,designation_id,present_address1,present_address2,present_city,present_state,present_pincode,preferred_joining_date,gender,marital_status,other_info,contacts,compliance,permanent_address1,permanent_address2,permanent_city,permanent_state,permanent_pincode",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Candidate not found");

  let designation_name = "";
  let unit_name = "";
  let unit_city = "";
  if (data.designation_id) {
    const { data: d } = await supabase
      .from("designations")
      .select("name")
      .eq("id", data.designation_id)
      .maybeSingle();
    designation_name = (d?.name as string) ?? "";
  }
  if (data.unit_id) {
    const { data: u } = await supabase
      .from("units")
      .select("name,billing_city,shipping_city")
      .eq("id", data.unit_id)
      .maybeSingle();
    unit_name = (u?.name as string) ?? "";
    unit_city = ((u?.billing_city as string) || (u?.shipping_city as string)) ?? "";
  }

  const other = (data as any).other_info ?? {};
  const maritalRaw = ((data as any).marital_status as string) ?? "";
  const isMarried = maritalRaw.toLowerCase().startsWith("married");
  const permanent_address = [
    (data as any).permanent_address1,
    (data as any).permanent_address2,
    (data as any).permanent_city,
    (data as any).permanent_state,
    (data as any).permanent_pincode,
  ]
    .filter((x: any) => x && String(x).trim())
    .join(", ");

  return {
    id: data.id as string,
    full_name: (data.full_name as string) ?? "",
    employee_code: (data.employee_code as string) ?? "",
    candidate_code: (data.candidate_code as string) ?? "",
    email: (data.email as string) ?? "",
    mobile: (data.mobile as string) ?? "",
    aadhaar_number: (data.aadhaar_number as string) ?? "",
    date_of_birth: (data.date_of_birth as string) ?? null,
    designation_name,
    unit_name,
    unit_city,
    unit_id: (data.unit_id as string) ?? null,
    designation_id: (data.designation_id as string) ?? null,
    present_address1: (data.present_address1 as string) ?? "",
    present_address2: (data.present_address2 as string) ?? "",
    present_city: (data.present_city as string) ?? "",
    present_state: (data.present_state as string) ?? "",
    present_pincode: (data.present_pincode as string) ?? "",
    preferred_joining_date: (data.preferred_joining_date as string) ?? null,
    gender: ((data as any).gender as string) ?? "",
    marital_status: maritalRaw,
    father_or_spouse_name:
      (isMarried ? other.spouse_name || other.father_name : other.father_name || other.spouse_name) ?? "",
    permanent_address,
    nominees: resolveNominees(data),
    esic_family: resolveEsicFamily(data),
  };
}

/**
 * Attach the active Form VII template to a candidate as an employee-specific document.
 * Idempotent: skips when a Form VII already exists for the candidate at that version.
 */
export async function ensureFormViiForCandidate(candidateId: string): Promise<"created" | "exists" | "no-template"> {
  const template = await fetchActiveTemplate("form_vii");
  if (!template) return "no-template";

  const { data: existing } = await supabase
    .from("employee_signed_documents")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("doc_type", "form_vii")
    .eq("version", template.version)
    .maybeSingle();
  if (existing) return "exists";

  // Drop stale unsigned copies from older template versions so the employee
  // always holds exactly one Form VII rendered from the current master layout.
  await supabase
    .from("employee_signed_documents")
    .delete()
    .eq("candidate_id", candidateId)
    .eq("doc_type", "form_vii")
    .neq("version", template.version)
    .eq("employee_signature_data", "")
    .eq("company_signature_data", "");


  const candidate = await fetchCandidateForRender(candidateId);
  const rendered = renderTemplate(template.body, buildPlaceholderMap(candidate, isHtmlBody(template.body)));

  const { error } = await supabase.from("employee_signed_documents").insert({
    candidate_id: candidateId,
    template_id: template.id,
    doc_type: "form_vii",
    version: template.version,
    rendered_body: rendered,
    employee_signature_data: "",
    company_signature_data: "",
  } as any);
  if (error) throw error;
  return "created";
}


export async function fetchActiveTemplate(docType: DocType): Promise<DocumentTemplate | null> {
  const { data, error } = await supabase
    .from("company_document_templates")
    .select("*")
    .eq("doc_type", docType)
    .eq("is_active", true)
    .eq("is_archived", false)
    .maybeSingle();
  if (error) throw error;
  return (data as DocumentTemplate) ?? null;
}

/**
 * Generate a downloadable PDF (Blob URL) from a rendered document body + signatures.
 * Uses jsPDF dynamically so it stays out of SSR bundles.
 */
export async function generateDocumentPdf(opts: {
  title: string;
  body: string;
  employeeSignatureDataUrl?: string;
  companySignatureDataUrl?: string;
  employeeName: string;
  employeeCode: string;
  signedAt: string | null;
}): Promise<Blob> {
  if (isHtmlBody(opts.body)) {
    return generateHtmlDocumentPdf({
      body: opts.body,
      employeeSignatureDataUrl: opts.employeeSignatureDataUrl,
      companySignatureDataUrl: opts.companySignatureDataUrl,
    });
  }
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;

  // Header band
  doc.setFillColor(245, 158, 11); // amber-500
  doc.rect(0, 0, pageWidth, 6, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(120, 53, 15); // amber-900
  doc.text("RADIANT GUARD SERVICES PVT. LTD.", margin, 36);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("Confidential Document", pageWidth - margin, 36, { align: "right" });

  doc.setDrawColor(229, 231, 235);
  doc.line(margin, 48, pageWidth - margin, 48);

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text(opts.title.toUpperCase(), pageWidth / 2, 78, { align: "center" });

  // Body
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(31, 41, 55);

  const lineHeight = 14;
  let y = 110;
  const paragraphs = opts.body.split(/\n+/);
  for (const para of paragraphs) {
    if (!para.trim()) {
      y += lineHeight * 0.6;
      continue;
    }
    const isHeading = /^[A-Z0-9 .\-]{6,}$/.test(para.trim()) && para.trim().length < 80;
    if (isHeading) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
    }
    const lines: string[] = doc.splitTextToSize(para.trim(), contentWidth) as string[];
    for (const line of lines) {
      if (y > pageHeight - 200) {
        doc.addPage();
        y = margin + 20;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += lineHeight * 0.4;
  }

  // Signatures
  if (y > pageHeight - 200) {
    doc.addPage();
    y = margin + 20;
  }
  const sigY = Math.max(y + 30, pageHeight - 180);
  const sigBoxH = 60;
  const colW = (contentWidth - 30) / 2;

  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.5);
  // Employee
  doc.rect(margin, sigY, colW, sigBoxH);
  if (opts.employeeSignatureDataUrl) {
    try {
      doc.addImage(opts.employeeSignatureDataUrl, "PNG", margin + 4, sigY + 4, colW - 8, sigBoxH - 8);
    } catch {
      /* ignore image errors */
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    doc.text("(unsigned)", margin + colW / 2, sigY + sigBoxH / 2, { align: "center" });
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(31, 41, 55);
  doc.text("EMPLOYEE", margin, sigY + sigBoxH + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(opts.employeeName || "—", margin, sigY + sigBoxH + 28);
  doc.setTextColor(120, 120, 120);
  doc.text(`Code: ${opts.employeeCode || "—"}`, margin, sigY + sigBoxH + 40);

  // Company
  const cx = margin + colW + 30;
  doc.rect(cx, sigY, colW, sigBoxH);
  if (opts.companySignatureDataUrl) {
    try {
      doc.addImage(opts.companySignatureDataUrl, "PNG", cx + 4, sigY + 4, colW - 8, sigBoxH - 8);
    } catch {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(11);
      doc.setTextColor(120, 53, 15);
      doc.text("Radiant Guard Signatures", cx + colW / 2, sigY + sigBoxH / 2 + 4, { align: "center" });
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(120, 53, 15);
    doc.text("Radiant Guard Signatures", cx + colW / 2, sigY + sigBoxH / 2 + 4, { align: "center" });
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(31, 41, 55);
  doc.text("FOR RADIANT GUARD SERVICES PVT. LTD.", cx, sigY + sigBoxH + 14);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text(`Signed on: ${opts.signedAt ? fmtDate(opts.signedAt) : fmtDate(new Date().toISOString())}`, cx, sigY + sigBoxH + 28);

  // Footer
  doc.setDrawColor(229, 231, 235);
  doc.line(margin, pageHeight - 36, pageWidth - margin, pageHeight - 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("Generated by Radiant Guard Admin Console", margin, pageHeight - 22);
  doc.text(fmtDate(new Date().toISOString()), pageWidth - margin, pageHeight - 22, { align: "right" });

  return doc.output("blob");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ */
/* HTML (statutory form) documents                                     */
/* ------------------------------------------------------------------ */

/** A template body is treated as a statutory HTML form when it starts with a tag. */
export function isHtmlBody(body: string | null | undefined): boolean {
  return !!body && /^\s*</.test(body);
}

/** A4 at 96dpi. Used identically for on-screen preview and the printed PDF. */
export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;

/**
 * Scoped stylesheet for statutory forms. Preview and PDF share this exact CSS,
 * so what the user sees on screen is what gets printed — inch for inch.
 */
export const DOCUMENT_PAGE_CSS = `
.govdoc { width: ${A4_WIDTH_PX}px; min-height: ${A4_HEIGHT_PX}px; box-sizing: border-box;
  padding: 38px 48px 42px; background: #fff; color: #000;
  font-family: "Times New Roman", Times, serif; font-size: 14px; line-height: 1.18; }
.govdoc * { box-sizing: border-box; }
.govdoc .gazette-head { display: grid; grid-template-columns: 56px 1fr 176px; align-items: end;
  font-size: 15px; line-height: 1; margin-bottom: 4px; }
.govdoc .gazette-head span:nth-child(2) { text-align: center; font-weight: 700; }
.govdoc .gazette-head span:nth-child(3) { text-align: right; }
.govdoc .gazette-rule { height: 5px; border-top: 1px solid #000; border-bottom: 2px double #000; margin-bottom: 22px; }
.govdoc .doc-title { text-align: center; font-weight: 700; font-size: 15px; line-height: 1; letter-spacing: 0; }
.govdoc .doc-rule { text-align: center; font-weight: 700; font-size: 14px; line-height: 1; margin-top: 20px; }
.govdoc .doc-sub { text-align: center; font-weight: 400; font-size: 15px; line-height: 1; margin-top: 20px; letter-spacing: 0; }
.govdoc .gov-fields { margin-top: 26px; font-weight: 400; }
.govdoc .gov-fields div { min-height: 19px; }
.govdoc .field-fill { font-weight: 400; }
.govdoc .address-lines { margin-top: 1px; }
.govdoc .address-lines div { min-height: 19px; }
.govdoc .nomination-text { width: 660px; margin: 12px 0 6px; text-align: justify; text-indent: 58px; }
.govdoc p { margin: 8px 0; text-align: justify; }
.govdoc table { border-collapse: collapse; }
.govdoc table, .govdoc th, .govdoc td { border: 2px solid #222; }
.govdoc th, .govdoc td { padding: 2px 3px; font-size: 14px; line-height: 1.05; vertical-align: top; }
.govdoc th { font-weight: 700; text-align: left; background: transparent; }
.govdoc .nomination-table { width: 660px; margin-top: 12px; table-layout: fixed; }
.govdoc .nomination-table th { height: 132px; vertical-align: top; font-weight: 400; }
.govdoc .nomination-table .col-1 { width: 120px; }
.govdoc .nomination-table .col-2 { width: 62px; }
.govdoc .nomination-table .col-3 { width: 109px; }
.govdoc .nomination-table .col-4 { width: 40px; }
.govdoc .nomination-table .col-5 { width: 146px; }
.govdoc .nomination-table .col-6 { width: 183px; }
.govdoc .nomination-table tfoot td { height: 18px; padding: 1px 3px; text-align: center; font-weight: 400; }
.govdoc .nominee-entry { display: block; min-height: 15px; font-weight: 400; }
.govdoc .nominee-detail-title { width: 660px; margin-top: 12px; font-weight: 700; font-size: 13px; }
.govdoc .nominee-detail-table { width: 660px; margin-top: 5px; table-layout: fixed; }
.govdoc .nominee-detail-table th, .govdoc .nominee-detail-table td {
  border: 1px solid #222; padding: 3px 4px; font-size: 11.5px; line-height: 1.2; vertical-align: top; }
.govdoc .nominee-detail-table th { font-weight: 700; text-align: center; }
.govdoc .nominee-detail-table td { text-align: left; word-wrap: break-word; }
.govdoc .nominee-detail-table .d-sr { width: 30px; text-align: center; }
.govdoc .nominee-detail-table .d-1 { width: 118px; }
.govdoc .nominee-detail-table .d-2 { width: 138px; }
.govdoc .nominee-detail-table .d-3 { width: 78px; }
.govdoc .nominee-detail-table .d-4 { width: 78px; text-align: center; }
.govdoc .nominee-detail-table .d-5 { width: 48px; text-align: center; }
.govdoc .nominee-detail-table td.d-4, .govdoc .nominee-detail-table td.d-5 { text-align: center; }
.govdoc .nominee-detail-table .d-6 { width: 170px; }
.govdoc .cert-list { width: 660px; margin-top: 12px; font-weight: 400; font-size: 14px; }
.govdoc .cert-list div { margin: 0; }
.govdoc .employee-sign { width: 660px; margin-top: 16px; text-align: right; font-weight: 400; }
.govdoc .employer-cert-title { margin-top: 16px; width: 660px; text-align: center; font-weight: 400; }
.govdoc .employer-cert-copy { width: 660px; margin-top: 16px; text-align: justify; text-indent: 58px; font-weight: 400; }
.govdoc .employer-sign { width: 660px; margin-top: 18px; font-weight: 400; }
.govdoc .place-date { width: 660px; margin-top: 18px; font-weight: 400; }
.govdoc .place-date div { margin-top: 14px; }
.govdoc .stamp-line { width: 660px; margin-top: 22px; text-align: right; font-weight: 400; }
.govdoc .plain, .govdoc .plain td, .govdoc .plain th { border: none; padding: 2px 0; }
.govdoc .sec { font-weight: 700; text-decoration: underline; margin-top: 14px; font-size: 12.5px; }
.govdoc .sign-row { display: flex; justify-content: space-between; margin-top: 34px; gap: 24px; }
.govdoc .sign-box { flex: 1; text-align: center; }
.govdoc .sign-line { border-top: 1px solid #000; margin-top: 46px; padding-top: 4px; font-size: 11.5px; }
.govdoc .small { font-size: 11px; }
`;

/** Escape a value before injecting it into an HTML template. */
function esc(v: string): string {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function nomineeTableHtml(nominees: NomineeForRender[]): string {
  // Statutory table — kept exactly as the printed government form (blank ruled area).
  const mainTable = `<table class="nomination-table">
    <thead><tr>
      <th class="col-1">Name of<br/>nominee/nominees</th>
      <th class="col-2">Address</th>
      <th class="col-3">Nominee's<br/>relationship<br/>with the<br/>employee</th>
      <th class="col-4">Date<br/>of<br/>Birth</th>
      <th class="col-5">Total amount of share<br/>of accumulations in<br/>credit to be paid to<br/>each nominee</th>
      <th class="col-6">If the nominee is minor,<br/>name, relationship, and<br/>address of the guardian who<br/>may receive the amount<br/>during the minority of<br/>nominee</th>
    </tr></thead>
    <tfoot><tr><td>(1)</td><td>(2)</td><td>(3)</td><td>(4)</td><td>(5)</td><td>(6)</td></tr></tfoot>
  </table>`;

  const rows = (nominees.length ? nominees : []).map(
    (n, i) => `<tr>
      <td class="d-sr">${i + 1}</td>
      <td class="d-1">${esc(n.name) || "&nbsp;"}</td>
      <td class="d-2">${esc(n.address) || "&nbsp;"}</td>
      <td class="d-3">${esc(n.relation) || "&nbsp;"}</td>
      <td class="d-4">${n.dob ? esc(fmtDate(n.dob)) : "&nbsp;"}</td>
      <td class="d-5">${n.share || 0}%</td>
      <td class="d-6">${esc(n.guardian) || "&nbsp;"}</td>
    </tr>`,
  );
  while (rows.length < 2) {
    rows.push(
      `<tr><td class="d-sr">${rows.length + 1}</td><td class="d-1">&nbsp;</td><td class="d-2">&nbsp;</td><td class="d-3">&nbsp;</td><td class="d-4">&nbsp;</td><td class="d-5">&nbsp;</td><td class="d-6">&nbsp;</td></tr>`,
    );
  }

  const detailTable = `<div class="nominee-detail-title">Particulars of nominee(s) as recorded</div>
  <table class="nominee-detail-table">
    <thead><tr>
      <th class="d-sr">Sr.</th>
      <th class="d-1">Name of nominee</th>
      <th class="d-2">Address</th>
      <th class="d-3">Relationship</th>
      <th class="d-4">Date of Birth</th>
      <th class="d-5">Share</th>
      <th class="d-6">Guardian (if nominee is minor)</th>
    </tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;

  return `${mainTable}${detailTable}`;
}


export type EsicFamilyForRender = { name: string; relation: string; mobile: string; share: number };

/** compliance.esic_family = [{name, relation, mobile}] — shares are split equally. */
export function resolveEsicFamily(candidate: any): EsicFamilyForRender[] {
  const raw = candidate?.compliance?.esic_family;
  if (!Array.isArray(raw)) return [];
  const list = raw
    .map((m: any) => ({
      name: String(m?.name ?? "").trim(),
      relation: String(m?.relation ?? "").trim(),
      mobile: String(m?.mobile ?? "").trim(),
    }))
    .filter((m) => m.name || m.relation || m.mobile)
    .slice(0, 6);
  const n = list.length;
  if (!n) return [];
  const base = Math.floor(100 / n);
  let rem = 100 - base * n;
  return list.map((m, i) => {
    const extra = rem > 0 && i < rem ? 1 : 0;
    return { ...m, share: base + extra };
  });
}

function esicFamilyTableHtml(members: EsicFamilyForRender[]): string {
  const rows = members.map(
    (m, i) => `<tr><td class="num">${i + 1}</td><td>${esc(m.name) || "&nbsp;"}</td><td>${esc(m.relation) || "&nbsp;"}</td><td>${esc(m.mobile) || "&nbsp;"}</td><td class="num">${m.share}%</td></tr>`,
  );
  while (rows.length < 3) {
    rows.push(`<tr><td class="num">${rows.length + 1}</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`);
  }
  return `<table><thead><tr><th style="width:34px">Sl. No.</th><th>Name of family member</th><th>Relationship with the insured person</th><th>Mobile number</th><th style="width:70px">Share</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function esicFamilyTableText(members: EsicFamilyForRender[]): string {
  if (!members.length) return "(No family member recorded)";
  return members
    .map((m, i) => `${i + 1}. Name: ${m.name || "_______"} | Relationship: ${m.relation || "_______"} | Mobile: ${m.mobile || "_______"} | Share: ${m.share}%`)
    .join("\n");
}

/**
 * Build the exact HTML that both the preview and the PDF render.
 * The returned string is a full `.govdoc` page including the scoped stylesheet.
 */
export function buildDocumentPageHtml(body: string): string {
  return `<style>${DOCUMENT_PAGE_CSS}</style><div class="govdoc">${body}</div>`;
}

/**
 * Rasterise an HTML statutory form to a pixel-accurate A4 PDF.
 * Renders the same markup the preview shows, so layout cannot drift.
 */
export async function generateHtmlDocumentPdf(opts: {
  body: string;
  employeeSignatureDataUrl?: string;
  companySignatureDataUrl?: string;
}): Promise<Blob> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas-pro"),
  ]);

  const hasFixedSignatureLayout = /class=["'][^"']*\bform-vii-doc\b/.test(opts.body);
  const sigBlock =
    !hasFixedSignatureLayout && (opts.employeeSignatureDataUrl || opts.companySignatureDataUrl)
      ? `<div class="sign-row">
           <div class="sign-box">${opts.employeeSignatureDataUrl ? `<img src="${opts.employeeSignatureDataUrl}" style="height:52px;object-fit:contain" />` : ""}<div class="sign-line">Signature / Thumb impression of the employee</div></div>
           <div class="sign-box">${opts.companySignatureDataUrl ? `<img src="${opts.companySignatureDataUrl}" style="height:52px;object-fit:contain" />` : ""}<div class="sign-line">Signature of the Employer / Authorised Signatory</div></div>
         </div>`
      : "";

  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_WIDTH_PX}px;background:#fff;`;
  host.innerHTML = buildDocumentPageHtml(opts.body + sigBlock);
  const employeeSlot = host.querySelector('[data-signature-slot="employee"]');
  if (employeeSlot && opts.employeeSignatureDataUrl) {
    employeeSlot.innerHTML = `<img src="${opts.employeeSignatureDataUrl}" style="display:block;height:34px;object-fit:contain;margin:0 0 4px auto" />`;
  }
  const companySlot = host.querySelector('[data-signature-slot="company"]');
  if (companySlot && opts.companySignatureDataUrl) {
    companySlot.innerHTML = `<img src="${opts.companySignatureDataUrl}" style="display:block;height:34px;object-fit:contain;margin:0 auto 4px 0" />`;
  }
  document.body.appendChild(host);

  try {
    const target = host.querySelector(".govdoc") as HTMLElement;
    const canvas = await html2canvas(target, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;
    const img = canvas.toDataURL("image/png");
    let remaining = imgH;
    let offset = 0;
    while (remaining > 0) {
      doc.addImage(img, "PNG", 0, -offset, pageW, imgH);
      remaining -= pageH;
      offset += pageH;
      if (remaining > 0) doc.addPage();
    }
    return doc.output("blob");
  } finally {
    host.remove();
  }
}

