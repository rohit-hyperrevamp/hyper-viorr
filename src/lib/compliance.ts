import { supabase } from "@/integrations/supabase/client";

/**
 * Compliance engine.
 *
 * A single place that sweeps every operating domain — organizations, contracts,
 * employees, attendance, uniform, vehicles, assets, payroll, invoice and the
 * control center — and returns a flat list of exceptions ("anything red").
 * The Compliance page renders, scores and filters this list; nothing here is
 * hardcoded UI, so new checks can be added without touching the page.
 */

export type Severity = "critical" | "high" | "medium" | "low";

export type DomainKey =
  | "organizations"
  | "contracts"
  | "employees"
  | "attendance"
  | "uniform"
  | "vehicles"
  | "assets"
  | "payroll"
  | "invoice"
  | "control_center";

export type ComplianceIssue = {
  id: string;
  domain: DomainKey;
  check: string;
  severity: Severity;
  subject: string;
  detail: string;
  dueDate?: string | null;
  daysLeft?: number | null;
  href?: string;
};

export const DOMAIN_META: Record<DomainKey, { label: string; href: string }> = {
  organizations: { label: "Organizations", href: "/admin/customers" },
  contracts: { label: "Contracts", href: "/admin/contracts/client-contracts" },
  employees: { label: "Employees", href: "/admin/employees" },
  attendance: { label: "Attendance", href: "/admin/attendance" },
  uniform: { label: "Uniform", href: "/admin/inventory" },
  vehicles: { label: "Vehicles", href: "/admin/vehicles/inventory" },
  assets: { label: "Assets", href: "/admin/assets/inventory" },
  payroll: { label: "Payroll", href: "/admin/payroll" },
  invoice: { label: "Invoice", href: "/admin/invoice" },
  control_center: { label: "Control Center", href: "/admin/control-center" },
};

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 8,
  high: 4,
  medium: 2,
  low: 1,
};

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(String(date).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - today().getTime()) / 86400000);
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function expirySeverity(days: number | null): Severity | null {
  if (days == null) return null;
  if (days < 0) return "critical";
  if (days <= 15) return "high";
  if (days <= 45) return "medium";
  if (days <= 90) return "low";
  return null;
}

function age(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(String(dob).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000));
}

const vehicleName = (v: unknown) => {
  const rec = (Array.isArray(v) ? v[0] : v) as { vehicle_number?: string | null; name?: string | null } | null;
  return rec?.vehicle_number || rec?.name || "Vehicle";
};

type Row = Record<string, unknown>;
const rows = (res: { data: unknown }) => ((res.data ?? []) as Row[]);
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

export async function fetchComplianceIssues(): Promise<ComplianceIssue[]> {
  const t = today();
  const todayIso = iso(t);
  const monthStart = iso(new Date(t.getFullYear(), t.getMonth(), 1));

  const [
    unitsR,
    customersR,
    contractsR,
    candidatesR,
    entriesR,
    codesR,
    sheetsR,
    runsR,
    issuancesR,
    stockR,
    vehiclesR,
    pucsR,
    insR,
    tagsR,
    propsR,
    loansR,
    dayBasesR,
    orgR,
  ] = await Promise.all([
    supabase.from("units").select("id, code, name, status, customer_id, branch_id, gst_number, latitude, longitude, contract_end_date, emergency_contact_mobile, uniform_included, uniform_fee_amount"),
    supabase.from("customers").select("id, code, name, status, billing_email, billing_phone, contract_end_date"),
    supabase.from("client_contracts").select("id, contract_code, unit_id, status, approval_status, record_type, start_date, end_date, expiry_date"),
    supabase.from("candidates").select("id, full_name, employee_code, status, is_enabled, is_disabled, role_key, non_billable, unit_id, date_of_birth, aadhaar_number, pan_number, bank_account_number, email, offboarded_at, esic_card_url"),
    supabase.from("attendance_entries").select("candidate_id, unit_id, code").eq("entry_date", todayIso),
    supabase.from("attendance_codes").select("code, label, counts_as_present, enabled"),
    supabase.from("attendance_sheets").select("id, unit_id, status, period_start, period_end").gte("period_start", monthStart),
    supabase.from("payroll_runs").select("id, unit_id, status, payroll_status, invoice_status, period_start, period_end").gte("period_start", monthStart),
    supabase.from("inv_issuances").select("id, issuance_number, status, issuance_date, acknowledged_at, destination_type"),
    supabase.from("inv_stock_balances").select("id, qty, item_id, size_value, location_type, location_id, inv_items(name, code)"),
    supabase.from("vehicles").select("id, vehicle_number, name, enabled"),
    supabase.from("vehicle_pucs").select("id, vehicle_id, expiry_date, puc_number, enabled").eq("enabled", true),
    supabase.from("vehicle_insurances").select("id, vehicle_id, end_date, policy_number, insurance_company, enabled").eq("enabled", true),
    supabase.from("vehicle_fastags").select("id, vehicle_id, expiry_date, fastag_number, bank_name, enabled").eq("enabled", true),
    supabase.from("properties").select("id, name, house_number, enabled, property_tax_id, current_value"),
    supabase.from("property_loans").select("id, property_id, lender_name, loan_account_number, status, end_date, outstanding_amount, enabled"),
    supabase.from("payroll_day_bases").select("id, name, enabled").eq("enabled", true),
    supabase.from("org_settings").select("*").limit(1),
  ]);

  const out: ComplianceIssue[] = [];
  const push = (i: ComplianceIssue) => out.push(i);

  /* ---------------------------------------------------------- organizations */
  const unitRows = rows(unitsR);
  const activeUnits = unitRows.filter((u) => str(u.status).toLowerCase() === "active");
  for (const u of activeUnits) {
    const label = str(u.name) || str(u.code) || "Unit";
    if (!str(u.gst_number)) {
      push({ id: `unit-gst-${u.id}`, domain: "organizations", check: "Unit GST missing", severity: "high", subject: label, detail: "No GST number on the unit — invoices for this site cannot be tax-compliant.", href: "/admin/customers/unit-manager" });
    }
    if (u.latitude == null || u.longitude == null) {
      push({ id: `unit-geo-${u.id}`, domain: "organizations", check: "Geo-fence not set", severity: "medium", subject: label, detail: "No latitude/longitude — guard self-attendance proximity checks cannot run at this site.", href: "/admin/customers/unit-manager" });
    }
    if (!str(u.emergency_contact_mobile)) {
      push({ id: `unit-emg-${u.id}`, domain: "organizations", check: "Emergency contact missing", severity: "low", subject: label, detail: "No site emergency contact number recorded.", href: "/admin/customers/unit-manager" });
    }
    if (!u.customer_id) {
      push({ id: `unit-cust-${u.id}`, domain: "organizations", check: "Unit not linked to client", severity: "critical", subject: label, detail: "Unit has no parent organization — billing and reporting will exclude it.", href: "/admin/customers/unit-manager" });
    }
    const d = daysUntil(str(u.contract_end_date) || null);
    const sev = expirySeverity(d);
    if (sev) {
      push({ id: `unit-end-${u.id}`, domain: "organizations", check: "Site agreement expiry", severity: sev, subject: label, detail: d! < 0 ? `Agreement ended ${Math.abs(d!)} days ago.` : `Agreement ends in ${d} days.`, dueDate: str(u.contract_end_date), daysLeft: d, href: "/admin/customers/unit-manager" });
    }
  }
  for (const c of rows(customersR)) {
    if (str(c.status).toLowerCase() !== "active") continue;
    if (!str(c.billing_email)) {
      push({ id: `cust-mail-${c.id}`, domain: "organizations", check: "Billing email missing", severity: "medium", subject: str(c.name) || str(c.code), detail: "Invoices cannot be dispatched automatically without a billing email.", href: "/admin/customers/customer-manager" });
    }
  }

  /* -------------------------------------------------------------- contracts */
  const contractRows = rows(contractsR).filter((c) => !c.record_type || str(c.record_type) === "contract");
  const unitsWithContract = new Set(contractRows.filter((c) => ["active", "approved"].includes(str(c.status).toLowerCase())).map((c) => str(c.unit_id)));
  for (const c of contractRows) {
    const status = str(c.status).toLowerCase();
    const label = str(c.contract_code) || "Contract";
    if (["lost"].includes(status)) continue;
    if (str(c.approval_status).toLowerCase() === "pending" || status === "pending approval") {
      push({ id: `con-appr-${c.id}`, domain: "contracts", check: "Awaiting approval", severity: "high", subject: label, detail: "Contract is pending approval — deployment and billing are blocked until it is signed off.", href: "/admin/contracts/client-contracts" });
    }
    const due = str(c.end_date) || str(c.expiry_date);
    const d = daysUntil(due || null);
    const sev = status === "expired" ? "critical" : expirySeverity(d);
    if (sev && due) {
      push({ id: `con-exp-${c.id}`, domain: "contracts", check: "Contract expiry", severity: sev, subject: label, detail: d != null && d < 0 ? `Expired ${Math.abs(d)} days ago — renew or mark lost.` : `Expires in ${d} days.`, dueDate: due, daysLeft: d, href: "/admin/contracts/client-contracts" });
    }
  }
  for (const u of activeUnits) {
    if (!unitsWithContract.has(str(u.id))) {
      push({ id: `unit-nocon-${u.id}`, domain: "contracts", check: "Site running without contract", severity: "critical", subject: str(u.name) || str(u.code), detail: "Active site with no active client contract — revenue is unbilled and unprotected.", href: "/admin/contracts/client-contracts" });
    }
  }

  /* -------------------------------------------------------------- employees */
  const candidateRows = rows(candidatesR);
  const activeStaff = candidateRows.filter((c) => str(c.status).toLowerCase() === "active" && c.is_enabled !== false && !c.offboarded_at);
  for (const c of candidateRows) {
    const label = `${str(c.full_name) || "Employee"}${c.employee_code ? ` · ${str(c.employee_code)}` : ""}`;
    const status = str(c.status).toLowerCase();
    if (["submitted", "pending", "pending_approval"].includes(status)) {
      push({ id: `cand-appr-${c.id}`, domain: "employees", check: "Onboarding awaiting approval", severity: "high", subject: label, detail: "Candidate submitted for approval and not yet cleared for deployment.", href: "/admin/employees" });
    }
    if (c.offboarded_at && c.is_enabled === true) {
      push({ id: `cand-off-${c.id}`, domain: "employees", check: "Offboarded but still enabled", severity: "critical", subject: label, detail: "Employee was offboarded but their login is still active — revoke access now.", href: "/admin/employees" });
    }
  }
  for (const c of activeStaff) {
    const label = `${str(c.full_name) || "Employee"}${c.employee_code ? ` · ${str(c.employee_code)}` : ""}`;
    const missing: string[] = [];
    if (!str(c.aadhaar_number)) missing.push("Aadhaar");
    if (!str(c.pan_number)) missing.push("PAN");
    if (!str(c.bank_account_number)) missing.push("bank account");
    if (missing.length) {
      push({ id: `cand-kyc-${c.id}`, domain: "employees", check: "KYC incomplete", severity: missing.includes("Aadhaar") ? "high" : "medium", subject: label, detail: `Missing ${missing.join(", ")} — statutory filings and salary transfer are at risk.`, href: "/admin/employees" });
    }
    if (!str(c.email)) {
      push({ id: `cand-mail-${c.id}`, domain: "employees", check: "No email on file", severity: "low", subject: label, detail: "Posting orders and documents cannot be dispatched to this employee.", href: "/admin/employees" });
    }
    const a = age(str(c.date_of_birth) || null);
    if (a != null && a >= 60) {
      push({ id: `cand-age-${c.id}`, domain: "employees", check: "Superannuation age", severity: a >= 62 ? "high" : "medium", subject: label, detail: `Employee is ${a} years old — retirement / fitness re-certification required.`, href: "/admin/employees" });
    }
  }

  /* ------------------------------------------------------------- attendance */
  const codeMeta = new Map(rows(codesR).map((c) => [str(c.code), c]));
  const entryRows = rows(entriesR);
  const markedToday = new Set(entryRows.map((e) => str(e.candidate_id)));
  const absentToday = entryRows.filter((e) => {
    const meta = codeMeta.get(str(e.code));
    return meta ? meta.counts_as_present === false : str(e.code).toUpperCase() === "A";
  });
  const deployable = activeStaff.filter((c) => c.non_billable !== true);
  const unmarked = deployable.filter((c) => !markedToday.has(str(c.id)));
  const unitName = new Map(unitRows.map((u) => [str(u.id), str(u.name) || str(u.code)]));
  if (unmarked.length) {
    push({ id: "att-unmarked", domain: "attendance", check: "Attendance not marked today", severity: unmarked.length > deployable.length * 0.1 ? "critical" : "high", subject: `${unmarked.length} of ${deployable.length} deployed staff`, detail: `No attendance entry for ${todayIso}. Muster rolls must be closed daily.`, href: "/admin/attendance" });
  }
  if (absentToday.length) {
    push({ id: "att-absent", domain: "attendance", check: "Absent today", severity: absentToday.length > deployable.length * 0.05 ? "high" : "medium", subject: `${absentToday.length} absent`, detail: "Absent posts leave client sites uncovered — arrange relievers.", href: "/admin/attendance" });
  }
  for (const s of rows(sheetsR)) {
    const st = str(s.status).toLowerCase();
    const label = unitName.get(str(s.unit_id)) ?? "Unit";
    if (st === "rejected") {
      push({ id: `sheet-rej-${s.id}`, domain: "attendance", check: "Muster roll rejected", severity: "high", subject: label, detail: `Sheet for ${str(s.period_start)} → ${str(s.period_end)} was rejected and needs correction.`, href: "/admin/attendance" });
    }
    if (st === "submitted") {
      push({ id: `sheet-sub-${s.id}`, domain: "attendance", check: "Awaiting approval", severity: "medium", subject: label, detail: `Muster roll for ${str(s.period_start)} → ${str(s.period_end)} is waiting on an approver.`, href: "/admin/attendance" });
    }
  }

  /* ---------------------------------------------------------------- uniform */
  for (const i of rows(issuancesR)) {
    const st = str(i.status).toLowerCase();
    if (st === "issued" && !i.acknowledged_at) {
      const d = daysUntil(str(i.issuance_date) || null);
      const ageDays = d == null ? 0 : Math.abs(Math.min(d, 0));
      push({ id: `iss-ack-${i.id}`, domain: "uniform", check: "Issuance not acknowledged", severity: ageDays > 7 ? "high" : "medium", subject: str(i.issuance_number) || "Issuance", detail: `Kit handed out ${ageDays ? `${ageDays} days ago` : "today"} without employee acknowledgement.`, href: "/admin/inventory/issuances" });
    }
  }
  for (const s of rows(stockR)) {
    if (num(s.qty) < 0) {
      const item = (Array.isArray(s.inv_items) ? s.inv_items[0] : s.inv_items) as { name?: string; code?: string } | null;
      push({ id: `stk-neg-${s.id}`, domain: "uniform", check: "Negative stock", severity: "critical", subject: `${item?.name ?? "Item"}${s.size_value ? ` · ${str(s.size_value)}` : ""}`, detail: `Balance is ${num(s.qty)} — issuance recorded without receipt.`, href: "/admin/inventory/stock" });
    }
  }

  /* --------------------------------------------------------------- vehicles */
  const vehicleRows = rows(vehiclesR).filter((v) => v.enabled !== false);
  const vName = new Map(vehicleRows.map((v) => [str(v.id), str(v.vehicle_number) || str(v.name) || "Vehicle"]));
  const withPuc = new Set<string>();
  const withIns = new Set<string>();
  for (const p of rows(pucsR)) {
    withPuc.add(str(p.vehicle_id));
    const d = daysUntil(str(p.expiry_date) || null);
    const sev = expirySeverity(d);
    if (sev) push({ id: `puc-${p.id}`, domain: "vehicles", check: "PUC expiry", severity: sev, subject: vName.get(str(p.vehicle_id)) ?? vehicleName(null), detail: d! < 0 ? `PUC expired ${Math.abs(d!)} days ago — vehicle is illegal on road.` : `PUC expires in ${d} days.`, dueDate: str(p.expiry_date), daysLeft: d, href: "/admin/vehicles/pucs" });
  }
  for (const i of rows(insR)) {
    withIns.add(str(i.vehicle_id));
    const d = daysUntil(str(i.end_date) || null);
    const sev = expirySeverity(d);
    if (sev) push({ id: `ins-${i.id}`, domain: "vehicles", check: "Insurance renewal", severity: sev, subject: vName.get(str(i.vehicle_id)) ?? "Vehicle", detail: d! < 0 ? `Policy lapsed ${Math.abs(d!)} days ago${i.insurance_company ? ` (${str(i.insurance_company)})` : ""}.` : `Policy renews in ${d} days.`, dueDate: str(i.end_date), daysLeft: d, href: "/admin/vehicles/insurances" });
  }
  for (const f of rows(tagsR)) {
    const d = daysUntil(str(f.expiry_date) || null);
    const sev = expirySeverity(d);
    if (sev) push({ id: `tag-${f.id}`, domain: "vehicles", check: "FASTag expiry", severity: sev === "critical" ? "medium" : "low", subject: vName.get(str(f.vehicle_id)) ?? "Vehicle", detail: d! < 0 ? `FASTag expired ${Math.abs(d!)} days ago.` : `FASTag expires in ${d} days.`, dueDate: str(f.expiry_date), daysLeft: d, href: "/admin/vehicles/fastags" });
  }
  for (const v of vehicleRows) {
    if (!withPuc.has(str(v.id))) push({ id: `veh-nopuc-${v.id}`, domain: "vehicles", check: "No PUC on record", severity: "critical", subject: str(v.vehicle_number) || str(v.name), detail: "Vehicle has no pollution certificate recorded at all.", href: "/admin/vehicles/pucs" });
    if (!withIns.has(str(v.id))) push({ id: `veh-noins-${v.id}`, domain: "vehicles", check: "No insurance on record", severity: "critical", subject: str(v.vehicle_number) || str(v.name), detail: "Vehicle has no insurance policy recorded — uninsured operation.", href: "/admin/vehicles/insurances" });
  }

  /* ----------------------------------------------------------------- assets */
  const propRows = rows(propsR).filter((p) => p.enabled !== false);
  const propName = new Map(propRows.map((p) => [str(p.id), str(p.name) || str(p.house_number) || "Property"]));
  for (const p of propRows) {
    if (!str(p.property_tax_id)) {
      push({ id: `prop-tax-${p.id}`, domain: "assets", check: "Property tax ID missing", severity: "medium", subject: propName.get(str(p.id))!, detail: "No municipal tax identifier recorded for this property.", href: "/admin/assets/inventory" });
    }
  }
  for (const l of rows(loansR)) {
    if (l.enabled === false) continue;
    const d = daysUntil(str(l.end_date) || null);
    const label = `${propName.get(str(l.property_id)) ?? "Property"} · ${str(l.lender_name) || "Loan"}`;
    if (d != null && d < 0 && num(l.outstanding_amount) > 0) {
      push({ id: `loan-over-${l.id}`, domain: "assets", check: "Loan past tenure", severity: "high", subject: label, detail: `Tenure ended ${Math.abs(d)} days ago with ₹${num(l.outstanding_amount).toLocaleString("en-IN")} still outstanding.`, dueDate: str(l.end_date), daysLeft: d, href: "/admin/assets/loan-manager" });
    } else {
      const sev = expirySeverity(d);
      if (sev && sev !== "critical") {
        push({ id: `loan-exp-${l.id}`, domain: "assets", check: "Loan closure due", severity: "low", subject: label, detail: `Loan tenure ends in ${d} days.`, dueDate: str(l.end_date), daysLeft: d, href: "/admin/assets/loan-manager" });
      }
    }
  }

  /* ------------------------------------------------------- payroll & invoice */
  const runByUnitPeriod = new Map(rows(runsR).map((r) => [`${str(r.unit_id)}|${str(r.period_start)}`, r]));
  for (const s of rows(sheetsR)) {
    if (str(s.status).toLowerCase() !== "approved") continue;
    const label = unitName.get(str(s.unit_id)) ?? "Unit";
    const run = runByUnitPeriod.get(`${str(s.unit_id)}|${str(s.period_start)}`);
    const period = `${str(s.period_start)} → ${str(s.period_end)}`;
    if (str(run?.payroll_status) !== "processed") {
      push({ id: `pay-open-${s.id}`, domain: "payroll", check: "Payroll not processed", severity: "high", subject: label, detail: `Attendance approved for ${period} but the payroll register has not been run.`, href: "/admin/payroll" });
    }
    if (str(run?.invoice_status) !== "processed") {
      push({ id: `inv-open-${s.id}`, domain: "invoice", check: "Invoice not raised", severity: "high", subject: label, detail: `Attendance approved for ${period} but no invoice has been processed — revenue is unbilled.`, href: "/admin/invoice" });
    }
  }

  /* --------------------------------------------------------- control center */
  if (rows(dayBasesR).length === 0) {
    push({ id: "cc-daybase", domain: "control_center", check: "No payroll day basis", severity: "critical", subject: "Payroll Days Manager", detail: "No enabled payroll day basis — attendance caps and payroll pro-rating cannot compute.", href: "/admin/payroll-days-manager" });
  }
  const org = rows(orgR)[0];
  if (!org) {
    push({ id: "cc-org", domain: "control_center", check: "Company profile missing", severity: "high", subject: "Organization settings", detail: "No company identity configured — documents and invoices will print without a legal entity.", href: "/admin/org-settings" });
  }
  for (const u of activeUnits) {
    if (u.uniform_included === false && !num(u.uniform_fee_amount)) {
      push({ id: `cc-unif-${u.id}`, domain: "control_center", check: "Uniform fee not configured", severity: "low", subject: str(u.name) || str(u.code), detail: "Uniform is not included at this site but no recovery fee is set.", href: "/admin/customers/unit-manager" });
    }
  }

  const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.domain.localeCompare(b.domain));
}

export function complianceScore(issues: ComplianceIssue[]): number {
  const penalty = issues.reduce((sum, i) => sum + SEVERITY_WEIGHT[i.severity], 0);
  // Diminishing curve so a handful of low-severity items doesn't tank the score.
  const score = 100 * Math.exp(-penalty / 240);
  return Math.max(0, Math.round(score));
}
