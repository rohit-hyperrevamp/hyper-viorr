import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Download, Gauge, Search, TrendingDown, UserCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadCsv } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { useWorkforceCoverage, type UnitCoverage } from "@/components/WorkforceCoverage";
import { fetchAttendanceEntriesForPeriod } from "@/lib/attendance-fetch";
import { fetchShiftHoursMap, shiftHoursFor, DEFAULT_SHIFT_HOURS } from "@/lib/shift-hours";
import {
  fetchPeriodStatusesForUnitPeriods,
  PERIOD_STATUS_QK,
  useAttendanceMoneyRealtime,
  type PeriodStatus,
} from "@/lib/period-status";
import { AttendanceStatusBadge, MoneyStatusBadge } from "@/components/PeriodStatusBadge";
import { fetchPayrollWindowsByUnit, payrollPeriodForMonth } from "@/lib/payroll-period";

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

function fmtHours(n: number) {
  return `${Math.round(n).toLocaleString("en-IN")}h`;
}

function pct(actual: number, projected: number) {
  if (projected <= 0) return 0;
  return Math.round((actual / projected) * 100);
}

function toneFor(value: number) {
  if (value >= 100) return "emerald";
  if (value >= 85) return "amber";
  return "rose";
}

function CoverageChip({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const tone = toneFor(value);
  return (
    <span
      className={cn(
        "inline-flex min-w-[52px] items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        tone === "emerald" && "border-emerald-500/25 bg-emerald-500/10 text-emerald-600",
        tone === "amber" && "border-amber-500/25 bg-amber-500/10 text-amber-600",
        tone === "rose" && "border-destructive/25 bg-destructive/10 text-destructive",
      )}
    >
      {value}
      {suffix}
    </span>
  );
}

function VarianceChip({ committed, actual }: { committed: number; actual: number }) {
  const diff = actual - committed;
  return (
    <span
      className={cn(
        "inline-flex min-w-[44px] items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        diff === 0 && "border-emerald-500/25 bg-emerald-500/10 text-emerald-600",
        diff < 0 && "border-destructive/25 bg-destructive/10 text-destructive",
        diff > 0 && "border-amber-500/25 bg-amber-500/10 text-amber-600",
      )}
    >
      {diff > 0 ? `+${diff}` : diff}
    </span>
  );
}

/** Circular MTD gauge used as the row's visual anchor. */
function Dial({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(value, 130));
  const tone = toneFor(value);
  const stroke =
    tone === "emerald"
      ? "var(--color-emerald-500, #10b981)"
      : tone === "amber"
        ? "var(--color-amber-500, #f59e0b)"
        : "hsl(var(--destructive))";
  const r = 17;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(clamped, 100) / 100) * c;
  return (
    <div className="relative h-11 w-11 shrink-0">
      <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3.5" className="stroke-border" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          stroke={stroke}
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-foreground">
        {value}%
      </span>
    </div>
  );
}

function Stat({
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
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-2.5 sm:p-3">
      <div className="flex items-center justify-between gap-1.5">
        <span className="truncate text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-[10px] sm:tracking-[0.14em]">
          {label}
        </span>
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground",
            tone === "accent" && "text-primary",
            tone === "warning" && "text-amber-500",
            tone === "destructive" && "text-destructive",
          )}
        />
      </div>
      <div className="mt-1.5 truncate text-[19px] font-semibold leading-none tracking-tight tabular-nums sm:text-[22px]">
        {value}
      </div>
      {sub && <div className="mt-1 truncate text-[10.5px] text-muted-foreground sm:text-[11px]">{sub}</div>}
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
  const unitIds = useMemo(() => units.map((u) => u.id), [units]);

  // Any attendance / OT edit anywhere refreshes this charter instantly.
  useAttendanceMoneyRealtime();

  const windowsQ = useQuery({
    queryKey: ["charter-payroll-windows", unitIds.join(",")],
    enabled: unitIds.length > 0,
    queryFn: () => fetchPayrollWindowsByUnit(unitIds),
  });

  const periodsByUnit = useMemo(() => {
    const out = new Map<string, ReturnType<typeof payrollPeriodForMonth>>();
    for (const unitId of unitIds) out.set(unitId, payrollPeriodForMonth(year, monthIdx, windowsQ.data?.get(unitId)));
    return out;
  }, [unitIds, year, monthIdx, windowsQ.data]);
  const periodKey = useMemo(
    () => Array.from(periodsByUnit, ([unitId, p]) => `${unitId}:${p.start}:${p.end}`).join("|"),
    [periodsByUnit],
  );

  const statusQ = useQuery({
    queryKey: [PERIOD_STATUS_QK, periodKey],
    enabled: unitIds.length > 0 && !windowsQ.isLoading,
    staleTime: 0,
    queryFn: () => fetchPeriodStatusesForUnitPeriods(periodsByUnit),
  });


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
    queryKey: ["attendance-charter-entries", periodKey],
    enabled: unitIds.length > 0 && !windowsQ.isLoading,
    staleTime: 0,
    queryFn: async () => {
      const groups = new Map<string, { start: string; end: string; unitIds: string[] }>();
      for (const [unitId, period] of periodsByUnit) {
        const key = `${period.start}|${period.mtdEnd}`;
        const group = groups.get(key) ?? { start: period.start, end: period.mtdEnd, unitIds: [] };
        group.unitIds.push(unitId);
        groups.set(key, group);
      }
      const pages = await Promise.all(
        Array.from(groups.values()).map((group) =>
          fetchAttendanceEntriesForPeriod({ unitIds: group.unitIds, start: group.start, end: group.end, includeUnitId: true }),
        ),
      );
      return pages.flat();
    },
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
          projectedHours: (periodsByUnit.get(unitId)?.elapsedDays ?? 0) * shift,
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
  }, [entriesQ.data, shiftQ.data, codeMap, nameById, periodsByUnit]);

  const rows = useMemo(() => {
    return units
      .map((u) => {
        const cov = coverageByUnit.get(u.id);
        const committed = cov?.committed ?? 0;
        const actual = cov?.actual ?? u.security_guards.length;
        const period = periodsByUnit.get(u.id) ?? payrollPeriodForMonth(year, monthIdx);
        const unitShift = shiftHoursFor(shiftQ.data, u.id, null) || DEFAULT_SHIFT_HOURS;
        const people = Array.from(statsByUnit.get(u.id)?.values() ?? []).sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        // Projected man-hours come from the contract: committed heads × elapsed days × shift.
        const headsForProjection = committed > 0 ? committed : actual;
        const projectedHours = headsForProjection * period.elapsedDays * unitShift;
        const actualHours = people.reduce((s, p) => s + p.actualHours, 0);
        const otHours = people.reduce((s, p) => s + p.otDays * p.shiftHours, 0);
        const status: PeriodStatus = statusQ.data?.get(u.id) ?? {
          unitId: u.id,
          attendance: "none",
          handedOff: false,
          payroll: "open",
          invoice: "open",
          runId: null,
        };
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
          period,
          status,
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
  }, [units, coverageByUnit, statsByUnit, shiftQ.data, statusQ.data, periodsByUnit, year, monthIdx, query]);

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
        "Extra duty hours (MTD)": Math.round(r.otHours),
        "MTD attendance %": r.mtdPct,
      })),
    );
  };

  const loading = entriesQ.isLoading || shiftQ.isLoading || windowsQ.isLoading;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat
          label="Deployment"
          value={`${totals.actual}/${totals.committed}`}
          sub={`${totals.coverage}% · ${totals.gap > 0 ? `+${totals.gap}` : totals.gap} var`}
          icon={Users}
          tone="accent"
        />
        <Stat
          label="Man-hours"
          value={fmtHours(totals.actualHours)}
          sub={`of ${fmtHours(totals.projectedHours)}`}
          icon={UserCheck}
        />
        <Stat label="Extra duty" value={fmtHours(totals.otHours)} sub="MTD" icon={TrendingDown} tone="warning" />
        <Stat
          label="MTD attendance"
          value={`${totals.mtdPct}%`}
          sub="payroll period"
          icon={Gauge}
          tone={totals.mtdPct < 85 ? "destructive" : undefined}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search units…"
            className="h-9 rounded-xl pl-9"
          />
        </div>
        <Button variant="outline" className="h-9 shrink-0 rounded-xl px-3" onClick={exportCsv}>
          <Download className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">Export</span>
        </Button>
      </div>


      {loading ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Loading month-till-date attendance…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No units match this search.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const isOpen = !!expanded[r.unit.id];
            return (
              <div
                key={r.unit.id}
                className={cn(
                  "group overflow-hidden rounded-2xl border border-border/70 bg-card transition-all",
                  "hover:border-primary/40 hover:shadow-[0_8px_24px_-16px_rgba(0,0,0,0.45)]",
                  isOpen && "border-primary/40",
                )}
              >
                <div className="flex items-stretch">
                  {/* Whole row opens the muster roll. */}
                  <Link
                    to="/admin/attendance/$unitId"
                    params={{ unitId: r.unit.id }}
                    search={{ month: monthIdx, year }}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 sm:px-4"
                  >
                    <Dial value={r.mtdPct} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-sm font-semibold group-hover:text-primary">
                          {r.unit.name || r.unit.code}
                        </span>
                        <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {r.unitShift}h shift
                        </span>
                        <AttendanceStatusBadge status={r.status.attendance} />
                        <MoneyStatusBadge kind="payroll" status={r.status.payroll} />
                        <MoneyStatusBadge kind="invoice" status={r.status.invoice} />
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.unit.customer_name} · {r.contractCode}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground sm:hidden">
                        <span>
                          {r.actual}/{r.committed} deployed
                        </span>
                        <span>·</span>
                        <span>
                          {fmtHours(r.actualHours)} / {fmtHours(r.projectedHours)}
                        </span>
                      </div>
                    </div>

                    <div className="hidden shrink-0 items-center gap-5 pr-1 text-sm tabular-nums sm:flex">
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Deployed</div>
                        <div className="font-semibold">
                          {r.actual}
                          <span className="text-muted-foreground">/{r.committed}</span>
                        </div>
                      </div>
                      <VarianceChip committed={r.committed} actual={r.actual} />
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">MTD hours</div>
                        <div className="font-semibold">
                          {fmtHours(r.actualHours)}
                          <span className="text-muted-foreground"> / {fmtHours(r.projectedHours)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">ED</div>
                        <div className="font-semibold">{fmtHours(r.otHours)}</div>
                      </div>
                    </div>
                  </Link>

                  <button
                    type="button"
                    aria-label={isOpen ? "Hide breakdown" : "Show breakdown"}
                    onClick={() => setExpanded((p) => ({ ...p, [r.unit.id]: !p[r.unit.id] }))}
                    className="flex w-11 shrink-0 items-center justify-center border-l border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                  </button>
                </div>

                {isOpen && (
                  <div className="space-y-4 border-t border-border/60 bg-muted/25 px-3 py-3 sm:px-4">
                    {r.lines.length > 0 && (
                      <div>
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Role-wise commitment
                        </div>
                        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                          {r.lines.map((l) => (
                            <div
                              key={l.role}
                              className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2"
                            >
                              <span className="truncate text-xs font-medium">{l.role}</span>
                              <span className="flex items-center gap-2 text-xs tabular-nums">
                                <span className="font-semibold">
                                  {l.actual}
                                  <span className="text-muted-foreground">/{l.committed}</span>
                                </span>
                                <VarianceChip committed={l.committed} actual={l.actual} />
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Month-till-date per employee
                      </div>
                      {r.people.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border/60 bg-background/60 px-3 py-4 text-center text-xs text-muted-foreground">
                          No attendance marked for this unit yet this month.
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/70">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border/60 text-[10px] uppercase tracking-wide text-muted-foreground">
                                <th className="px-3 py-2 text-left font-medium">Employee</th>
                                <th className="px-2 py-2 text-right font-medium">Shift</th>
                                <th className="px-2 py-2 text-right font-medium">Days</th>
                                <th className="px-2 py-2 text-right font-medium">ED hrs</th>
                                <th className="px-2 py-2 text-right font-medium">Actual</th>
                                <th className="px-2 py-2 text-right font-medium">Projected</th>
                                <th className="px-3 py-2 text-right font-medium">MTD</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.people.map((p) => (
                                <tr key={p.id} className="border-t border-border/50 hover:bg-muted/40">
                                  <td className="px-3 py-1.5 font-medium">{p.name}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{p.shiftHours}h</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">{p.presentDays}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">
                                    {Math.round(p.otDays * p.shiftHours)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtHours(p.actualHours)}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                                    {fmtHours(p.projectedHours)}
                                  </td>
                                  <td className="px-3 py-1.5 text-right">
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
