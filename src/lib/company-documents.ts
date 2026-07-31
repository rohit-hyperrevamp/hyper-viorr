import { supabase } from "@/integrations/supabase/client";

export type DocType = "nda" | "appointment_letter" | "form_vii" | "company_stamp" | "id_card";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  nda: "Non-Disclosure Agreement",
  appointment_letter: "Appointment Letter",
  form_vii: "Form VII — Nomination Form",
  company_stamp: "Company Stamp and Signatures",
  id_card: "ID Card",
};

export const DOC_TYPE_SHORT: Record<DocType, string> = {
  nda: "NDA",
  appointment_letter: "Appointment Letter",
  form_vii: "Form VII",
  company_stamp: "Stamp & Signatures",
  id_card: "ID Card",
};

/** CDN URL of the official company stamp (with authorised signature). */
export const COMPANY_STAMP_URL =
  "/__l5e/assets-v1/87ea9ec6-0ff1-4c65-8122-abc676b013d3/company-stamp.png";

/** CDN URL of the company logo used on the ID card (replaceable in the template). */
export const COMPANY_LOGO_URL =
  "/__l5e/assets-v1/20a50aa3-b6c2-4ed4-a3f3-7d4527ee1acd/radiant-logo.png";



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
  blood_group?: string;
  photo_url?: string;
};

/**
 * Assets are served from Lovable's CDN path. PDFs and previews on custom
 * domains need the absolute URL, so resolve it against the current origin.
 */
export const DOCUMENT_ASSET_ORIGIN = "https://radiant-guard-services.lovable.app";

export function absoluteAssetUrl(path: string): string {
  if (/^https?:/i.test(path)) return path;
  return `${DOCUMENT_ASSET_ORIGIN}${path}`;
}


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
  { key: "rank", label: "Rank / Designation (ID card)" },
  { key: "id_no", label: "I.D. No. (ID card)" },
  { key: "blood_group", label: "Blood Group (ID card)" },
  { key: "employee_photo", label: "Employee Photo URL (ID card)" },
  { key: "company_logo", label: "Company Logo URL (ID card)" },
  { key: "company_stamp", label: "Company Stamp URL" },

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
    rank: c.designation_name || "_______",
    id_no: c.employee_code || c.candidate_code || "_______",
    blood_group: c.blood_group || "—",
    employee_photo: c.photo_url || "",
    company_logo: absoluteAssetUrl(COMPANY_LOGO_URL),
    company_stamp: absoluteAssetUrl(COMPANY_STAMP_URL),

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
      "id,full_name,employee_code,candidate_code,email,mobile,aadhaar_number,date_of_birth,unit_id,designation_id,present_address1,present_address2,present_city,present_state,present_pincode,preferred_joining_date,gender,marital_status,other_info,physical_health,contacts,compliance,permanent_address1,permanent_address2,permanent_city,permanent_state,permanent_pincode,photo_url",
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
  const physical = (data as any).physical_health ?? {};
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
    blood_group: String(physical.blood_group ?? other.blood_group ?? ""),
    photo_url: ((data as any).photo_url as string) ?? "",
  };
}

/**
 * Attach the active Form VII template to a candidate as an employee-specific document.
 * The rendered copy carries the employee's onboarding signature and the company
 * stamp/authorised signature, so it is a complete signed record.
 * Idempotent: skips when a Form VII already exists for the candidate at that version,
 * unless `force` is set (used to regenerate after data changes).
 */
export async function ensureDocForCandidate(
  candidateId: string,
  docType: Extract<DocType, "form_vii" | "id_card">,
  opts: { force?: boolean } = {},
): Promise<"created" | "exists" | "no-template"> {
  const template = await fetchActiveTemplate(docType);
  if (!template) return "no-template";

  const { data: existing } = await supabase
    .from("employee_signed_documents")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("doc_type", docType)
    .eq("version", template.version)
    .maybeSingle();
  if (existing && !opts.force) return "exists";

  // Drop stale copies from older template versions (and the current one when
  // regenerating) so the employee always holds exactly one copy rendered
  // from the current master layout.
  let del = supabase
    .from("employee_signed_documents")
    .delete()
    .eq("candidate_id", candidateId)
    .eq("doc_type", docType);
  if (!opts.force) del = del.neq("version", template.version);
  await del;

  const candidate = await fetchCandidateForRender(candidateId);
  let rendered = renderTemplate(template.body, buildPlaceholderMap(candidate, isHtmlBody(template.body)));

  // ID cards are stored as a structured spec; bake the employee photo and the
  // company stamp into it so the rendered card never carries raw placeholders.
  if (docType === "id_card") {
    const spec = parseIdCardSpec(rendered);
    if (spec) {
      spec.front.photoUrl = candidate.photo_url || "";
      spec.front.stampUrl = absoluteAssetUrl(COMPANY_STAMP_URL);
      rendered = serializeIdCardSpec(spec);
    }
  }

  // Employee signature captured during onboarding + company stamp/signature.
  const { data: sigRow } = await supabase
    .from("candidates")
    .select("signature_url")
    .eq("id", candidateId)
    .maybeSingle();
  const employeeSignature = ((sigRow as any)?.signature_url as string) || "";

  const { error } = await supabase.from("employee_signed_documents").insert({
    candidate_id: candidateId,
    template_id: template.id,
    doc_type: docType,
    version: template.version,
    rendered_body: rendered,
    employee_signature_data: employeeSignature,
    company_signature_data: absoluteAssetUrl(COMPANY_STAMP_URL),
    signed_at: new Date().toISOString(),
  } as any);
  if (error) throw error;
  return "created";
}

export async function ensureFormViiForCandidate(
  candidateId: string,
  opts: { force?: boolean } = {},
): Promise<"created" | "exists" | "no-template"> {
  return ensureDocForCandidate(candidateId, "form_vii", opts);
}

export async function ensureIdCardForCandidate(
  candidateId: string,
  opts: { force?: boolean } = {},
): Promise<"created" | "exists" | "no-template"> {
  return ensureDocForCandidate(candidateId, "id_card", opts);
}


/**
 * Fire-and-forget wrapper used by every path that turns a candidate into an
 * employee (HR approval, rehire enablement, guard issuance acknowledgement).
 * Never throws — document generation must not block the activation itself.
 */
export function autoAttachFormVii(candidateId: string): void {
  if (!candidateId) return;
  void (async () => {
    try {
      await ensureFormViiForCandidate(candidateId);
    } catch (e) {
      console.error("Form VII auto-attach failed", candidateId, e);
    }
    try {
      await ensureIdCardForCandidate(candidateId);
    } catch (e) {
      console.error("ID card auto-attach failed", candidateId, e);
    }
  })();
}


/** Refresh Form VII and ID cards for every approved, active or inactive employee. */
export async function syncCompanyDocumentsForAllEmployees(): Promise<{
  created: number;
  skipped: number;
  failed: number;
}> {
  const { data: rows, error } = await supabase
    .from("candidates")
    .select("id,status")
    .in("status", ["approved", "active", "inactive"]);
  if (error) throw error;
  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of (rows ?? []) as { id: string }[]) {
    try {
      const [form, card] = await Promise.all([
        ensureFormViiForCandidate(r.id, { force: true }),
        ensureIdCardForCandidate(r.id, { force: true }),
      ]);
      created += Number(form === "created") + Number(card === "created");
      skipped += Number(form !== "created") + Number(card !== "created");
    } catch {
      failed += 1;
    }
  }
  return { created, skipped, failed };
}

/**
 * Inject signature images into a rendered statutory form's signature slots.
 * Works for both the on-screen preview and the printed PDF.
 */
export function injectSignatureImages(
  body: string,
  employeeSignatureUrl?: string,
  companySignatureUrl?: string,
): string {
  let out = body;
  if (employeeSignatureUrl) {
    out = out.replace(
      /(<span[^>]*data-signature-slot=["']employee["'][^>]*>)/,
      `$1<img class="sig-img sig-employee" src="${employeeSignatureUrl}" alt="Employee signature" />`,
    );
  }
  if (companySignatureUrl) {
    out = out.replace(
      /(<span[^>]*data-signature-slot=["']company["'][^>]*>)/,
      `$1<img class="sig-img sig-company" src="${companySignatureUrl}" alt="Company stamp and authorised signature" />`,
    );
  }
  return out;
}

/** Convert an image URL into a data URL so jsPDF/html2canvas can rasterise it. */
export async function resolveImageDataUrl(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
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
  return !!body && (/^\s*</.test(body) || isIdCardBody(body));
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
.govdoc .nomination-text { width: 698px; margin: 12px 0 6px; text-align: justify; text-indent: 58px; }
.govdoc p { margin: 8px 0; text-align: justify; }
.govdoc table { border-collapse: collapse; }
.govdoc table, .govdoc th, .govdoc td { border: 2px solid #222; }
.govdoc th, .govdoc td { padding: 2px 3px; font-size: 14px; line-height: 1.05; vertical-align: top; }
.govdoc th { font-weight: 700; text-align: left; background: transparent; }
.govdoc .nomination-table { width: 698px; margin-top: 12px; table-layout: fixed; }
.govdoc .nomination-table th { height: 132px; vertical-align: top; font-weight: 400;
  font-size: 10.5px; line-height: 1.15; letter-spacing: 0; text-transform: none;
  font-variant: normal; overflow-wrap: break-word; word-break: break-word; hyphens: auto;
  overflow: hidden; white-space: normal; }
.govdoc .nomination-table .col-1 { width: 120px; }
.govdoc .nomination-table .col-2 { width: 62px; }
.govdoc .nomination-table .col-3 { width: 109px; }
.govdoc .nomination-table .col-4 { width: 40px; }
.govdoc .nomination-table .col-5 { width: 146px; }
.govdoc .nomination-table .col-6 { width: 221px; }
.govdoc .nomination-table tfoot td { height: 18px; padding: 1px 3px; text-align: center; font-weight: 400; }
.govdoc .nominee-entry { display: block; min-height: 15px; font-weight: 400; }
.govdoc .nominee-detail-title { width: 698px; margin-top: 12px; font-weight: 700; font-size: 13px; }
.govdoc .nominee-detail-table { width: 698px; margin-top: 5px; table-layout: fixed; }
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
.govdoc .nominee-detail-table .d-6 { width: 208px; }
.govdoc .nominee-detail-table.dense th, .govdoc .nominee-detail-table.dense td {
  font-size: 10px; padding: 1px 3px; line-height: 1.15; }
.govdoc .cert-list { width: 698px; margin-top: 12px; font-weight: 400; font-size: 14px; }
.govdoc .cert-list div { margin: 0; }
.govdoc .employee-sign { width: 698px; margin-top: 16px; text-align: right; font-weight: 400; }
.govdoc .employer-cert-title { margin-top: 16px; width: 698px; text-align: center; font-weight: 400; }
.govdoc .employer-cert-copy { width: 698px; margin-top: 16px; text-align: justify; text-indent: 58px; font-weight: 400; }
.govdoc .employer-sign { width: 698px; margin-top: 18px; font-weight: 400; }
.govdoc .place-date { width: 698px; margin-top: 18px; font-weight: 400; }
.govdoc .place-date div { margin-top: 14px; }
.govdoc .stamp-line { width: 698px; margin-top: 22px; text-align: right; font-weight: 400; }
.govdoc .plain, .govdoc .plain td, .govdoc .plain th { border: none; padding: 2px 0; }
.govdoc .sec { font-weight: 700; text-decoration: underline; margin-top: 14px; font-size: 12.5px; }
.govdoc .sign-row { display: flex; justify-content: space-between; margin-top: 34px; gap: 24px; }
.govdoc .sign-box { flex: 1; text-align: center; }
.govdoc .sign-line { border-top: 1px solid #000; margin-top: 46px; padding-top: 4px; font-size: 11.5px; }
.govdoc .small { font-size: 11px; }
.govdoc .sig-img { display: block; height: 26px; width: auto; max-width: 150px; object-fit: contain; margin: 0 0 2px auto; }
.govdoc .employer-sign .sig-img { height: 64px; max-width: 150px; margin: 0 auto 2px 0; }
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

  if (!nominees.length) return mainTable;

  const dense = nominees.length > 2 ? " dense" : "";
  const detailTable = `<div class="nominee-detail-title">Particulars of nominee(s) as recorded</div>
  <table class="nominee-detail-table${dense}">
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

/** Sample candidate used to preview a template with realistic data (Control Center). */
export function previewPlaceholderMap(html: boolean): Record<string, string> {
  return buildPlaceholderMap(
    {
      id: "preview",
      full_name: "SAMPLE EMPLOYEE NAME",
      employee_code: "EMP-000",
      candidate_code: "CAN-000",
      email: "sample@example.com",
      mobile: "9000000000",
      aadhaar_number: "0000 0000 0000",
      date_of_birth: "1995-01-01",
      designation_name: "Security Guard",
      unit_name: "Radiant Guards - Pune Office",
      unit_city: "Pune",
      unit_id: null,
      designation_id: null,
      present_address1: "Sample Address Line 1",
      present_address2: "",
      present_city: "Pune",
      present_state: "Maharashtra",
      present_pincode: "411001",
      preferred_joining_date: new Date().toISOString(),
      gender: "Male",
      marital_status: "Married",
      father_or_spouse_name: "SAMPLE FATHER NAME",
      permanent_address: "Sample Permanent Address, Pune, Maharashtra 411001",
      nominees: [],
      esic_family: [],
      blood_group: "AB+",
      photo_url: "",

    },
    html,
  );
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
  if (isIdCardBody(body)) {
    return `<style>${ID_CARD_CSS}</style>${expandIdCardBody(body)}`;
  }
  return `<style>${DOCUMENT_PAGE_CSS}</style><div class="govdoc">${body}</div>`;
}

/* ------------------------------------------------------------------ */
/* ID card (CR80 portrait — 5.4cm x 8.56cm)                            */
/* ------------------------------------------------------------------ */

/** 5.4cm x 8.56cm at 96dpi. */
export const ID_CARD_WIDTH_PX = 204;
export const ID_CARD_HEIGHT_PX = 324;

export function isIdCardBody(body: string | null | undefined): boolean {
  if (!body) return false;
  if (/idcard-sheet/.test(body)) return true;
  return !!parseIdCardSpec(body);
}

export const ID_CARD_CSS = `
.idcard-sheet { display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-start;
  font-family: Arial, Helvetica, sans-serif; background: transparent; }
.idcard-sheet * { box-sizing: border-box; }
.idcard-face { width: ${ID_CARD_WIDTH_PX}px; }
.idcard-face > .idcard-caption { font-size: 9px; letter-spacing: .14em; text-transform: uppercase;
  color: #6b7280; margin-bottom: 5px; text-align: center; font-weight: 700; }
.idcard { width: ${ID_CARD_WIDTH_PX}px; height: ${ID_CARD_HEIGHT_PX}px; position: relative; overflow: hidden;
  border-radius: 9px; padding: 10px 12px; color: #111;
  background: linear-gradient(160deg,#f4f6f9 0%,#e7ecf3 42%,#dfe6ef 68%,#eef1f6 100%);
  box-shadow: 0 1px 2px rgba(0,0,0,.18); }
.idcard .wm { position: absolute; inset: 0; opacity: .06; background-repeat: repeat;
  background-size: 62px 62px; pointer-events: none; }
.idcard .body { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; }
.idcard .logo { display: block; margin: 2px auto 0; height: 52px; width: auto; object-fit: contain; }
.idcard .company { text-align: center; font-weight: 700; font-size: 11px; letter-spacing: -.2px; margin-top: 6px; }
.idcard .photo-wrap { position: relative; width: 78px; height: 88px; margin: 8px auto 0;
  border-radius: 8px; background: #d7dde6; border: 1px solid #b9c2cd; }
.idcard .photo { width: 100%; height: 100%; border-radius: 8px; object-fit: cover; display: block; }
.idcard .photo-ph { width: 78px; height: 88px; border-radius: 8px; display: flex; align-items: center;
  justify-content: center; background: #d7dde6; border: 1px solid #b9c2cd; font-size: 8px; color: #6b7280; }
/* Stamp sits low on the photo's left edge so the face stays fully readable. */
.idcard .photo-stamp { position: absolute !important; left: -16px !important; bottom: -8px !important;
  height: 42px !important; width: auto !important; max-width: none !important;
  opacity: .45 !important; z-index: 3; pointer-events: none; }
.idcard .rows { margin-top: 10px; font-size: 10px; line-height: 1.42; }
.idcard .row { display: flex; }
.idcard .row .k { width: 56px; font-weight: 700; flex: 0 0 56px; }
.idcard .row .c { width: 8px; flex: 0 0 8px; }
.idcard .row .v { flex: 1; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.idcard .auth { margin-top: auto; text-align: right; padding-bottom: 4px; }
.idcard .sig-slot { display: block; min-height: 30px; }
/* Any signature/stamp image on the card is hard-capped so it can never bleed
   past the card edge, whichever slot it was injected into. !important is
   required: the global img sizing rule in styles.css outranks plain selectors. */
.idcard .sig-img,
.idcard .auth .sig-img,
.idcard .auth .sig-company,
.idcard .sig-slot img,
.idcard .auth img { display: block !important; height: 30px !important; width: auto !important;
  max-width: 72px !important; object-fit: contain !important; margin: 0 0 2px auto !important; }
.idcard .auth .sig-line { border-top: 1px solid #111; width: 72px; margin-left: auto; }

.idcard .auth .auth-label { font-size: 9px; font-weight: 700; margin-top: 2px; }

.idcard .back-title { text-align: center; font-weight: 700; font-size: 10.5px; margin-top: 14px; }
.idcard .back-block { text-align: center; font-size: 10px; font-weight: 700; line-height: 1.45; margin-top: 6px; }
.idcard .back-contact { text-align: center; font-size: 10px; line-height: 1.7; margin-top: 14px; }
.idcard .back-validity { text-align: center; font-size: 8.5px; margin-top: 14px; }
`;

/** Default editable master template for the employee ID card (front + back). */
export const DEFAULT_ID_CARD_TEMPLATE = `<div class="idcard-sheet">
  <div class="idcard-face">
    <div class="idcard-caption">Front</div>
    <div class="idcard idcard-front">
      <div class="wm" style="background-image:url('$company_logo')"></div>
      <div class="body">
        <img class="logo" src="$company_logo" alt="Company logo" />
        <div class="company">$company_name</div>
        <div class="photo-wrap">
          <img class="photo" src="$employee_photo" alt="Employee photo" onerror="this.style.visibility='hidden'" />
          <img class="photo-stamp" src="$company_stamp" alt="Company stamp" />
        </div>
        <div class="rows">
          <div class="row"><span class="k">Name</span><span class="c">:</span><span class="v">$employee_name</span></div>
          <div class="row"><span class="k">Rank</span><span class="c">:</span><span class="v">$rank</span></div>
          <div class="row"><span class="k">I. D. No.</span><span class="c">:</span><span class="v">$id_no</span></div>
          <div class="row"><span class="k">BG</span><span class="c">:</span><span class="v">$blood_group</span></div>
          <div class="row"><span class="k">DOJ</span><span class="c">:</span><span class="v">$joining_date</span></div>
        </div>
        <div class="auth">
          <span class="sig-slot" data-signature-slot="company"></span>
          <div class="sig-line"></div>
          <div class="auth-label">Issuing Authority</div>
        </div>
      </div>
    </div>
  </div>

  <div class="idcard-face">
    <div class="idcard-caption">Back</div>
    <div class="idcard idcard-back">
      <div class="wm" style="background-image:url('$company_logo')"></div>
      <div class="body">
        <img class="logo" style="height:64px;margin-top:12px" src="$company_logo" alt="Company logo" />
        <div class="company" style="margin-top:10px">$company_name</div>
        <div class="back-title">Corporate Office :</div>
        <div class="back-block">818, Clover Hills Plaza<br/>NIBM Road, Kondhwa<br/>Pune - 411048</div>
        <div class="back-contact">Ph. No. - 020 48622515<br/>Mob.No. : 09156453001</div>
        <div class="back-validity">Validity : 1 Year from date of Issue</div>
      </div>
    </div>
  </div>
</div>`;

/* ------------------------------------------------------------------ */
/* ID card structured spec (form-editable)                             */
/* ------------------------------------------------------------------ */

export type IdCardField = { label: string; value: string };

export type IdCardSpec = {
  kind: "id_card";
  logoUrl: string;
  frontLogoHeight: number;
  backLogoHeight: number;
  front: {
    companyName: string;
    showPhoto: boolean;
    showPhotoStamp: boolean;
    /** Resolved at generation time from the candidate's profile photo. */
    photoUrl?: string;
    /** Resolved at generation time from the company stamp asset. */
    stampUrl?: string;
    fields: IdCardField[];
    authorityLabel: string;
    showAuthoritySignature: boolean;
  };
  back: {
    companyName: string;
    addressTitle: string;
    addressLines: string[];
    contactLines: string[];
    validityLine: string;
  };
};

export const DEFAULT_ID_CARD_SPEC: IdCardSpec = {
  kind: "id_card",
  logoUrl: COMPANY_LOGO_URL,
  frontLogoHeight: 52,
  backLogoHeight: 64,
  front: {
    companyName: "Radiant Guard Services Pvt.Ltd.",
    showPhoto: true,
    showPhotoStamp: true,
    fields: [
      { label: "Name", value: "$employee_name" },
      { label: "Rank", value: "$rank" },
      { label: "I. D. No.", value: "$id_no" },
      { label: "BG", value: "$blood_group" },
      { label: "DOJ", value: "$joining_date" },
    ],
    authorityLabel: "Issuing Authority",
    showAuthoritySignature: true,
  },
  back: {
    companyName: "Radiant Guard Services Pvt.Ltd.",
    addressTitle: "Corporate Office :",
    addressLines: ["818, Clover Hills Plaza", "NIBM Road, Kondhwa", "Pune - 411048"],
    contactLines: ["Ph. No. - 020 48622515", "Mob.No. : 09156453001"],
    validityLine: "Validity : 1 Year from date of Issue",
  },
};

/** Parses a stored ID card body as a structured spec, or returns null for HTML bodies. */
export function parseIdCardSpec(body: string | null | undefined): IdCardSpec | null {
  if (!body || !/^\s*\{/.test(body)) return null;
  try {
    const raw = JSON.parse(body) as Partial<IdCardSpec>;
    if (raw?.kind !== "id_card") return null;
    const d = DEFAULT_ID_CARD_SPEC;
    return {
      kind: "id_card",
      logoUrl: raw.logoUrl || d.logoUrl,
      frontLogoHeight: Number(raw.frontLogoHeight) || d.frontLogoHeight,
      backLogoHeight: Number(raw.backLogoHeight) || d.backLogoHeight,
      front: {
        companyName: raw.front?.companyName ?? d.front.companyName,
        showPhoto: raw.front?.showPhoto ?? true,
        showPhotoStamp: raw.front?.showPhotoStamp ?? true,
        photoUrl: raw.front?.photoUrl,
        stampUrl: raw.front?.stampUrl,
        fields: Array.isArray(raw.front?.fields) && raw.front!.fields.length
          ? raw.front!.fields.map((f) => ({ label: String(f?.label ?? ""), value: String(f?.value ?? "") }))
          : d.front.fields,
        authorityLabel: raw.front?.authorityLabel ?? d.front.authorityLabel,
        showAuthoritySignature: raw.front?.showAuthoritySignature ?? true,
      },
      back: {
        companyName: raw.back?.companyName ?? d.back.companyName,
        addressTitle: raw.back?.addressTitle ?? d.back.addressTitle,
        addressLines: Array.isArray(raw.back?.addressLines) ? raw.back!.addressLines.map(String) : d.back.addressLines,
        contactLines: Array.isArray(raw.back?.contactLines) ? raw.back!.contactLines.map(String) : d.back.contactLines,
        validityLine: raw.back?.validityLine ?? d.back.validityLine,
      },
    };
  } catch {
    return null;
  }
}

export function serializeIdCardSpec(spec: IdCardSpec): string {
  return JSON.stringify(spec, null, 2);
}

/** Builds the ID card markup (with $placeholders intact) from a structured spec. */
export function renderIdCardHtml(spec: IdCardSpec): string {
  const logo = absoluteAssetUrl(spec.logoUrl);
  const rows = spec.front.fields
    .map(
      (f) =>
        `<div class="row"><span class="k">${esc(f.label)}</span><span class="c">:</span><span class="v">${esc(
          f.value,
        )}</span></div>`,
    )
    .join("\n          ");

  const isReal = (u?: string) => !!u && !u.startsWith("$") && u.trim() !== "";
  const photoSrc = isReal(spec.front.photoUrl) ? absoluteAssetUrl(spec.front.photoUrl!) : "";
  const stampSrc = isReal(spec.front.stampUrl)
    ? absoluteAssetUrl(spec.front.stampUrl!)
    : absoluteAssetUrl(COMPANY_STAMP_URL);

  const photo = spec.front.showPhoto
    ? `<div class="photo-wrap">
          ${photoSrc ? `<img class="photo" src="${photoSrc}" alt="Employee photo" onerror="this.style.visibility='hidden'" />` : `<div class="photo-ph"></div>`}
          ${spec.front.showPhotoStamp ? `<img class="photo-stamp" src="${stampSrc}" alt="Company stamp" />` : ""}
        </div>`
    : "";

  const auth = `<div class="auth">
          ${spec.front.showAuthoritySignature ? `<span class="sig-slot" data-signature-slot="company"></span>` : ""}
          <div class="sig-line"></div>
          <div class="auth-label">${esc(spec.front.authorityLabel)}</div>
        </div>`;

  return `<div class="idcard-sheet">
  <div class="idcard-face">
    <div class="idcard-caption">Front</div>
    <div class="idcard idcard-front">
      <div class="wm" style="background-image:url('${logo}')"></div>
      <div class="body">
        <img class="logo" style="height:${spec.frontLogoHeight}px" src="${logo}" alt="Company logo" />
        <div class="company">${esc(spec.front.companyName)}</div>
        ${photo}
        <div class="rows">
          ${rows}
        </div>
        ${auth}
      </div>
    </div>
  </div>

  <div class="idcard-face">
    <div class="idcard-caption">Back</div>
    <div class="idcard idcard-back">
      <div class="wm" style="background-image:url('${logo}')"></div>
      <div class="body">
        <img class="logo" style="height:${spec.backLogoHeight}px;margin-top:12px" src="${logo}" alt="Company logo" />
        <div class="company" style="margin-top:10px">${esc(spec.back.companyName)}</div>
        <div class="back-title">${esc(spec.back.addressTitle)}</div>
        <div class="back-block">${spec.back.addressLines.map(esc).join("<br/>")}</div>
        <div class="back-contact">${spec.back.contactLines.map(esc).join("<br/>")}</div>
        <div class="back-validity">${esc(spec.back.validityLine)}</div>
      </div>
    </div>
  </div>
</div>`;
}

/** Expands a structured ID card body into renderable HTML; passes other bodies through. */
export function expandIdCardBody(body: string): string {
  const spec = parseIdCardSpec(body);
  return spec ? renderIdCardHtml(spec) : body;
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

  if (isIdCardBody(opts.body)) {
    const compSigCard = await resolveImageDataUrl(opts.companySignatureDataUrl ?? absoluteAssetUrl(COMPANY_STAMP_URL));
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff;";
    host.innerHTML = buildDocumentPageHtml(
      injectSignatureImages(expandIdCardBody(opts.body), undefined, compSigCard),
    );
    document.body.appendChild(host);
    try {
      const faces = Array.from(host.querySelectorAll(".idcard")) as HTMLElement[];
      const doc = new jsPDF({ unit: "mm", format: [54, 85.6] });
      for (let i = 0; i < faces.length; i += 1) {
        const canvas = await html2canvas(faces[i], { scale: 4, backgroundColor: "#ffffff", useCORS: true });
        if (i > 0) doc.addPage([54, 85.6], "portrait");
        doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 54, 85.6);
      }
      return doc.output("blob");
    } finally {
      host.remove();
    }
  }



  const hasFixedSignatureLayout = /class=["'][^"']*\bform-vii-doc\b/.test(opts.body);
  const [empSig, compSig] = await Promise.all([
    resolveImageDataUrl(opts.employeeSignatureDataUrl),
    resolveImageDataUrl(opts.companySignatureDataUrl),
  ]);
  const sigBlock =
    !hasFixedSignatureLayout && (empSig || compSig)
      ? `<div class="sign-row">
           <div class="sign-box">${empSig ? `<img src="${empSig}" style="height:52px;object-fit:contain" />` : ""}<div class="sign-line">Signature / Thumb impression of the employee</div></div>
           <div class="sign-box">${compSig ? `<img src="${compSig}" style="height:52px;object-fit:contain" />` : ""}<div class="sign-line">Signature of the Employer / Authorised Signatory</div></div>
         </div>`
      : "";

  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_WIDTH_PX}px;background:#fff;`;
  host.innerHTML = buildDocumentPageHtml(injectSignatureImages(opts.body, empSig, compSig) + sigBlock);
  document.body.appendChild(host);


  try {
    const target = host.querySelector(".govdoc") as HTMLElement;
    const canvas = await html2canvas(target, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;
    const img = canvas.toDataURL("image/png");
    // Statutory forms must stay on a single A4 sheet. If the rendered content is
    // marginally taller (e.g. many nominees), scale it down to fit instead of
    // spilling a near-empty second page.
    if (imgH <= pageH * 1.35) {
      const scale = Math.min(1, pageH / imgH);
      const w = pageW * scale;
      const h = imgH * scale;
      doc.addImage(img, "PNG", (pageW - w) / 2, 0, w, h);
    } else {
      let remaining = imgH;
      let offset = 0;
      while (remaining > 0) {
        doc.addImage(img, "PNG", 0, -offset, pageW, imgH);
        remaining -= pageH;
        offset += pageH;
        if (remaining > 0) doc.addPage();
      }
    }

    return doc.output("blob");
  } finally {
    host.remove();
  }
}

