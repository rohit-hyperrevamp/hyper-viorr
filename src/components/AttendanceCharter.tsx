import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, Download, Gauge, Search, TrendingDown, UserCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadCsv } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { useWorkforceCoverage, type UnitCoverage } from "@/components/WorkforceCoverage";
import { fetchAttendanceEntriesForPeriod } from "@/lib/attendance-fetch";
import { fetchShiftHoursMap, shiftHoursFor, DEFAULT_SHIFT_HOURS } from "@/lib/shift-hours";

// ---------------------------------------------------------------------------
// Attendance charter — the default attendance landing view.
// Reads exactly like the deployment charter (committed / actual / variance /
// coverage) but adds month-till-date attendance: projected man-hours from the
// contract vs actual man-hours worked (including overtime).
// ---------------------------------------------------------------------------

export type CharterUnit = {
  id: string;
  code: string;
  name: string;
  customer_name: string;
  contract_codes: string[];
  security_guards: { id: string; name: string }[];
};

type CodeRow = { code: string; counts_as_present: boolean; is_paid: boolean; day_value: number | string | null };

type PersonStat = {
  id: string;
  name: string;
  shiftHours: number;
  presentDays: number;
  otDays: number;
  actualHours: number;
  projectedHours: number;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function monthBounds(year: number, monthIdx: number) {
  const last = new Date(year, monthIdx + 1, 0).getDate();
  const start = `${year}-${pad(monthIdx + 1)}-01`;
  const end = `${year}-${pad(monthIdx + 1)}-${pad(last)}`;
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  // Month-till-date: cap at today for the running month.
  const mtdEnd = todayIso < end ? (todayIso < start ? start : todayIso) : end;
  const elapsedDays = todayIso < start ? 0 : Number(mtdEnd.slice(8, 10));
  return { start, end, mtdEnd, elapsedDays, daysInMonth: last };
}

function fmtHours(n: number) {
  return `${Math.round(n).toLocaleString("en-IN")}h`;
}

function pct(actual: number, projected: number) {
  if (projected <= 0) return 0;
  return Math.round((actual / projected) * 100);
}

function CoverageChip({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const tone =
    value >= 100
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25"
      : value >= 85
        ? "bg-amber-500/10 text-amber-600 border-amber-500/25"
        : "bg-destructive/10 text-destructive border-destructive/25";
  return (
    <span
      className={cn(
        "inline-flex min-w-[54px] items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        tone,
      )}
    >
      {value}
      {suffix}
    </span>
  );
}

function VarianceChip({ committed, actual }: { committed: number; actual: number }) {
  const diff = actual - committed;
  const tone =
    diff === 0
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25"
      : diff < 0
        ? "bg-destructive/10 text-destructive border-destructive/25"
        : "bg-amber-500/10 text-amber-600 border-amber-500/25";
  return (
    <span
      className={cn(
        "inline-flex min-w-[46px] items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        tone,
      )}
    >
      {diff > 0 ? `+${diff}` : diff}
    </span>
  );
}

function Tile({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Users;
  tone?: "accent" | "warning" | "destructive";
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-3">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            tone === "accent" && "text-primary",
            tone === "warning" && "text-amber-500",
            tone === "destructive" && "text-destructive",
          )}
        />
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function AttendanceCharter({
  units,
  monthIdx,
  year,
  query,
  onQueryChange,
}: {
  units: CharterUnit[];
  monthIdx: number;
  year: number;
  query: string;
  onQueryChange: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { start, mtdEnd, elapsedDays } = useMemo(() => monthBounds(year, monthIdx), [year, monthIdx]);
  const unitIds = useMemo(() => units.map((u) => u.id), [units]);

  const { data: coverage = [] } = useWorkforceCoverage();
  const coverageByUnit = useMemo(() => {
    const m = new Map<string, UnitCoverage>();
    for (const c of coverage) m.set(c.unitId, c);
    return m;
  }, [coverage]);

  const codesQ = useQuery({
    queryKey: ["attendance-codes-charter"],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_codes" as never)
        .select("code, counts_as_present, is_paid, day_value");
      return ((data ?? []) as unknown) as CodeRow[];
    },
  });

  const shiftQ = useQuery({
    queryKey: ["attendance-charter-shifts", unitIds.join(",")],
    enabled: unitIds.length > 0,
    queryFn: () => fetchShiftHoursMap(unitIds),
  });

  const entriesQ = useQuery({
    queryKey: ["attendance-charter-entries", unitIds.join(","), start, mtdEnd],
    enabled: unitIds.length > 0,
    queryFn: () => fetchAttendanceEntriesForPeriod({ unitIds, start, end: mtdEnd, includeUnitId: true }),
  });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of units) for (const g of u.security_guards) m.set(g.id, g.name);
    return m;
  }, [units]);

  const codeMap = useMemo(() => {
    const m = new Map<string, CodeRow>();
    for (const c of codesQ.data ?? []) m.set(c.code, c);
    return m;
  }, [codesQ.data]);

  const statsByUnit = useMemo(() => {
    const out = new Map<string, Map<string, PersonStat>>();
    for (const e of entriesQ.data ?? []) {
      const unitId = e.unit_id ?? "";
      if (!unitId) continue;
      if (!out.has(unitId)) out.set(unitId, new Map());
      const bucket = out.get(unitId)!;
      const shift = shiftHoursFor(shiftQ.data, unitId, e.designation_id) || DEFAULT_SHIFT_HOURS;
      let person = bucket.get(e.candidate_id);
      if (!person) {
        person = {
          id: e.candidate_id,
          name: nameById.get(e.candidate_id) ?? "—",
          shiftHours: shift,
          presentDays: 0,
          otDays: 0,
          actualHours: 0,
          projectedHours: elapsedDays * shift,
        };
        bucket.set(e.candidate_id, person);
      }
      const code = codeMap.get(e.code);
      const raw = code?.day_value;
      const dayValue = raw == null || Number.isNaN(Number(raw)) ? 1 : Math.max(0, Number(raw));
      const counted = code ? (code.counts_as_present || code.is_paid ? dayValue : 0) : 0;
      const ot = Number(e.ot_hours) || 0;
      person.presentDays += counted;
      person.otDays += ot;
      person.actualHours += counted * shift + ot * shift;
    }
    return out;
  }, [entriesQ.data, shiftQ.data, codeMap, nameById, elapsedDays]);

  const rows = useMemo(() => {
    return units
      .map((u) => {
        const cov = coverageByUnit.get(u.id);
        const committed = cov?.committed ?? 0;
        const actual = cov?.actual ?? u.security_guards.length;
        const unitShift = shiftHoursFor(shiftQ.data, u.id, null) || DEFAULT_SHIFT_HOURS;
        const people = Array.from(statsByUnit.get(u.id)?.values() ?? []).sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        // Projected man-hours come from the contract: committed heads × elapsed days × shift.
        const headsForProjection = committed > 0 ? committed : actual;
        const projectedHours = headsForProjection * elapsedDays * unitShift;
        const actualHours = people.reduce((s, p) => s + p.actualHours, 0);
        const otHours = people.reduce((s, p) => s + p.otDays * p.shiftHours, 0);
        return {
          unit: u,
          contractCode: cov?.contractCode ?? u.contract_codes[0] ?? "—",
          lines: cov?.lines ?? [],
          committed,
          actual,
          unitShift,
          people,
          projectedHours,
          actualHours,
          otHours,
          mtdPct: pct(actualHours, projectedHours),
        };
      })
      .filter((r) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return [r.unit.name, r.unit.code, r.unit.customer_name, r.contractCode]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(q));
      })
      .sort((a, b) => a.unit.name.localeCompare(b.unit.name));
  }, [units, coverageByUnit, statsByUnit, shiftQ.data, elapsedDays, query]);

  const totals = useMemo(() => {
    const committed = rows.reduce((s, r) => s + r.committed, 0);
    const actual = rows.reduce((s, r) => s + r.actual, 0);
    const projectedHours = rows.reduce((s, r) => s + r.projectedHours, 0);
    const actualHours = rows.reduce((s, r) => s + r.actualHours, 0);
    const otHours = rows.reduce((s, r) => s + r.otHours, 0);
    return {
      committed,
      actual,
      gap: actual - committed,
      coverage: committed > 0 ? Math.round((actual / committed) * 100) : 0,
      projectedHours,
      actualHours,
      otHours,
      mtdPct: pct(actualHours, projectedHours),
    };
  }, [rows]);

  const exportCsv = () => {
    downloadCsv(
      "attendance-charter",
      rows.map((r) => ({
        Contract: r.contractCode,
        Organisation: r.unit.customer_name,
        Unit: r.unit.name || r.unit.code,
        "Shift hours": r.unitShift,
        Committed: r.committed,
        Actual: r.actual,
        Variance: r.actual - r.committed,
        "Projected man-hours (MTD)": Math.round(r.projectedHours),
        "Actual man-hours (MTD)": Math.round(r.actualHours),
        "Overtime hours (MTD)": Math.round(r.otHours),
        "MTD attendance %": r.mtdPct,
      })),
    );
  };

  const loading = entriesQ.isLoading || shiftQ.isLoading;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Committed" value={totals.committed} icon={Users} tone="accent" />
        <Tile label="Actual deployed" value={totals.actual} icon={UserCheck} />
        <Tile
          label="Variance"
          value={totals.gap > 0 ? `+${totals.gap}` : totals.gap}
          icon={TrendingDown}
          tone={totals.gap < 0 ? "destructive" : "warning"}
        />
        <Tile label="Coverage" value={`${totals.coverage}%`} icon={Gauge} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Projected man-hours (MTD)" value={fmtHours(totals.projectedHours)} sub={`${elapsedDays} day(s) elapsed`} icon={Gauge} />
        <Tile label="Actual man-hours (MTD)" value={fmtHours(totals.actualHours)} icon={UserCheck} tone="accent" />
        <Tile label="Overtime (MTD)" value={fmtHours(totals.otHours)} icon={TrendingDown} tone="warning" />
        <Tile
          label="MTD attendance"
          value={`${totals.mtdPct}%`}
          sub="actual vs projected"
          icon={Gauge}
          tone={totals.mtdPct < 85 ? "destructive" : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by unit, client or contract…"
            className="h-9 rounded-lg pl-9"
          />
        </div>
        <Button variant="outline" className="h-9 rounded-lg" onClick={exportCsv}>
          <Download className="mr-1.5 h-4 w-4" /> Export
        </Button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Loading month-till-date attendance…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No units match this search.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const isOpen = !!expanded[r.unit.id];
            return (
              <div key={r.unit.id} className="overflow-hidden rounded-xl border border-border bg-background/50">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setExpanded((p) => ({ ...p, [r.unit.id]: !p[r.unit.id] }))}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">{r.unit.name || r.unit.code}</span>
                        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {r.unitShift}h shift
                        </span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.unit.customer_name} · {r.contractCode}
                      </div>
                    </div>
                    <div className="hidden shrink-0 items-center gap-3 text-sm tabular-nums sm:flex">
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Committed</div>
                        <div className="font-semibold">{r.committed}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Actual</div>
                        <div className="font-semibold">{r.actual}</div>
                      </div>
                      <VarianceChip committed={r.committed} actual={r.actual} />
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">MTD hours</div>
                        <div className="font-semibold">
                          {fmtHours(r.actualHours)}
                          <span className="text-muted-foreground"> / {fmtHours(r.projectedHours)}</span>
                        </div>
                      </div>
                      <CoverageChip value={r.mtdPct} />
                    </div>
                  </button>
                  <Link
                    to="/admin/attendance/$unitId"
                    params={{ unitId: r.unit.id }}
                    search={{ month: monthIdx, year }}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground hover:border-accent/50 hover:text-accent"
                  >
                    Open attendance <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2 text-xs tabular-nums sm:hidden">
                  <span className="text-muted-foreground">
                    {r.actual}/{r.committed} deployed
                  </span>
                  <span className="text-muted-foreground">
                    {fmtHours(r.actualHours)} / {fmtHours(r.projectedHours)}
                  </span>
                  <CoverageChip value={r.mtdPct} />
                </div>

                {isOpen && (
                  <div className="space-y-3 border-t border-border bg-muted/30 px-3 py-2">
                    {r.lines.length > 0 && (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            <th className="py-1 text-left font-medium">Role</th>
                            <th className="py-1 text-right font-medium">Committed</th>
                            <th className="py-1 text-right font-medium">Actual</th>
                            <th className="py-1 text-right font-medium">Variance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.lines.map((l) => (
                            <tr key={l.role} className="border-t border-border/60">
                              <td className="py-1.5 pr-2">{l.role}</td>
                              <td className="py-1.5 text-right tabular-nums">{l.committed}</td>
                              <td className="py-1.5 text-right tabular-nums">{l.actual}</td>
                              <td className="py-1.5 text-right">
                                <VarianceChip committed={l.committed} actual={l.actual} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    <div>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Month-till-date attendance per employee
                      </div>
                      {r.people.length === 0 ? (
                        <p className="py-2 text-xs text-muted-foreground">
                          No attendance marked for this unit yet this month.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                <th className="py-1 text-left font-medium">Employee</th>
                                <th className="py-1 text-right font-medium">Shift</th>
                                <th className="py-1 text-right font-medium">Days</th>
                                <th className="py-1 text-right font-medium">OT hrs</th>
                                <th className="py-1 text-right font-medium">Actual hrs</th>
                                <th className="py-1 text-right font-medium">Projected</th>
                                <th className="py-1 text-right font-medium">MTD %</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.people.map((p) => (
                                <tr key={p.id} className="border-t border-border/60">
                                  <td className="py-1.5 pr-2">{p.name}</td>
                                  <td className="py-1.5 text-right tabular-nums">{p.shiftHours}h</td>
                                  <td className="py-1.5 text-right tabular-nums">{p.presentDays}</td>
                                  <td className="py-1.5 text-right tabular-nums">
                                    {Math.round(p.otDays * p.shiftHours)}
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums">{fmtHours(p.actualHours)}</td>
                                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                                    {fmtHours(p.projectedHours)}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    <CoverageChip value={pct(p.actualHours, p.projectedHours)} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
