import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Period lifecycle shared by Attendance → Payroll → Invoice.
 *
 * Attendance (`attendance_sheets.status`)
 *   draft      → open, editable
 *   submitted  → awaiting approval, locked for the field officer
 *   approved   → locked; only an approver/admin can reopen
 *   rejected   → back to open
 *
 * Payroll & Invoice (`payroll_runs`)
 *   Stay OPEN until the attendance sheet for that unit+period is approved and
 *   handed off. Once the register has been run, they are marked PROCESSED
 *   (`payroll_status` / `invoice_status`), which locks the money for the
 *   period until an admin reopens it.
 */

export type AttendanceStatus = "draft" | "submitted" | "approved" | "rejected" | "none";
export type MoneyStatus = "open" | "ready" | "processed";

export type PeriodStatus = {
  unitId: string;
  attendance: AttendanceStatus;
  handedOff: boolean;
  payroll: MoneyStatus;
  invoice: MoneyStatus;
  runId: string | null;
};

export type PeriodStatusMap = Map<string, PeriodStatus>;

export const PERIOD_STATUS_QK = "period-status-v1";

export function periodStatusQueryKey(unitIds: string[], start: string, end: string) {
  return [PERIOD_STATUS_QK, unitIds.join(","), start, end] as const;
}

export async function fetchPeriodStatuses(
  unitIds: string[],
  periodStart: string,
  periodEnd: string,
): Promise<PeriodStatusMap> {
  const ids = Array.from(new Set(unitIds.filter(Boolean)));
  const out: PeriodStatusMap = new Map();
  if (!ids.length) return out;

  const [{ data: sheets }, { data: runs }] = await Promise.all([
    supabase
      .from("attendance_sheets" as never)
      .select("unit_id, status")
      .in("unit_id", ids)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd),
    supabase
      .from("payroll_runs" as never)
      .select("id, unit_id, status, payroll_status, invoice_status")
      .in("unit_id", ids)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd),
  ]);

  const sheetRows = ((sheets ?? []) as unknown) as Array<{ unit_id: string; status: AttendanceStatus }>;
  const runRows = ((runs ?? []) as unknown) as Array<{
    id: string;
    unit_id: string;
    status: string;
    payroll_status: string | null;
    invoice_status: string | null;
  }>;

  const sheetByUnit = new Map(sheetRows.map((s) => [s.unit_id, s.status]));
  const runByUnit = new Map(runRows.map((r) => [r.unit_id, r]));

  for (const unitId of ids) {
    const attendance = sheetByUnit.get(unitId) ?? "none";
    const run = runByUnit.get(unitId);
    const handedOff = ["submitted", "approved"].includes(run?.status ?? "");
    const ready = attendance === "approved";
    const money = (value: string | null | undefined): MoneyStatus =>
      value === "processed" ? "processed" : ready ? "ready" : "open";
    out.set(unitId, {
      unitId,
      attendance,
      handedOff,
      payroll: money(run?.payroll_status),
      invoice: money(run?.invoice_status),
      runId: run?.id ?? null,
    });
  }

  return out;
}

/** Ensure a payroll_runs row exists for the unit+period, then return its id. */
async function ensureRun(unitId: string, periodStart: string, periodEnd: string): Promise<string> {
  const { data: existing } = await supabase
    .from("payroll_runs" as never)
    .select("id")
    .eq("unit_id", unitId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();
  const id = (existing as { id?: string } | null)?.id;
  if (id) return id;

  const { data, error } = await supabase
    .from("payroll_runs" as never)
    .insert({ unit_id: unitId, period_start: periodStart, period_end: periodEnd, status: "draft" } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as unknown as { id: string }).id;
}

export async function setMoneyStatus(params: {
  unitId: string;
  periodStart: string;
  periodEnd: string;
  kind: "payroll" | "invoice";
  next: "processed" | "open";
}): Promise<void> {
  const runId = await ensureRun(params.unitId, params.periodStart, params.periodEnd);
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id ?? null;
  const ts = params.next === "processed" ? new Date().toISOString() : null;
  const patch: Record<string, unknown> =
    params.kind === "payroll"
      ? { payroll_status: params.next, payroll_processed_at: ts, payroll_processed_by: ts ? uid : null }
      : { invoice_status: params.next, invoice_processed_at: ts, invoice_processed_by: ts ? uid : null };

  const { error } = await supabase.from("payroll_runs" as never).update(patch as never).eq("id", runId);
  if (error) throw error;
}

/**
 * Live wiring: any attendance edit (including overtime), sheet transition or
 * payroll-run change anywhere refreshes the attendance / payroll / invoice
 * surfaces immediately — no manual reload, no stale five-minute cache.
 */
export function useAttendanceMoneyRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const invalidate = () => {
      qc.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          if (typeof key !== "string") return false;
          return (
            key === PERIOD_STATUS_QK ||
            key.startsWith("attendance") ||
            key.startsWith("finance-charter") ||
            key.startsWith("payroll") ||
            key.startsWith("invoice") ||
            key.startsWith("live-contract-deductions")
          );
        },
      });
    };

    const channel = supabase
      .channel("attendance-money-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_entries" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_sheets" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "payroll_runs" }, invalidate)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
