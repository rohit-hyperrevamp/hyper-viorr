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

export function buildPlaceholderMap(c: CandidateForRender): Record<string, string> {
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
    nominee_table: nomineeTable(c.nominees ?? []),
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

export async function fetchCandidateForRender(id: string): Promise<CandidateForRender> {
  const { data, error } = await supabase
    .from("candidates")
    .select(
      "id,full_name,employee_code,candidate_code,email,mobile,aadhaar_number,date_of_birth,unit_id,designation_id,present_address1,present_address2,present_city,present_state,present_pincode,preferred_joining_date",
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
  };
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
