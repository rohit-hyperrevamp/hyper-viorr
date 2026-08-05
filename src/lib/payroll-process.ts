// Payroll processing.
//
// Once attendance is locked and the payroll run is APPROVED, processing the
// run parks every computed money line into its permanent ledger:
//
//   • employee deductions      → public.deductions            (source_kind = 'payroll_run')
//   • employer contributions   → public.employer_contributions
//   • benefits / add-ons       → public.additions             (source_kind = 'payroll_run')
//
// Employees put ON HOLD are skipped entirely — nothing is posted for them and
// a row is written to public.payroll_processing_holds so the exclusion is
// auditable. Processing is idempotent: everything previously posted for the
// run is cleared first.

import { supabase } from "@/integrations/supabase/client";

export type ProcessLine = { name: string; amount: number };

export type ProcessableRow = {
  candidateId: string;
  employeeCode: string;
  name: string;
  earnings?: ProcessLine[];
  deductions: ProcessLine[];
  employerContributions: ProcessLine[];
  additions: ProcessLine[];
  paidDays?: number;
  edDays?: number;
  gross?: number;
  netPay: number;
};

export type ProcessResult = {
  processed: number;
  held: number;
  deductionRows: number;
  employerRows: number;
  additionRows: number;
  netTotal: number;
};


function pickDeductionTypeId(name: string, types: { id: string; code: string; name: string }[]): string {
  const n = name.toLowerCase();
  const byCode = (code: string) => types.find((t) => t.code === code)?.id;
  if (/\besi(c)?\b/.test(n)) return byCode("esi_employee") ?? byCode("general_deduction") ?? types[0].id;
  if (/\b(epf|pf|provident)\b/.test(n)) return byCode("epf_employee") ?? byCode("general_deduction") ?? types[0].id;
  if (/professional\s*tax|\bpt\b/.test(n)) return byCode("professional_tax") ?? byCode("general_deduction") ?? types[0].id;
  if (/\blwf\b|labour\s*welfare|welfare\s*fund/.test(n)) return byCode("lwf_employee") ?? byCode("welfare_fund") ?? types[0].id;
  if (/uniform|kit\b/.test(n)) return byCode("uniform") ?? byCode("general_deduction") ?? types[0].id;
  if (/gpaip|group\s*personal\s*accident/.test(n)) return byCode("gpaip") ?? byCode("general_deduction") ?? types[0].id;
  if (/recruit/.test(n)) return byCode("recruitment_fee") ?? byCode("general_deduction") ?? types[0].id;
  if (/advance/.test(n)) return byCode("salary_advance") ?? byCode("general_deduction") ?? types[0].id;
  return byCode("general_deduction") ?? byCode("miscellaneous") ?? types[0].id;
}

function pickAdditionTypeId(name: string, types: { id: string; code: string; name: string }[]): string {
  const n = name.toLowerCase();
  const byCode = (code: string) => types.find((t) => t.code === code)?.id;
  if (/bonus/.test(n)) return byCode("bonus") ?? byCode("miscellaneous") ?? types[0].id;
  if (/incentive/.test(n)) return byCode("incentive") ?? byCode("miscellaneous") ?? types[0].id;
  if (/arrear/.test(n)) return byCode("arrears") ?? byCode("miscellaneous") ?? types[0].id;
  if (/uniform/.test(n)) return byCode("uniform_allowance") ?? byCode("miscellaneous") ?? types[0].id;
  if (/extra\s*duty|overtime|\bot\b/.test(n)) return byCode("overtime_allowance") ?? byCode("miscellaneous") ?? types[0].id;
  if (/leave\s*encash/.test(n)) return byCode("leave_encashment") ?? byCode("miscellaneous") ?? types[0].id;
  return byCode("miscellaneous") ?? types[0].id;
}

/** Contribution cadence — everything computed from a monthly register is monthly today. */
function frequencyOf(name: string): "monthly" | "annual" | "half_yearly" {
  const n = name.toLowerCase();
  if (/gpaip|group\s*personal\s*accident|annual|yearly|gratuity|bonus/.test(n)) return "annual";
  if (/half\s*yearly|semi/.test(n)) return "half_yearly";
  return "monthly";
}

/** Persist the exact figures paid for a run version so amendments can diff against them. */
async function writeSnapshots(args: {
  runId: string;
  unitId: string;
  version: number;
  rows: ProcessableRow[];
  heldIds: Set<string>;
  uid: string | null;
}) {
  await supabase
    .from("payroll_run_snapshots" as never)
    .delete()
    .eq("payroll_run_id", args.runId)
    .eq("version", args.version);

  const payload = args.rows.map((r) => ({
    payroll_run_id: args.runId,
    unit_id: args.unitId,
    candidate_id: r.candidateId,
    version: args.version,
    employee_code: r.employeeCode ?? "",
    full_name: r.name ?? "",
    paid_days: Number(r.paidDays) || 0,
    ed_days: Number(r.edDays) || 0,
    gross: Number(r.gross) || 0,
    total_deductions: (r.deductions ?? []).reduce((s, d) => s + (Number(d.amount) || 0), 0),
    total_employer: (r.employerContributions ?? []).reduce((s, d) => s + (Number(d.amount) || 0), 0),
    net_pay: Number(r.netPay) || 0,
    earnings: r.earnings ?? [],
    deductions: r.deductions ?? [],
    employer_contributions: r.employerContributions ?? [],
    additions: r.additions ?? [],
    on_hold: args.heldIds.has(r.candidateId),
    posted_by: args.uid,
  }));
  if (!payload.length) return;
  for (let i = 0; i < payload.length; i += 300) {
    const { error } = await supabase.from("payroll_run_snapshots" as never).insert(payload.slice(i, i + 300) as never);
    if (error) throw error;
  }
}

export async function processPayrollRun(args: {
  runId: string;
  unitId: string;
  unitLabel: string;
  periodStart: string;
  periodEnd: string;
  rows: ProcessableRow[];
  heldCandidateIds: string[];
  holdReason?: string;
  version?: number;
}): Promise<ProcessResult> {

  const { runId, unitId, unitLabel, periodStart, periodEnd, rows } = args;
  const held = new Set(args.heldCandidateIds);
  const payable = rows.filter((r) => !held.has(r.candidateId));

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id ?? null;

  const [{ data: dTypes }, { data: aTypes }] = await Promise.all([
    supabase.from("deduction_types").select("id, code, name"),
    supabase.from("addition_types").select("id, code, name"),
  ]);
  const deductionTypes = (dTypes ?? []) as { id: string; code: string; name: string }[];
  const additionTypes = (aTypes ?? []) as { id: string; code: string; name: string }[];
  if (deductionTypes.length === 0) throw new Error("No deduction types configured");
  if (additionTypes.length === 0) throw new Error("No addition types configured");

  const ref = `payroll_run:${runId}`;
  const periodLabel = `${unitLabel} · ${periodStart} → ${periodEnd}`;

  // Idempotent re-run: clear anything posted earlier for this run.
  await Promise.all([
    supabase.from("deductions").delete().eq("source_kind", "payroll_run").eq("source_ref", ref),
    supabase.from("additions" as never).delete().eq("source_kind", "payroll_run").eq("source_ref", ref),
    supabase.from("employer_contributions" as never).delete().eq("payroll_run_id", runId),
    supabase.from("payroll_processing_holds" as never).delete().eq("payroll_run_id", runId),
  ]);

  const deductionRows: Record<string, unknown>[] = [];
  const additionRows: Record<string, unknown>[] = [];
  const employerRows: Record<string, unknown>[] = [];

  for (const r of payable) {
    for (const d of r.deductions) {
      const amount = Math.round((Number(d.amount) || 0) * 100) / 100;
      if (amount <= 0) continue;
      deductionRows.push({
        candidate_id: r.candidateId,
        deduction_type_id: pickDeductionTypeId(d.name, deductionTypes),
        deduction_name: d.name,
        deduction_date: periodEnd,
        amount,
        calculation_type: "lumpsum",
        entry_mode: "lumpsum",
        installments: 1,
        description: `Payroll ${periodLabel}`,
        status: "completed",
        source_kind: "payroll_run",
        source_ref: ref,
      });
    }
    for (const a of r.additions) {
      const amount = Math.round((Number(a.amount) || 0) * 100) / 100;
      if (amount <= 0) continue;
      additionRows.push({
        candidate_id: r.candidateId,
        addition_type_id: pickAdditionTypeId(a.name, additionTypes),
        addition_name: a.name,
        addition_date: periodEnd,
        amount,
        calculation_type: "lumpsum",
        entry_mode: "lumpsum",
        installments: 1,
        description: `Payroll ${periodLabel}`,
        status: "completed",
        source_kind: "payroll_run",
        source_ref: ref,
      });
    }
    for (const e of r.employerContributions) {
      const amount = Math.round((Number(e.amount) || 0) * 100) / 100;
      if (amount <= 0) continue;
      employerRows.push({
        candidate_id: r.candidateId,
        unit_id: unitId,
        payroll_run_id: runId,
        contribution_name: e.name,
        amount,
        frequency: frequencyOf(e.name),
        period_start: periodStart,
        period_end: periodEnd,
        contribution_date: periodEnd,
        status: "processed",
        notes: `Payroll ${periodLabel}`,
        source_kind: "payroll_run",
        source_ref: ref,
      });
    }
  }

  const holdRows = rows
    .filter((r) => held.has(r.candidateId))
    .map((r) => ({
      payroll_run_id: runId,
      candidate_id: r.candidateId,
      unit_id: unitId,
      reason: args.holdReason?.trim() || "Excluded from payroll processing",
      status: "on_hold",
      created_by: uid,
    }));

  const chunk = <T,>(arr: T[], size = 400) => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  for (const part of chunk(deductionRows)) {
    const { error } = await supabase.from("deductions").insert(part as never);
    if (error) throw error;
  }
  for (const part of chunk(additionRows)) {
    const { error } = await supabase.from("additions" as never).insert(part as never);
    if (error) throw error;
  }
  for (const part of chunk(employerRows)) {
    const { error } = await supabase.from("employer_contributions" as never).insert(part as never);
    if (error) throw error;
  }
  if (holdRows.length) {
    const { error } = await supabase.from("payroll_processing_holds" as never).insert(holdRows as never);
    if (error) throw error;
  }

  await writeSnapshots({ runId, unitId, version: args.version ?? 1, rows, heldIds: held, uid });



  const { error: runErr } = await supabase
    .from("payroll_runs" as never)
    .update({
      payroll_status: "processed",
      payroll_processed_at: new Date().toISOString(),
      payroll_processed_by: uid,
    } as never)
    .eq("id", runId);
  if (runErr) throw runErr;

  return {
    processed: payable.length,
    held: holdRows.length,
    deductionRows: deductionRows.length,
    employerRows: employerRows.length,
    additionRows: additionRows.length,
    netTotal: Math.round(payable.reduce((s, r) => s + (Number(r.netPay) || 0), 0) * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Amendments
//
// A period that has already been processed is never re-posted wholesale. When
// an amended (v2+) attendance sheet is approved, only the employees whose money
// actually moved get a delta line:
//
//   net increase  → additions   ("Payroll arrears — <period> v2")
//   net decrease  → deductions  ("Payroll recovery — <period> v2")
//   employer cost → employer_contributions adjustment (may be negative)
//
// Everything is keyed on source_ref = payroll_run:<id>:v<version>, so
// re-processing the same amendment replaces its own lines and nothing else.
// ---------------------------------------------------------------------------

export type SnapshotTotals = {
  paidDays: number;
  edDays: number;
  gross: number;
  totalDeductions: number;
  totalEmployer: number;
  netPay: number;
};

export type AmendmentDelta = {
  candidateId: string;
  employeeCode: string;
  name: string;
  before: SnapshotTotals;
  after: SnapshotTotals;
};

export type AmendmentResult = {
  version: number;
  affected: number;
  arrears: number;
  recoveries: number;
  netImpact: number;
  employerImpact: number;
};

export async function processPayrollAmendment(args: {
  runId: string;
  unitId: string;
  unitLabel: string;
  periodStart: string;
  periodEnd: string;
  version: number;
  deltas: AmendmentDelta[];
  rows: ProcessableRow[];
  heldCandidateIds: string[];
}): Promise<AmendmentResult> {
  const { runId, unitId, unitLabel, periodStart, periodEnd, version } = args;
  const held = new Set(args.heldCandidateIds);
  const ref = `payroll_run:${runId}:v${version}`;
  const periodLabel = `${unitLabel} · ${periodStart} → ${periodEnd}`;

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id ?? null;

  const [{ data: dTypes }, { data: aTypes }] = await Promise.all([
    supabase.from("deduction_types").select("id, code, name"),
    supabase.from("addition_types").select("id, code, name"),
  ]);
  const deductionTypes = (dTypes ?? []) as { id: string; code: string; name: string }[];
  const additionTypes = (aTypes ?? []) as { id: string; code: string; name: string }[];
  if (!deductionTypes.length || !additionTypes.length) throw new Error("Deduction/addition types not configured");

  // Idempotent: wipe anything this amendment version posted before.
  await Promise.all([
    supabase.from("deductions").delete().eq("source_kind", "payroll_amendment").eq("source_ref", ref),
    supabase.from("additions" as never).delete().eq("source_kind", "payroll_amendment").eq("source_ref", ref),
    supabase.from("employer_contributions" as never).delete().eq("payroll_run_id", runId).eq("source_ref", ref),
  ]);

  const additionRows: Record<string, unknown>[] = [];
  const deductionRows: Record<string, unknown>[] = [];
  const employerRows: Record<string, unknown>[] = [];
  let arrears = 0;
  let recoveries = 0;
  let employerImpact = 0;

  for (const d of args.deltas) {
    if (held.has(d.candidateId)) continue;
    const netDelta = Math.round(((d.after.netPay || 0) - (d.before.netPay || 0)) * 100) / 100;
    const empDelta = Math.round(((d.after.totalEmployer || 0) - (d.before.totalEmployer || 0)) * 100) / 100;
    const note = `Payroll amendment v${version} — ${periodLabel}. Paid days ${d.before.paidDays} → ${d.after.paidDays}, net ${d.before.netPay} → ${d.after.netPay}.`;

    if (netDelta > 0.004) {
      arrears += netDelta;
      additionRows.push({
        candidate_id: d.candidateId,
        addition_type_id: pickAdditionTypeId("arrears", additionTypes),
        addition_name: `Payroll arrears (v${version})`,
        addition_date: periodEnd,
        amount: netDelta,
        calculation_type: "lumpsum",
        entry_mode: "lumpsum",
        installments: 1,
        description: note,
        status: "completed",
        source_kind: "payroll_amendment",
        source_ref: ref,
      });
    } else if (netDelta < -0.004) {
      recoveries += Math.abs(netDelta);
      deductionRows.push({
        candidate_id: d.candidateId,
        deduction_type_id: pickDeductionTypeId("general", deductionTypes),
        deduction_name: `Payroll recovery (v${version})`,
        deduction_date: periodEnd,
        amount: Math.abs(netDelta),
        calculation_type: "lumpsum",
        entry_mode: "lumpsum",
        installments: 1,
        description: note,
        status: "completed",
        source_kind: "payroll_amendment",
        source_ref: ref,
      });
    }

    if (Math.abs(empDelta) > 0.004) {
      employerImpact += empDelta;
      employerRows.push({
        candidate_id: d.candidateId,
        unit_id: unitId,
        payroll_run_id: runId,
        contribution_name: `Employer cost adjustment (v${version})`,
        amount: empDelta,
        frequency: "monthly",
        period_start: periodStart,
        period_end: periodEnd,
        contribution_date: periodEnd,
        status: "processed",
        notes: note,
        source_kind: "payroll_amendment",
        source_ref: ref,
      });
    }
  }

  if (additionRows.length) {
    const { error } = await supabase.from("additions" as never).insert(additionRows as never);
    if (error) throw error;
  }
  if (deductionRows.length) {
    const { error } = await supabase.from("deductions").insert(deductionRows as never);
    if (error) throw error;
  }
  if (employerRows.length) {
    const { error } = await supabase.from("employer_contributions" as never).insert(employerRows as never);
    if (error) throw error;
  }

  await writeSnapshots({ runId, unitId, version, rows: args.rows, heldIds: held, uid });

  const { error: runErr } = await supabase
    .from("payroll_runs" as never)
    .update({
      payroll_status: "processed",
      payroll_processed_at: new Date().toISOString(),
      payroll_processed_by: uid,
    } as never)
    .eq("id", runId);
  if (runErr) throw runErr;

  return {
    version,
    affected: additionRows.length + deductionRows.length,
    arrears: Math.round(arrears * 100) / 100,
    recoveries: Math.round(recoveries * 100) / 100,
    netImpact: Math.round((arrears - recoveries) * 100) / 100,
    employerImpact: Math.round(employerImpact * 100) / 100,
  };
}

export async function fetchRunSnapshots(runId: string) {
  const { data, error } = await supabase
    .from("payroll_run_snapshots" as never)
    .select(
      "candidate_id, version, employee_code, full_name, paid_days, ed_days, gross, total_deductions, total_employer, net_pay, earnings, deductions, employer_contributions, additions, on_hold, posted_at",
    )
    .eq("payroll_run_id", runId)
    .order("version", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown) as Array<{
    candidate_id: string;
    version: number;
    employee_code: string;
    full_name: string;
    paid_days: number;
    ed_days: number;
    gross: number;
    total_deductions: number;
    total_employer: number;
    net_pay: number;
    earnings: ProcessLine[];
    deductions: ProcessLine[];
    employer_contributions: ProcessLine[];
    additions: ProcessLine[];
    on_hold: boolean;
    posted_at: string;
  }>;
}
