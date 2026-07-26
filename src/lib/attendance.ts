export type AttendanceScopeType = "state" | "customer" | "branch" | "unit";

export type AttendanceScopeAssignment = {
  candidate_id: string;
  scope_type: AttendanceScopeType;
  scope_id: string;
};

export type AttendanceUnitContext = {
  id: string;
  branch_id: string | null;
  customer_id: string | null;
  billing_state: string | null;
};

const FIELD_OFFICER_ROLE_KEYS = new Set(["field_officer", "field_officer"]);
const SECURITY_GUARD_ROLE_KEYS = new Set(["guard", "security_guard"]);

// Back-office / non-billable roles that must NEVER appear on a muster roll.
const NON_BILLABLE_ROLE_KEYS = new Set([
  "field_officer",
  "branch_manager",
  "hr",
  "leadership",
  "transport",
  "inventory",
  "admin",
  "super_admin",
  "user",
  "accounts",
  "operations",
  "operations_manager",
  "area_manager",
  "regional_manager",
]);

export function isNonBillableRoleKey(roleKey: string | null | undefined) {
  const k = (roleKey || "").toLowerCase().trim();
  if (!k) return false;
  return NON_BILLABLE_ROLE_KEYS.has(k);
}

const FIELD_OFFICER_KEYWORDS = ["field officer", "field-officer", "fieldofficer", "fo "];
const SECURITY_GUARD_KEYWORDS = ["security guard", "guard", "security-guard", "sg ", "security_guard"];

function matchDesignation(name: string, keywords: string[]) {
  const normalized = (name || "").toLowerCase().trim();
  if (!normalized) return false;
  return keywords.some((keyword) => normalized.includes(keyword.trim()));
}

export function matchesAttendanceScope(unit: AttendanceUnitContext, assignment: AttendanceScopeAssignment) {
  if (assignment.scope_type === "unit") return assignment.scope_id === unit.id;
  if (assignment.scope_type === "branch") return Boolean(unit.branch_id) && assignment.scope_id === unit.branch_id;
  if (assignment.scope_type === "customer") return Boolean(unit.customer_id) && assignment.scope_id === unit.customer_id;
  if (assignment.scope_type === "state") return Boolean(unit.billing_state) && assignment.scope_id === unit.billing_state;
  return false;
}

export function classifyAttendanceEmployee(roleKey: string | null | undefined, designation: string) {
  const normalizedRole = (roleKey || "").toLowerCase().trim();

  if (FIELD_OFFICER_ROLE_KEYS.has(normalizedRole)) return "field_officer" as const;
  if (SECURITY_GUARD_ROLE_KEYS.has(normalizedRole)) return "security_guard" as const;
  if (matchDesignation(designation, FIELD_OFFICER_KEYWORDS)) return "field_officer" as const;
  if (matchDesignation(designation, SECURITY_GUARD_KEYWORDS)) return "security_guard" as const;

  return null;
}