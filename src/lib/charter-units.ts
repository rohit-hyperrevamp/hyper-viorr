import { supabase } from "@/integrations/supabase/client";
import {
  isNonBillableRoleKey,
  matchesAttendanceScope,
  type AttendanceScopeAssignment,
  type AttendanceUnitContext,
} from "@/lib/attendance";

/**
 * Shared unit roster used by the Attendance / Invoice / Payroll charters.
 * All three surfaces browse the same list of units with active contracts and
 * billable deployed employees, so the fetch lives here once.
 */

export type EmployeeRef = { id: string; name: string };

export type ClientEmployee = {
  id: string;
  name: string;
  designation: string;
  unit_id: string;
  unit_name: string;
  unit_code: string;
};

export type CharterUnitRow = {
  id: string;
  code: string;
  name: string;
  location: string;
  branch_id: string | null;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  billing_state: string | null;
  contract_codes: string[];
  contract_end: string | null;
  active_employee_count: number;
  security_guards: EmployeeRef[];
};

export type CharterPageData = {
  units: CharterUnitRow[];
  organizations: { id: string; name: string; code: string }[];
  employeesByCustomer: Record<string, ClientEmployee[]>;
  summary: { organizations: number; units: number; activeEmployees: number };
};

const ACTIVE_EMPLOYEE_STATUSES = ["active"] as const;

export const CHARTER_UNITS_QK = ["charter-units-v1"] as const;

export async function fetchCharterUnits(): Promise<CharterPageData> {
  const { data: contracts, error: contractsError } = await supabase
    .from("client_contracts")
    .select("unit_id, contract_code, end_date, status")
    .eq("status", "active");
  if (contractsError) throw contractsError;

  const contractsByUnit = new Map<string, { codes: string[]; end: string | null }>();
  for (const c of contracts ?? []) {
    if (!c.unit_id) continue;
    const cur = contractsByUnit.get(c.unit_id) ?? { codes: [], end: null };
    if (c.contract_code) cur.codes.push(c.contract_code);
    if (!cur.end || (c.end_date && c.end_date > cur.end)) cur.end = c.end_date;
    contractsByUnit.set(c.unit_id, cur);
  }

  const { data: activeMapped, error: activeMappedError } = await supabase
    .from("candidates")
    .select("unit_id")
    .eq("is_enabled", true)
    .in("status", [...ACTIVE_EMPLOYEE_STATUSES])
    .not("unit_id", "is", null);
  if (activeMappedError) throw activeMappedError;

  const unitIdSet = new Set<string>(contractsByUnit.keys());
  for (const row of activeMapped ?? []) {
    if (row.unit_id) unitIdSet.add(row.unit_id);
  }

  const unitIds = Array.from(unitIdSet);
  if (unitIds.length === 0) {
    return {
      units: [],
      organizations: [],
      employeesByCustomer: {},
      summary: { organizations: 0, units: 0, activeEmployees: 0 },
    };
  }

  const [
    { data: units, error: unitsError },
    { data: primaryCandidates, error: primaryError },
    { data: candidateLinks, error: linksError },
    { data: scopeAssignments, error: scopeAssignmentsError },
  ] = await Promise.all([
    supabase
      .from("units")
      .select("id, code, name, location, branch_id, customer_id, billing_state, reporting_officers")
      .in("id", unitIds),
    supabase
      .from("candidates")
      .select("id, full_name, designation_id, role_key, unit_id, non_billable")
      .eq("non_billable", false)
      .in("unit_id", unitIds)
      .eq("is_enabled", true)
      .in("status", [...ACTIVE_EMPLOYEE_STATUSES]),
    supabase.from("candidate_units").select("candidate_id, unit_id").in("unit_id", unitIds),
    supabase.from("employee_scope_assignments").select("candidate_id, scope_type, scope_id").limit(5000),
  ]);
  if (unitsError) throw unitsError;
  if (primaryError) throw primaryError;
  if (linksError) throw linksError;
  if (scopeAssignmentsError) throw scopeAssignmentsError;

  const linkCandidateIds = Array.from(new Set((candidateLinks ?? []).map((l) => l.candidate_id)));
  const scopeAssignmentRows = (scopeAssignments ?? []) as AttendanceScopeAssignment[];
  const unitsById = new Map(
    ((units ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      location: string | null;
      branch_id: string | null;
      customer_id: string | null;
      billing_state: string | null;
    }>).map((unit) => [unit.id, unit]),
  );

  const scopedCandidateIds = new Set<string>();
  for (const assignment of scopeAssignmentRows) {
    const matchesAnyUnit = unitIds.some((unitId) => {
      const unit = unitsById.get(unitId);
      if (!unit) return false;
      const context: AttendanceUnitContext = {
        id: unit.id,
        branch_id: unit.branch_id,
        customer_id: unit.customer_id,
        billing_state: unit.billing_state,
      };
      return matchesAttendanceScope(context, assignment);
    });
    if (matchesAnyUnit) scopedCandidateIds.add(assignment.candidate_id);
  }

  const secondaryCandidateIds = Array.from(new Set([...linkCandidateIds, ...scopedCandidateIds]));
  let secondaryCandidates: Array<{
    id: string;
    full_name: string;
    designation_id: string | null;
    role_key: string | null;
  }> = [];
  if (secondaryCandidateIds.length > 0) {
    const { data: linkedRows, error: linkedError } = await supabase
      .from("candidates")
      .select("id, full_name, designation_id, role_key, non_billable")
      .eq("non_billable", false)
      .in("id", secondaryCandidateIds)
      .eq("is_enabled", true)
      .in("status", [...ACTIVE_EMPLOYEE_STATUSES]);
    if (linkedError) throw linkedError;
    secondaryCandidates = linkedRows ?? [];
  }
  const secondaryMap = new Map(secondaryCandidates.map((c) => [c.id, c]));

  const designationIds = Array.from(
    new Set(
      [
        ...(primaryCandidates ?? []).map((c) => c.designation_id),
        ...secondaryCandidates.map((c) => c.designation_id),
      ].filter(Boolean) as string[],
    ),
  );
  const { data: designations, error: dErr } = await supabase
    .from("designations")
    .select("id, name")
    .in("id", designationIds.length ? designationIds : ["00000000-0000-0000-0000-000000000000"]);
  if (dErr) throw dErr;
  const dMap = new Map((designations ?? []).map((d) => [d.id, d.name as string]));

  const customerIds = Array.from(
    new Set((units ?? []).map((u) => u.customer_id).filter(Boolean)),
  ) as string[];
  const { data: customers, error: cErr } = await supabase
    .from("customers")
    .select("id, name, code")
    .in("id", customerIds.length ? customerIds : ["00000000-0000-0000-0000-000000000000"]);
  if (cErr) throw cErr;
  const customerMap = new Map(
    (customers ?? []).map((c) => [c.id, { name: c.name as string, code: (c.code as string) || "" }]),
  );

  type UnitAcc = {
    employees: Map<string, { name: string; designation: string; roleKey: string | null }>;
  };
  const acc = new Map<string, UnitAcc>();
  const ensure = (unitId: string) => {
    if (!acc.has(unitId)) acc.set(unitId, { employees: new Map() });
    return acc.get(unitId)!;
  };

  for (const c of primaryCandidates ?? []) {
    if (!c.unit_id) continue;
    ensure(c.unit_id).employees.set(c.id, {
      name: c.full_name || "—",
      designation: (c.designation_id && dMap.get(c.designation_id)) || "",
      roleKey: c.role_key || null,
    });
  }
  for (const link of candidateLinks ?? []) {
    const cand = secondaryMap.get(link.candidate_id);
    if (!cand) continue;
    ensure(link.unit_id).employees.set(cand.id, {
      name: cand.full_name || "—",
      designation: (cand.designation_id && dMap.get(cand.designation_id)) || "",
      roleKey: cand.role_key || null,
    });
  }
  for (const assignment of scopeAssignmentRows) {
    const cand = secondaryMap.get(assignment.candidate_id);
    if (!cand) continue;
    for (const unitId of unitIds) {
      const unit = unitsById.get(unitId);
      if (!unit) continue;
      const context: AttendanceUnitContext = {
        id: unit.id,
        branch_id: unit.branch_id,
        customer_id: unit.customer_id,
        billing_state: unit.billing_state,
      };
      if (!matchesAttendanceScope(context, assignment)) continue;
      ensure(unitId).employees.set(cand.id, {
        name: cand.full_name || "—",
        designation: (cand.designation_id && dMap.get(cand.designation_id)) || "",
        roleKey: cand.role_key || null,
      });
    }
  }

  const rows: CharterUnitRow[] = (units ?? [])
    .map((u) => {
      const a = acc.get(u.id);
      const employees = a ? Array.from(a.employees.entries()) : [];
      const sgs: EmployeeRef[] = [];
      for (const [id, info] of employees) {
        if (isNonBillableRoleKey(info.roleKey)) continue;
        sgs.push({ id, name: info.name });
      }

      return {
        id: u.id,
        code: u.code,
        name: u.name,
        location: u.location || "",
        branch_id: u.branch_id || null,
        customer_id: u.customer_id || "",
        customer_name: (u.customer_id && customerMap.get(u.customer_id)?.name) || "—",
        customer_code: (u.customer_id && customerMap.get(u.customer_id)?.code) || "",
        billing_state: u.billing_state || null,
        contract_codes: contractsByUnit.get(u.id)?.codes ?? [],
        contract_end: contractsByUnit.get(u.id)?.end ?? null,
        active_employee_count: sgs.length,
        security_guards: sgs.sort((a, b) => a.name.localeCompare(b.name)),
      };
    })
    .sort((a, b) =>
      a.customer_name !== b.customer_name
        ? a.customer_name.localeCompare(b.customer_name)
        : (a.name || a.code).localeCompare(b.name || b.code),
    );

  const orgs = Array.from(
    new Map(
      rows.map((r) => [
        r.customer_id || r.customer_name,
        { id: r.customer_id || r.customer_name, name: r.customer_name, code: r.customer_code },
      ]),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));

  const employeesByCustomer: Record<string, ClientEmployee[]> = {};
  for (const r of rows) {
    for (const sg of r.security_guards) {
      const key = r.customer_id || r.customer_name;
      if (!employeesByCustomer[key]) employeesByCustomer[key] = [];
      if (!employeesByCustomer[key].some((e) => e.id === sg.id && e.unit_id === r.id)) {
        employeesByCustomer[key].push({
          id: sg.id,
          name: sg.name,
          designation: "",
          unit_id: r.id,
          unit_name: r.name || r.code,
          unit_code: r.code,
        });
      }
    }
  }
  for (const key of Object.keys(employeesByCustomer)) {
    employeesByCustomer[key].sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    units: rows,
    organizations: orgs,
    employeesByCustomer,
    summary: {
      organizations: orgs.length,
      units: rows.length,
      activeEmployees: rows.reduce((s, r) => s + r.active_employee_count, 0),
    },
  };
}
