import { supabase } from "@/integrations/supabase/client";

export type PayrollWindow = {
  windowStartDay: number;
  windowEndDay: number;
};

export type PayrollPeriod = {
  start: string;
  end: string;
  mtdEnd: string;
  elapsedDays: number;
  totalDays: number;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function iso(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysInMonth(year: number, monthIdx: number) {
  return new Date(year, monthIdx + 1, 0).getDate();
}

function inclusiveDays(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

/** Resolve the contract payroll period represented by a selected payroll month. */
export function payrollPeriodForMonth(
  year: number,
  monthIdx: number,
  window?: PayrollWindow | null,
  today = new Date(),
): PayrollPeriod {
  const startDay = window?.windowStartDay ?? 1;
  const endDay = window?.windowEndDay ?? 31;
  const crossesMonth = startDay > endDay;
  const startMonth = crossesMonth ? monthIdx - 1 : monthIdx;
  const startBase = new Date(year, startMonth, 1);
  const endBase = new Date(year, monthIdx, 1);
  const start = new Date(
    startBase.getFullYear(),
    startBase.getMonth(),
    Math.min(startDay, daysInMonth(startBase.getFullYear(), startBase.getMonth())),
  );
  const end = new Date(
    endBase.getFullYear(),
    endBase.getMonth(),
    Math.min(endDay, daysInMonth(endBase.getFullYear(), endBase.getMonth())),
  );
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const capped = todayDate < start ? start : todayDate > end ? end : todayDate;

  return {
    start: iso(start),
    end: iso(end),
    mtdEnd: iso(capped),
    elapsedDays: todayDate < start ? 0 : inclusiveDays(start, capped),
    totalDays: inclusiveDays(start, end),
  };
}

/** Load the active client contract's payroll window for every unit. */
export async function fetchPayrollWindowsByUnit(unitIds: string[]): Promise<Map<string, PayrollWindow>> {
  const ids = Array.from(new Set(unitIds.filter(Boolean)));
  const out = new Map<string, PayrollWindow>();
  if (!ids.length) return out;

  const { data: contracts, error } = await supabase
    .from("client_contracts")
    .select("unit_id, payroll_window_id, start_date")
    .in("unit_id", ids)
    .eq("record_type", "client")
    .eq("status", "active")
    .order("start_date", { ascending: true });
  if (error) throw error;

  const windowIdByUnit = new Map<string, string>();
  for (const contract of contracts ?? []) {
    if (contract.unit_id && contract.payroll_window_id && !windowIdByUnit.has(contract.unit_id)) {
      windowIdByUnit.set(contract.unit_id, contract.payroll_window_id);
    }
  }
  const windowIds = Array.from(new Set(windowIdByUnit.values()));
  if (!windowIds.length) return out;

  const { data: windows, error: windowError } = await supabase
    .from("payroll_windows")
    .select("id, window_start_day, window_end_day")
    .in("id", windowIds);
  if (windowError) throw windowError;
  const byId = new Map(
    (windows ?? []).map((row) => [
      row.id,
      { windowStartDay: row.window_start_day, windowEndDay: row.window_end_day },
    ]),
  );
  for (const [unitId, windowId] of windowIdByUnit) {
    const payrollWindow = byId.get(windowId);
    if (payrollWindow) out.set(unitId, payrollWindow);
  }
  return out;
}