// Live contract & statutory deductions.
//
// Contract-level deduction lines (PF employee share, ESI employee share,
// Professional Tax, LWF, and any bespoke deduction line stored on the client
// contract's resource rate card) are NOT stored as rows in `deductions` —
// storing them would double-count against the payroll register, which already
// computes them from the contract every time it renders.
//
// This module runs exactly the same engine the payroll register runs
// (computeWages + the statutory appliers) for a unit and period, and returns
// the per-employee deduction lines so the Deductions workspace can show them
// live alongside the manually-recorded / auto-generated (uniform, GPAIP,
// recruitment fee) rows.

import { supabase } from "@/integrations/supabase/client";
import { hydrateFormulasFromMaster } from "@/lib/contract-hydrate";
import { fetchAttendanceEntriesForPeriod } from "@/lib/attendance-fetch";
import { resolveLwf, type LwfRow } from "@/lib/lwf-lookup";
import {
  applyEpfBreakdownToWageComputation,
  applyEsiToWageComputation,
  applyLwfToWageComputation,
  applyPtToWageComputation,
  computeAttendanceTotals,
  computeWages,
  mergeByCanonicalName,
  resolvePtAmount,
  type AttendanceCodeLike,
  type AttendanceEntryLike,
  type ContractResourceLike,
  type PincodeRangeLike,
  type PtSlabLike,
} from "@/lib/payroll-calc";

export type LiveDeductionLine = { name: string; amount: number };

export type LiveDeductionRow = {
  candidateId: string;
  employeeCode: string;
  name: string;
  designation: string;
  unitId: string;
  unitName: string;
  contractCode: string;
  earnedGross: number;
  lines: LiveDeductionLine[];
  total: number;
};

export type LiveDeductionResult = {
  rows: LiveDeductionRow[];
  total: number;
  byLine: LiveDeductionLine[];
};

function periodDatesOf(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }
  return out;
}

type PdbMethod = "actual_days" | "fixed_days" | "actual_minus_weekly_off" | "custom_weekdays";

/**
 * Compute the live contract + statutory deductions for one unit and period.
 * Mirrors the payroll register pipeline so numbers always agree.
 */
export async function fetchLiveContractDeductions(args: {
  unitId: string;
  unitName?: string;
  start: string;
  end: string;
}): Promise<LiveDeductionResult> {
  const { unitId, start, end } = args;
  const periodDates = periodDatesOf(start, end);
  const empty: LiveDeductionResult = { rows: [], total: 0, byLine: [] };
  if (!unitId || periodDates.length === 0) return empty;

  const candidateCols = "id, employee_code, full_name, designation_id, gender, is_disabled";

  const [{ data: unit }, { data: primary }, { data: links }] = await Promise.all([
    supabase.from("units").select("id, name, code, billing_state, billing_pincode, epf_cap_enabled").eq("id", unitId).maybeSingle(),
    supabase.from("candidates").select(candidateCols).eq("unit_id", unitId).eq("is_enabled", true).eq("status", "active"),
    supabase.from("candidate_units").select("candidate_id").eq("unit_id", unitId),
  ]);

  const unitName = args.unitName || (unit?.name as string) || (unit?.code as string) || "—";
  const unitState = (unit as { billing_state?: string | null } | null)?.billing_state ?? null;
  const unitPincode = (unit as { billing_pincode?: string | null } | null)?.billing_pincode ?? null;
  const epfCapEnabled = (unit as { epf_cap_enabled?: boolean | null } | null)?.epf_cap_enabled ?? true;

  const linkIds = (links ?? []).map((l) => l.candidate_id);
  let secondary: typeof primary = [];
  if (linkIds.length > 0) {
    const { data } = await supabase
      .from("candidates")
      .select(candidateCols)
      .in("id", linkIds)
      .eq("is_enabled", true)
      .eq("status", "active");
    secondary = data ?? [];
  }
  const roster = Array.from(
    new Map([...(primary ?? []), ...(secondary ?? [])].map((c) => [c.id, c])).values(),
  );
  if (roster.length === 0) return empty;

  const [entries, { data: codes }, { data: contracts }, { data: pdbs }, { data: ptSlabs }, { data: pincodeRanges }, { data: lwfRows }] =
    await Promise.all([
      fetchAttendanceEntriesForPeriod({ unitId, start, end }) as Promise<
        Array<{ candidate_id: string; designation_id: string | null; entry_date: string; code: string; ot_hours: number | string | null }>
      >,
      supabase.from("attendance_codes").select("code, counts_as_present, is_paid").eq("enabled", true),
      supabase
        .from("client_contracts")
        .select("id, contract_code")
        .eq("unit_id", unitId)
        .eq("record_type", "client")
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1),
      supabase.from("payroll_day_bases").select("id, method, fixed_days, weekly_off_day, included_weekdays, enabled"),
      supabase
        .from("professional_tax_slabs")
        .select("id, state, region_label, salary_min, salary_max, tax_per_month, gender"),
      supabase.from("pincode_ranges").select("state, region_label, range_start, range_end, is_excluded"),
      supabase
        .from("labour_welfare_funds")
        .select("id, state, deduction_months, frequency, employee_contribution, employer_contribution, enabled, notes"),
    ]);

  const contractId = contracts?.[0]?.id as string | undefined;
  const contractCode = (contracts?.[0]?.contract_code as string) || "—";
  if (!contractId) return empty;

  const { data: rawResources } = await supabase
    .from("contract_resources")
    .select("designation_id, components, benefits, deductions, employer_contributions, payroll_day_base_id")
    .eq("contract_id", contractId);

  const designationIds = new Set<string>();
  for (const c of roster) if (c.designation_id) designationIds.add(String(c.designation_id));
  for (const r of rawResources ?? []) if (r.designation_id) designationIds.add(String(r.designation_id));
  const { data: designations } = await supabase
    .from("designations")
    .select("id, name")
    .in("id", designationIds.size ? Array.from(designationIds) : ["00000000-0000-0000-0000-000000000000"]);
  const desigMap = new Map((designations ?? []).map((d) => [d.id as string, d.name as string]));

  const pdbMap = new Map<string, NonNullable<ContractResourceLike["payrollDayBase"]>>(
    (pdbs ?? []).map((p) => [
      p.id as string,
      {
        method: p.method as PdbMethod,
        fixedDays: p.fixed_days,
        weeklyOffDay: p.weekly_off_day,
        includedWeekdays: Array.isArray((p as unknown as { included_weekdays?: unknown }).included_weekdays)
          ? (p as unknown as { included_weekdays: unknown[] }).included_weekdays.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6)
          : null,
      },
    ]),
  );
  const dayBases = (pdbs ?? []).map((p) => ({
    id: String(p.id),
    method: p.method as PdbMethod,
    fixedDays: p.fixed_days,
    weeklyOffDay: p.weekly_off_day,
    includedWeekdays: Array.isArray((p as unknown as { included_weekdays?: unknown }).included_weekdays)
      ? (p as unknown as { included_weekdays: unknown[] }).included_weekdays.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6)
      : null,
  }));

  const resourceByDesignation = new Map<string, ContractResourceLike>();
  for (const r of rawResources ?? []) {
    const did = String(r.designation_id ?? "");
    if (!did) continue;
    resourceByDesignation.set(did, {
      designationId: did,
      components: Array.isArray(r.components) ? (r.components as ContractResourceLike["components"]) : [],
      benefits: Array.isArray(r.benefits) ? (r.benefits as ContractResourceLike["benefits"]) : [],
      deductions: Array.isArray(r.deductions) ? (r.deductions as ContractResourceLike["deductions"]) : [],
      employerContributions: Array.isArray(r.employer_contributions)
        ? (r.employer_contributions as ContractResourceLike["employerContributions"])
        : [],
      payrollDayBase: r.payroll_day_base_id ? pdbMap.get(String(r.payroll_day_base_id)) ?? null : null,
    });
  }
  const hydrated = await hydrateFormulasFromMaster(Array.from(resourceByDesignation.values()));
  for (const r of hydrated) resourceByDesignation.set(r.designationId, r);

  // Attendance entries missing a designation roll onto the candidate's primary one.
  const primaryDesigByCandidate = new Map(roster.map((c) => [c.id, c.designation_id ?? null] as const));
  for (const e of entries) {
    if (!e.designation_id) {
      const p = primaryDesigByCandidate.get(e.candidate_id) ?? null;
      if (p) e.designation_id = p as string;
    }
  }

  const periodMonth = new Date(`${start}T00:00:00`).getMonth() + 1;
  const lwfRes = resolveLwf(String(unitPincode ?? ""), (pincodeRanges ?? []) as never, (lwfRows ?? []) as LwfRow[]);
  let lwfEmployee = 0;
  let lwfEmployer = 0;
  let lwfApplies = false;
  if (lwfRes.kind === "match" && lwfRes.lwf.enabled) {
    const months = Array.isArray(lwfRes.lwf.deduction_months) ? lwfRes.lwf.deduction_months : [];
    if (months.length === 0 || months.includes(periodMonth)) {
      lwfApplies = true;
      lwfEmployee = Number(lwfRes.lwf.employee_contribution) || 0;
      lwfEmployer = Number(lwfRes.lwf.employer_contribution) || 0;
    }
  }

  const rows: LiveDeductionRow[] = [];
  for (const c of roster) {
    const did = c.designation_id ? String(c.designation_id) : "";
    const resource = resourceByDesignation.get(did);
    if (!resource) continue;

    const lineEntries = entries.filter(
      (e) => e.candidate_id === c.id && (e.designation_id ?? null) === (c.designation_id ?? null),
    );
    const totals = computeAttendanceTotals(
      c.id,
      periodDates,
      lineEntries as AttendanceEntryLike[],
      (codes ?? []) as AttendanceCodeLike[],
    );
    const wages = computeWages(totals, resource, periodDates.length, { periodDates: periodDates.map((d) => new Date(d)), dayBases, epfCapEnabled });

    Object.assign(wages, applyEsiToWageComputation(wages, { isDisabled: Boolean((c as { is_disabled?: boolean | null }).is_disabled) }));

    const ptResolved = resolvePtAmount({
      state: unitState,
      pincode: unitPincode,
      gender: ((c as { gender?: string | null }).gender ?? "").toString(),
      earnedGross: wages.earnedGross,
      slabs: (ptSlabs ?? []) as PtSlabLike[],
      ranges: (pincodeRanges ?? []) as PincodeRangeLike[],
    });
    Object.assign(wages, applyPtToWageComputation(wages, ptResolved.amount));
    Object.assign(wages, applyLwfToWageComputation(wages, { employee: lwfEmployee, employer: lwfEmployer, applies: lwfApplies }));
    Object.assign(wages, applyEpfBreakdownToWageComputation(wages, { epfCapEnabled }));

    const lines = (mergeByCanonicalName(wages.deductions) as LiveDeductionLine[])
      .map((l) => ({ name: l.name, amount: Math.round((Number(l.amount) || 0) * 100) / 100 }))
      .filter((l) => l.amount > 0);
    if (lines.length === 0) continue;

    rows.push({
      candidateId: c.id,
      employeeCode: (c.employee_code as string) || "",
      name: (c.full_name as string) || "—",
      designation: desigMap.get(did) || "—",
      unitId,
      unitName,
      contractCode,
      earnedGross: Math.round(wages.earnedGross * 100) / 100,
      lines,
      total: Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100,
    });
  }

  const byLineMap = new Map<string, number>();
  for (const r of rows) for (const l of r.lines) byLineMap.set(l.name, (byLineMap.get(l.name) ?? 0) + l.amount);

  return {
    rows: rows.sort((a, b) => a.name.localeCompare(b.name)),
    total: Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100,
    byLine: Array.from(byLineMap, ([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 })).sort(
      (a, b) => b.amount - a.amount,
    ),
  };
}
