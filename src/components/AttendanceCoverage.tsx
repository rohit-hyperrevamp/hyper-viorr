import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  ChevronDown,
  Download,
  Gauge,
  HelpCircle,
  Search,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadCsv } from "@/lib/csv-export";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Today's attendance charter — committed strength (contract) vs deployed
// employees vs who is actually marked present/absent/unmarked TODAY, unit-wise.
// ---------------------------------------------------------------------------

type PersonStatus = "present" | "absent" | "leave" | "off" | "unmarked";

export type AttendancePerson = {
  id: string;
  name: string;
  code: string | null;
  otHours: number;
  status: PersonStatus;
  designation: string;
};

export type UnitAttendance = {
  unitId: string;
  unitName: string;
  orgName: string;
  contractCode: string;
  committed: number;
  deployed: number;
  present: number;
  absent: number;
  leave: number;
  off: number;
  unmarked: number;
  otHours: number;
  people: AttendancePerson[];
};

const EXCLUDED_ROLE_KEYS = new Set([
  "field_officer",
  "hr",
  "leadership",
  "operations_manager",
  "vp_operations",
  "branch_manager",
  "inventory",
  "transport",
  "admin",
  "super_admin",
]);

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

async function fetchTodayAttendance(day: string): Promise<UnitAttendance[]> {
  const [contractsRes, unitsRes, customersRes, desigRes, candidatesRes, mapRes, codesRes] =
    await Promise.all([
      supabase
        .from("client_contracts" as never)
        .select("id,contract_code,unit_id,status,record_type")
        .eq("record_type", "client")
        .eq("status", "active"),
      supabase.from("units" as never).select("id,name,customer_id"),
      supabase.from("customers" as never).select("id,name"),
      supabase.from("designations" as never).select("id,name"),
      supabase
        .from("candidates" as never)
        .select("id,full_name,designation_id,role_key,status,non_billable,unit_id")
        .eq("status", "active"),
      supabase.from("candidate_units" as never).select("candidate_id,unit_id"),
      supabase
        .from("attendance_codes" as never)
        .select("code,counts_as_present,is_leave,is_paid,day_value"),
    ]);

  const contracts = (contractsRes.data as unknown as Record<string, unknown>[]) ?? [];
  if (contracts.length === 0) return [];

  const resourcesRes = await supabase
    .from("contract_resources" as never)
    .select("contract_id,quantity")
    .in("contract_id", contracts.map((c) => String(c.id)));

  const entriesRes = await supabase
    .from("attendance_entries" as never)
    .select("unit_id,candidate_id,code,ot_hours,entry_date")
    .eq("entry_date", day);

  const unitById = new Map(
    ((unitsRes.data as unknown as Record<string, unknown>[]) ?? []).map((u) => [String(u.id), u]),
  );
  const custName = new Map(
    ((customersRes.data as unknown as Record<string, unknown>[]) ?? []).map((c) => [
      String(c.id),
      String(c.name ?? "—"),
    ]),
  );
  const desigName = new Map(
    ((desigRes.data as unknown as Record<string, unknown>[]) ?? []).map((d) => [
      String(d.id),
      String(d.name ?? "—"),
    ]),
  );

  const codeMeta = new Map(
    ((codesRes.data as unknown as Record<string, unknown>[]) ?? []).map((c) => [
      String(c.code),
      c,
    ]),
  );

  const classify = (code: string | null): PersonStatus => {
    if (!code) return "unmarked";
    const key = code.trim().toUpperCase();
    const meta = codeMeta.get(key);
    if (key === "A") return "absent";
    if (key === "WO" || key === "W") return "off";
    if (meta?.counts_as_present || key === "P" || key === "L" || key === "D" || key === "ED")
      return "present";
    if (key === "HD") return "present";
    if (meta?.is_leave) return "leave";
    if (key === "PH") return "off";
    return "present";
  };

  const candidates = ((candidatesRes.data as unknown as Record<string, unknown>[]) ?? []).filter(
    (c) => !c.non_billable && !EXCLUDED_ROLE_KEYS.has(String(c.role_key ?? "")),
  );
  const candById = new Map(candidates.map((c) => [String(c.id), c]));

  const unitMembers = new Map<string, Set<string>>();
  const push = (unitId: string, candId: string) => {
    if (!unitId || !candById.has(candId)) return;
    if (!unitMembers.has(unitId)) unitMembers.set(unitId, new Set());
    unitMembers.get(unitId)!.add(candId);
  };
  for (const m of (mapRes.data as unknown as Record<string, unknown>[]) ?? []) {
    push(String(m.unit_id ?? ""), String(m.candidate_id ?? ""));
  }
  for (const c of candidates) push(String(c.unit_id ?? ""), String(c.id));

  const committedByContract = new Map<string, number>();
  for (const r of (resourcesRes.data as unknown as Record<string, unknown>[]) ?? []) {
    const k = String(r.contract_id);
    committedByContract.set(k, (committedByContract.get(k) ?? 0) + (Number(r.quantity ?? 0) || 0));
  }

  // unit -> candidate -> entry
  const entryByUnitCand = new Map<string, Record<string, unknown>>();
  for (const e of (entriesRes.data as unknown as Record<string, unknown>[]) ?? []) {
    entryByUnitCand.set(`${String(e.unit_id)}::${String(e.candidate_id)}`, e);
  }

  return contracts
    .map((c) => {
      const unitId = String(c.unit_id ?? "");
      const unit = unitById.get(unitId);
      const members = Array.from(unitMembers.get(unitId) ?? []);

      const people: AttendancePerson[] = members
        .map((id) => {
          const cand = candById.get(id)!;
          const entry = entryByUnitCand.get(`${unitId}::${id}`);
          const code = entry ? String(entry.code ?? "") || null : null;
          return {
            id,
            name: String(cand.full_name ?? "—"),
            designation: cand.designation_id
              ? (desigName.get(String(cand.designation_id)) ?? "—")
              : "—",
            code,
            otHours: entry ? Number(entry.ot_hours ?? 0) || 0 : 0,
            status: classify(code),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      const count = (s: PersonStatus) => people.filter((p) => p.status === s).length;

      return {
        unitId,
        unitName: unit ? String(unit.name ?? "—") : "—",
        orgName: unit ? (custName.get(String(unit.customer_id ?? "")) ?? "—") : "—",
        contractCode: String(c.contract_code ?? "—"),
        committed: committedByContract.get(String(c.id)) ?? 0,
        deployed: people.length,
        present: count("present"),
        absent: count("absent"),
        leave: count("leave"),
        off: count("off"),
        unmarked: count("unmarked"),
        otHours: people.reduce((s, p) => s + p.otHours, 0),
        people,
      };
    })
    .sort((a, b) => a.unitName.localeCompare(b.unitName));
}

export function useTodayAttendance(day: string) {
  return useQuery({
    queryKey: ["admin", "attendance-today", day],
    queryFn: () => fetchTodayAttendance(day),
    refetchInterval: 120_000,
  });
}

/** Green ≥ 98%, amber 85–98%, red < 85% of committed strength. */
export function attendanceTone(
  committed: number,
  present: number,
): "ok" | "warning" | "destructive" {
  if (committed <= 0) return "ok";
  const pct = (present / committed) * 100;
  if (pct >= 98) return "ok";
  return pct >= 85 ? "warning" : "destructive";
}

function Tile({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  tone?: "accent" | "success" | "warning" | "destructive";
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3",
        tone === "success"
          ? "border-emerald-500/40 bg-emerald-500/10"
          : tone === "warning"
            ? "border-amber-500/40 bg-amber-500/10"
            : tone === "destructive"
              ? "border-destructive/40 bg-destructive/10"
              : "border-border bg-background/60",
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            tone === "accent" && "text-primary",
            tone === "success" && "text-emerald-600",
            tone === "warning" && "text-amber-500",
            tone === "destructive" && "text-destructive",
          )}
        />
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "success" && "text-emerald-600",
          tone === "warning" && "text-amber-600",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

const STATUS_META: Record<PersonStatus, { label: string; cls: string }> = {
  present: { label: "Present", cls: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600" },
  absent: { label: "Absent", cls: "border-destructive/25 bg-destructive/10 text-destructive" },
  leave: { label: "Leave", cls: "border-sky-500/25 bg-sky-500/10 text-sky-600" },
  off: { label: "Weekly off", cls: "border-border bg-muted text-muted-foreground" },
  unmarked: { label: "Unmarked", cls: "border-amber-500/25 bg-amber-500/10 text-amber-600" },
};

function StatusChip({ status, code }: { status: PersonStatus; code: string | null }) {
  const m = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        m.cls,
      )}
    >
      {code ? code : "—"} · {m.label}
    </span>
  );
}

export function AttendanceTodayCard() {
  const day = todayIso();
  const { data: rows = [], isLoading } = useTodayAttendance(day);
  const [open, setOpen] = useState(false);

  const totals = useMemo(() => {
    const committed = rows.reduce((s, r) => s + r.committed, 0);
    const deployed = rows.reduce((s, r) => s + r.deployed, 0);
    const present = rows.reduce((s, r) => s + r.present, 0);
    const absent = rows.reduce((s, r) => s + r.absent, 0);
    const leave = rows.reduce((s, r) => s + r.leave, 0);
    const off = rows.reduce((s, r) => s + r.off, 0);
    const unmarked = rows.reduce((s, r) => s + r.unmarked, 0);
    const otHours = rows.reduce((s, r) => s + r.otHours, 0);
    return {
      committed,
      deployed,
      present,
      absent,
      leave,
      off,
      unmarked,
      otHours,
      variance: present - committed,
      coverage: committed > 0 ? Math.round((present / committed) * 100) : 0,
      tone: attendanceTone(committed, present),
      gapUnits: rows.filter((r) => r.absent > 0 || r.unmarked > 0).length,
    };
  }, [rows]);

  const dayLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="mb-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Attendance · {dayLabel}
          </div>
          <h2 className="text-base font-semibold">Committed vs present today</h2>
          <p className="text-xs text-muted-foreground">
            Contracted posts against employees actually marked present on site today.
          </p>
        </div>
        <Button
          variant="outline"
          className="h-9 rounded-lg"
          onClick={() => setOpen(true)}
          disabled={isLoading}
        >
          View unit-wise attendance
        </Button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Committed posts" value={totals.committed} icon={Users} tone="accent" />
        <Tile
          label="Present today"
          value={totals.present}
          icon={UserCheck}
          tone={totals.tone === "ok" ? "success" : totals.tone}
          hint={`of ${totals.deployed} deployed`}
        />
        <Tile
          label="Absent"
          value={totals.absent}
          icon={UserX}
          tone={totals.absent > 0 ? "destructive" : "success"}
        />
        <Tile
          label="Unmarked"
          value={totals.unmarked}
          icon={HelpCircle}
          tone={totals.unmarked > 0 ? "warning" : "success"}
        />
        <Tile
          label="Attendance coverage"
          value={`${totals.coverage}%`}
          icon={Gauge}
          tone={totals.tone === "ok" ? "success" : totals.tone}
          hint={`${totals.variance > 0 ? "+" : ""}${totals.variance} vs committed`}
        />
      </div>

      {(totals.gapUnits > 0 || totals.otHours > 0) && (
        <p className="mt-2 text-xs text-muted-foreground">
          {totals.gapUnits > 0 && (
            <>
              <span className="font-semibold text-destructive">{totals.gapUnits}</span> unit(s) with
              absences or unmarked staff.{" "}
            </>
          )}
          {totals.leave + totals.off > 0 && (
            <>
              {totals.leave} on leave · {totals.off} weekly off.{" "}
            </>
          )}
          {totals.otHours > 0 && <>{totals.otHours} ED hours logged today.</>}
        </p>
      )}

      <AttendanceCharterDialog open={open} onOpenChange={setOpen} rows={rows} dayLabel={dayLabel} />
    </div>
  );
}

function AttendanceCharterDialog({
  open,
  onOpenChange,
  rows,
  dayLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rows: UnitAttendance[];
  dayLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [onlyGaps, setOnlyGaps] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyGaps && r.absent === 0 && r.unmarked === 0) return false;
      if (!q) return true;
      return (
        [r.unitName, r.orgName, r.contractCode].some((v) => v.toLowerCase().includes(q)) ||
        r.people.some((p) => p.name.toLowerCase().includes(q))
      );
    });
  }, [rows, query, onlyGaps]);

  const totals = useMemo(
    () => ({
      committed: filtered.reduce((s, r) => s + r.committed, 0),
      present: filtered.reduce((s, r) => s + r.present, 0),
      absent: filtered.reduce((s, r) => s + r.absent, 0),
      unmarked: filtered.reduce((s, r) => s + r.unmarked, 0),
    }),
    [filtered],
  );

  const exportCsv = () => {
    const data = filtered.flatMap((r) =>
      r.people.map((p) => ({
        Organisation: r.orgName,
        Unit: r.unitName,
        Contract: r.contractCode,
        Employee: p.name,
        Designation: p.designation,
        Code: p.code ?? "",
        Status: STATUS_META[p.status].label,
        "ED hours": p.otHours,
      })),
    );
    downloadCsv("attendance-today", data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>Attendance charter · {dayLabel}</DialogTitle>
          <DialogDescription>
            Unit-wise view of who is present, absent or still unmarked today.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search unit, organisation or employee…"
              className="h-9 rounded-lg pl-9"
            />
          </div>
          <Button
            variant={onlyGaps ? "default" : "outline"}
            className="h-9 rounded-lg"
            onClick={() => setOnlyGaps((v) => !v)}
          >
            Gaps only
          </Button>
          <Button variant="outline" className="h-9 rounded-lg" onClick={exportCsv}>
            <Download className="mr-1.5 h-4 w-4" />
            Export
          </Button>
        </div>

        <div className="px-5 pt-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">{totals.committed}</span>{" "}
          committed ·{" "}
          <span className="font-semibold text-emerald-600 tabular-nums">{totals.present}</span>{" "}
          present ·{" "}
          <span className="font-semibold text-destructive tabular-nums">{totals.absent}</span>{" "}
          absent ·{" "}
          <span className="font-semibold text-amber-600 tabular-nums">{totals.unmarked}</span>{" "}
          unmarked
        </div>

        <div className="max-h-[58vh] overflow-y-auto px-5 pb-5 pt-3">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nothing matches this filter.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => {
                const isOpen = !!expanded[r.unitId];
                const tone = attendanceTone(r.committed, r.present);
                return (
                  <div
                    key={r.unitId}
                    className="overflow-hidden rounded-xl border border-border bg-background/50"
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded((p) => ({ ...p, [r.unitId]: !p[r.unitId] }))}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          isOpen && "rotate-180",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{r.unitName}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {r.orgName} · {r.contractCode}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-sm tabular-nums">
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Committed
                          </div>
                          <div className="font-semibold">{r.committed}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Present
                          </div>
                          <div
                            className={cn(
                              "font-semibold",
                              tone === "destructive" && "text-destructive",
                              tone === "warning" && "text-amber-600",
                              tone === "ok" && "text-emerald-600",
                            )}
                          >
                            {r.present}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Absent
                          </div>
                          <div
                            className={cn(
                              "font-semibold",
                              r.absent > 0 ? "text-destructive" : "text-muted-foreground",
                            )}
                          >
                            {r.absent}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Unmarked
                          </div>
                          <div
                            className={cn(
                              "font-semibold",
                              r.unmarked > 0 ? "text-amber-600" : "text-muted-foreground",
                            )}
                          >
                            {r.unmarked}
                          </div>
                        </div>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-border bg-muted/30 px-3 py-2">
                        {r.people.length === 0 ? (
                          <p className="py-2 text-xs text-muted-foreground">
                            No employees mapped to this unit.
                          </p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                <th className="py-1 text-left font-medium">Employee</th>
                                <th className="py-1 text-left font-medium">Designation</th>
                                <th className="py-1 text-right font-medium">ED</th>
                                <th className="py-1 text-right font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.people.map((p) => (
                                <tr key={p.id} className="border-t border-border/60">
                                  <td className="py-1.5 pr-2">{p.name}</td>
                                  <td className="py-1.5 pr-2 text-muted-foreground">
                                    {p.designation}
                                  </td>
                                  <td className="py-1.5 pr-2 text-right tabular-nums">
                                    {p.otHours ? `${p.otHours}h` : "—"}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    <StatusChip status={p.status} code={p.code} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <div className="mt-2 flex justify-end">
                          <Button
                            variant="ghost"
                            className="h-8 rounded-lg text-xs"
                            onClick={() => {
                              window.location.href = `/admin/attendance/${r.unitId}`;
                            }}
                          >
                            <CalendarCheck className="mr-1.5 h-3.5 w-3.5" />
                            Open attendance sheet
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
