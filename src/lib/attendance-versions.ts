// Attendance version control for post-payroll amendments.
//
// Normal life: attendance is draft → submitted → approved, payroll processes,
// period is frozen. Version 1 of the muster roll is the paid truth.
//
// If something was paid wrong, the sheet is NOT reopened (approved means
// approved). Instead an AMENDMENT is started: the live entries are frozen into
// `attendance_sheet_versions` as the previous version, `current_version` is
// bumped and `amendment_status` walks open → submitted → approved → processed.
// Payroll then posts only the delta for the employees whose attendance moved.

import { supabase } from "@/integrations/supabase/client";
import { fetchAttendanceEntriesForPeriod } from "@/lib/attendance-fetch";

export type AmendmentStatus = "none" | "open" | "submitted" | "approved" | "processed";

export type AttendanceSnapshotEntry = {
  candidate_id: string;
  designation_id: string | null;
  entry_date: string;
  code: string;
  ot_hours: number;
};

export type AttendanceVersionRow = {
  id: string;
  unit_id: string;
  period_start: string;
  period_end: string;
  version: number;
  status: string;
  reason: string;
  snapshot: AttendanceSnapshotEntry[];
  created_at: string;
  approved_at: string | null;
};

export type EntryDiff = {
  candidateId: string;
  designationId: string | null;
  date: string;
  beforeCode: string;
  afterCode: string;
  beforeEd: number;
  afterEd: number;
};

const keyOf = (e: { candidate_id: string; designation_id: string | null; entry_date: string }) =>
  `${e.candidate_id}|${e.designation_id ?? ""}|${e.entry_date}`;

export async function fetchAttendanceVersions(
  unitId: string,
  periodStart: string,
  periodEnd: string,
): Promise<AttendanceVersionRow[]> {
  const { data, error } = await supabase
    .from("attendance_sheet_versions" as never)
    .select("id, unit_id, period_start, period_end, version, status, reason, snapshot, created_at, approved_at")
    .eq("unit_id", unitId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .order("version", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown) as AttendanceVersionRow[];
}

/** Freeze the live muster roll as `version` and open the next version for editing. */
export async function startAttendanceAmendment(params: {
  unitId: string;
  periodStart: string;
  periodEnd: string;
  sheetId: string | null;
  currentVersion: number;
  reason: string;
}): Promise<number> {
  const { unitId, periodStart, periodEnd, currentVersion } = params;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id ?? null;

  const live = await fetchAttendanceEntriesForPeriod({ unitId, start: periodStart, end: periodEnd });
  const snapshot: AttendanceSnapshotEntry[] = live.map((e) => ({
    candidate_id: e.candidate_id,
    designation_id: e.designation_id ?? null,
    entry_date: e.entry_date,
    code: e.code ?? "",
    ot_hours: Number(e.ot_hours) || 0,
  }));

  const { error: verErr } = await supabase.from("attendance_sheet_versions" as never).upsert(
    {
      unit_id: unitId,
      period_start: periodStart,
      period_end: periodEnd,
      version: currentVersion,
      status: "locked",
      reason: params.reason,
      snapshot: snapshot as never,
      created_by: uid,
      approved_at: new Date().toISOString(),
      approved_by: uid,
    } as never,
    { onConflict: "unit_id,period_start,period_end,version" } as never,
  );
  if (verErr) throw verErr;

  const nextVersion = currentVersion + 1;
  const patch = { current_version: nextVersion, amendment_status: "open" } as Record<string, unknown>;
  if (params.sheetId) {
    const { error } = await supabase.from("attendance_sheets" as never).update(patch as never).eq("id", params.sheetId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("attendance_sheets" as never).insert({
      unit_id: unitId,
      period_start: periodStart,
      period_end: periodEnd,
      status: "approved",
      ...patch,
    } as never);
    if (error) throw error;
  }
  return nextVersion;
}

export async function setAmendmentStatus(sheetId: string, next: AmendmentStatus) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id ?? null;
  const patch: Record<string, unknown> = { amendment_status: next };
  if (next === "approved") { patch.approved_at = new Date().toISOString(); patch.approved_by = uid; }
  const { error } = await supabase.from("attendance_sheets" as never).update(patch as never).eq("id", sheetId);
  if (error) throw error;
}

/** Cell-level diff between a frozen snapshot and the live entries. */
export function diffAttendance(
  before: AttendanceSnapshotEntry[],
  after: AttendanceSnapshotEntry[],
): EntryDiff[] {
  const beforeMap = new Map(before.map((e) => [keyOf(e), e]));
  const afterMap = new Map(after.map((e) => [keyOf(e), e]));
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const out: EntryDiff[] = [];
  for (const k of keys) {
    const b = beforeMap.get(k);
    const a = afterMap.get(k);
    const bCode = (b?.code ?? "").trim();
    const aCode = (a?.code ?? "").trim();
    const bEd = Number(b?.ot_hours) || 0;
    const aEd = Number(a?.ot_hours) || 0;
    if (bCode === aCode && Math.abs(bEd - aEd) < 0.0001) continue;
    const ref = a ?? b!;
    out.push({
      candidateId: ref.candidate_id,
      designationId: ref.designation_id ?? null,
      date: ref.entry_date,
      beforeCode: bCode,
      afterCode: aCode,
      beforeEd: bEd,
      afterEd: aEd,
    });
  }
  return out.sort((x, y) => (x.candidateId === y.candidateId ? x.date.localeCompare(y.date) : x.candidateId.localeCompare(y.candidateId)));
}

export async function fetchLiveSnapshot(unitId: string, periodStart: string, periodEnd: string) {
  const live = await fetchAttendanceEntriesForPeriod({ unitId, start: periodStart, end: periodEnd });
  return live.map((e) => ({
    candidate_id: e.candidate_id,
    designation_id: e.designation_id ?? null,
    entry_date: e.entry_date,
    code: e.code ?? "",
    ot_hours: Number(e.ot_hours) || 0,
  })) as AttendanceSnapshotEntry[];
}
