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
  deductions: ProcessLine[];
  employerContributions: ProcessLine[];
  additions: ProcessLine[];
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

export async function processPayrollRun(args: {
  runId: string;
  unitId: string;
  unitLabel: string;
  periodStart: string;
  periodEnd: string;
  rows: ProcessableRow[];
  heldCandidateIds: string[];
  holdReason?: string;
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
