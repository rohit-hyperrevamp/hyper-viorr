import { supabase } from "@/integrations/supabase/client";

/**
 * Contractual shift hours (8h or 12h) are the foundational layer for
 * attendance + overtime. They are defined per contract resource line
 * (unit x designation) on active client contracts.
 *
 * Rules derived from the shift length S:
 *  - worked < S/2      -> Absent (A)
 *  - S/2 <= worked < S -> Half Day (HD)
 *  - worked >= S       -> Present (P)
 *  - OT hours          -> max(0, worked - S), expressed in OT days as OT/S
 */
export const DEFAULT_SHIFT_HOURS = 8;

export type ShiftHoursMap = {
  /** `${unitId}|${designationId}` -> hours */
  byUnitDesignation: Map<string, number>;
  /** unitId -> most common shift hours on that unit */
  byUnit: Map<string, number>;
};

export function shiftHoursFor(
  map: ShiftHoursMap | null | undefined,
  unitId: string | null | undefined,
  designationId: string | null | undefined,
): number {
  if (!map || !unitId) return DEFAULT_SHIFT_HOURS;
  if (designationId) {
    const exact = map.byUnitDesignation.get(`${unitId}|${designationId}`);
    if (exact) return exact;
  }
  return map.byUnit.get(unitId) ?? DEFAULT_SHIFT_HOURS;
}

function normalize(hours: unknown): number {
  const n = Number(hours);
  return n === 12 ? 12 : DEFAULT_SHIFT_HOURS;
}

export async function fetchShiftHoursMap(unitIds: string[]): Promise<ShiftHoursMap> {
  const ids = Array.from(new Set(unitIds.filter(Boolean)));
  const empty: ShiftHoursMap = { byUnitDesignation: new Map(), byUnit: new Map() };
  if (!ids.length) return empty;

  const { data: contracts, error: cErr } = await supabase
    .from("client_contracts")
    .select("id, unit_id, status")
    .in("unit_id", ids)
    .eq("status", "active");
  if (cErr) throw cErr;

  const unitByContract = new Map<string, string>();
  for (const c of contracts ?? []) {
    if (c.unit_id) unitByContract.set(c.id as string, c.unit_id as string);
  }
  if (!unitByContract.size) return empty;

  const { data: resources, error: rErr } = await supabase
    .from("contract_resources")
    .select("contract_id, designation_id, shift_hours, quantity")
    .in("contract_id", Array.from(unitByContract.keys()));
  if (rErr) throw rErr;

  const byUnitDesignation = new Map<string, number>();
  const tally = new Map<string, Map<number, number>>();

  for (const r of resources ?? []) {
    const unitId = unitByContract.get(r.contract_id as string);
    if (!unitId) continue;
    const hours = normalize(r.shift_hours);
    if (r.designation_id) byUnitDesignation.set(`${unitId}|${r.designation_id}`, hours);
    const t = tally.get(unitId) ?? new Map<number, number>();
    t.set(hours, (t.get(hours) ?? 0) + (Number(r.quantity) || 1));
    tally.set(unitId, t);
  }

  const byUnit = new Map<string, number>();
  for (const [unitId, t] of tally) {
    let best = DEFAULT_SHIFT_HOURS;
    let bestCount = -1;
    for (const [hours, count] of t) {
      if (count > bestCount) {
        best = hours;
        bestCount = count;
      }
    }
    byUnit.set(unitId, best);
  }

  return { byUnitDesignation, byUnit };
}

/** Attendance code for worked hours against the contractual shift length. */
export function attendanceCodeForShift(workedHours: number, shiftHours: number): "A" | "HD" | "P" {
  const shift = shiftHours === 12 ? 12 : DEFAULT_SHIFT_HOURS;
  if (workedHours >= shift) return "P";
  if (workedHours >= shift / 2) return "HD";
  return "A";
}

/** Overtime expressed in OT days (1 OT day = one full contractual shift). */
export function overtimeDaysForShift(workedHours: number, shiftHours: number): number {
  const shift = shiftHours === 12 ? 12 : DEFAULT_SHIFT_HOURS;
  const otHours = Math.max(0, workedHours - shift);
  return Math.round((otHours / shift) * 2) / 2;
}
