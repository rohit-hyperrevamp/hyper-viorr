import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, ChevronLeft, ChevronRight, Clock, MapPin, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMonthPunches, type SelfPunch } from "@/lib/self-attendance";
import { MarkAttendanceCard } from "@/components/MarkAttendanceCard";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/my-attendance")({
  component: MyAttendancePage,
});

type CodeRow = { code: string; label: string; color: string | null; counts_as_present: boolean; is_leave: boolean };
type EntryRow = { entry_date: string; code: string; ot_hours: number | string | null };

function ym(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
}
function iso(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}
function fmtHM(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function duration(a: string | null, b: string | null) {
  if (!a || !b) return "—";
  const mins = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function MyAttendancePage() {
  const [me, setMe] = useState<{ candidate_id: string | null; name: string; code: string }>({
    candidate_id: null,
    name: "",
    code: "",
  });
  const [monthDate, setMonthDate] = useState<Date>(() => new Date());
  const [search, setSearch] = useState("");

  useEffect(() => {
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      const em = u.user?.email ?? "";
      const phone = em.match(/phone-(\d{10})@/)?.[1];
      if (!phone) return;
      const { data: c } = await supabase
        .from("candidates")
        .select("id,full_name,employee_code")
        .eq("mobile", phone)
        .maybeSingle();
      const row = c as { id?: string; full_name?: string; employee_code?: string } | null;
      setMe({
        candidate_id: row?.id ?? null,
        name: row?.full_name ?? "",
        code: row?.employee_code ?? "",
      });
    })();
  }, []);

  const ymKey = ym(monthDate);

  const codesQ = useQuery({
    queryKey: ["self-attendance-codes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_codes" as never)
        .select("code,label,color,counts_as_present,is_leave");
      return (data ?? []) as CodeRow[];
    },
  });

  const punchQ = useQuery({
    queryKey: ["self-attendance-month", me.candidate_id, ymKey],
    enabled: !!me.candidate_id,
    queryFn: () => fetchMonthPunches(me.candidate_id!, ymKey),
  });

  const entriesQ = useQuery({
    queryKey: ["self-attendance-entries-month", me.candidate_id, ymKey],
    enabled: !!me.candidate_id,
    queryFn: async () => {
      const [y, m] = ymKey.split("-").map(Number);
      const first = `${ymKey}-01`;
      const nextD = new Date(y, m, 1);
      const last = iso(nextD);
      const { data } = await supabase
        .from("attendance_entries")
        .select("entry_date,code,ot_hours")
        .eq("candidate_id", me.candidate_id!)
        .gte("entry_date", first)
        .lt("entry_date", last);
      return (data ?? []) as EntryRow[];
    },
  });

  const codeMap = useMemo(() => {
    const m = new Map<string, CodeRow>();
    for (const c of codesQ.data ?? []) m.set(c.code, c);
    return m;
  }, [codesQ.data]);

  const byDay = useMemo(() => {
    const m = new Map<string, { punch?: SelfPunch; entry?: EntryRow }>();
    for (const p of punchQ.data ?? []) m.set(p.punch_date, { ...(m.get(p.punch_date) || {}), punch: p });
    for (const e of entriesQ.data ?? []) m.set(e.entry_date, { ...(m.get(e.entry_date) || {}), entry: e });
    return m;
  }, [punchQ.data, entriesQ.data]);

  const days = useMemo(() => {
    const y = monthDate.getFullYear();
    const mo = monthDate.getMonth() + 1;
    const n = daysInMonth(y, mo);
    const todayIso = iso(new Date());
    const list: Array<{ date: string; day: number; weekday: string; isFuture: boolean; isToday: boolean }> = [];
    for (let d = 1; d <= n; d++) {
      const date = iso(new Date(y, mo - 1, d));
      const wd = new Date(y, mo - 1, d).toLocaleDateString([], { weekday: "short" });
      list.push({ date, day: d, weekday: wd, isFuture: date > todayIso, isToday: date === todayIso });
    }
    return list.reverse();
  }, [monthDate]);

  const filteredDays = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return days;
    return days.filter((d) => d.date.includes(q) || String(d.day).padStart(2, "0") === q);
  }, [days, search]);

  const totals = useMemo(() => {
    let present = 0, absent = 0, leave = 0;
    for (const d of days) {
      if (d.isFuture) continue;
      const rec = byDay.get(d.date);
      const code = rec?.entry?.code ? codeMap.get(rec.entry.code) : undefined;
      if (rec?.punch?.check_in_at || code?.counts_as_present) present += 1;
      else if (code?.is_leave) leave += 1;
      else absent += 1;
    }
    return { present, absent, leave };
  }, [days, byDay, codeMap]);

  function shiftMonth(delta: number) {
    const d = new Date(monthDate);
    d.setDate(1);
    d.setMonth(d.getMonth() + delta);
    setMonthDate(d);
  }

  const monthLabel = monthDate.toLocaleDateString([], { month: "long", year: "numeric" });

  return (
    <div className="page-shell space-y-4 sm:space-y-6">
      <PageHeader
        title="My Attendance"
        description={me.name ? `${me.name}${me.code ? ` · ${me.code}` : ""}` : "Track your own check-in / check-out"}
        crumbs={[{ label: "Home", to: "/" }, { label: "My Attendance" }]}
      />


      <MarkAttendanceCard candidateId={me.candidate_id} />

      <section className="rounded-2xl border border-border/60 bg-card/90 p-3.5 shadow-sm backdrop-blur-xl sm:rounded-3xl sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[10rem] text-center">
              <div className="flex items-center justify-center gap-1.5 font-display text-base font-bold tracking-tight sm:text-lg">
                <Calendar className="h-4 w-4 text-muted-foreground" /> {monthLabel}
              </div>
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by day (e.g. 05) or date"
              className="h-10 rounded-xl pl-9 text-sm"
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
          <StatBox label="Present" value={totals.present} tone="emerald" />
          <StatBox label="Absent" value={totals.absent} tone="rose" />
          <StatBox label="Leave" value={totals.leave} tone="sky" />
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-border/50">
          <div className="hidden grid-cols-[80px_60px_120px_120px_1fr_1fr] gap-2 border-b border-border/50 bg-muted/40 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground md:grid">
            <div>Date</div>
            <div>Day</div>
            <div>Check-in</div>
            <div>Check-out</div>
            <div>Location</div>
            <div>Status</div>
          </div>
          <ul className="divide-y divide-border/50">
            {filteredDays.map((d) => {
              const rec = byDay.get(d.date);
              const p = rec?.punch;
              const code = rec?.entry?.code ? codeMap.get(rec.entry.code) : undefined;
              const badge = p?.check_in_at
                ? { label: p.check_out_at ? `Present · ${duration(p.check_in_at, p.check_out_at)}` : "On duty", tone: p.check_out_at ? "emerald" : "amber" as const }
                : code
                ? { label: `${code.label || code.code}`, tone: code.is_leave ? "sky" : code.counts_as_present ? "emerald" : "rose" as const }
                : d.isFuture
                ? { label: "—", tone: "muted" as const }
                : { label: "Absent", tone: "rose" as const };

              return (
                <li
                  key={d.date}
                  className={cn(
                    "grid grid-cols-[1fr_auto] gap-2 px-3 py-2.5 text-sm md:grid-cols-[80px_60px_120px_120px_1fr_1fr] md:items-center",
                    d.isToday && "bg-amber-50/40 dark:bg-amber-500/5",
                  )}
                >
                  <div className="md:contents">
                    <div className="tabular-nums font-semibold text-foreground">{d.date.slice(8)}</div>
                    <div className="hidden text-xs text-muted-foreground md:block">{d.weekday}</div>
                    <div className="hidden tabular-nums text-foreground md:block">{fmtHM(p?.check_in_at ?? null)}</div>
                    <div className="hidden tabular-nums text-foreground md:block">{fmtHM(p?.check_out_at ?? null)}</div>
                    <div className="hidden truncate text-xs text-muted-foreground md:flex md:items-center md:gap-1">
                      {p?.check_in_lat != null ? (
                        <>
                          <MapPin className="h-3 w-3" />
                          {p.check_in_lat.toFixed(4)}, {p.check_in_lng?.toFixed(4)}
                        </>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>
                  <div className="md:hidden text-xs text-muted-foreground">
                    <Clock className="mr-1 inline h-3 w-3" />
                    {fmtHM(p?.check_in_at ?? null)} → {fmtHM(p?.check_out_at ?? null)}
                  </div>
                  <div className="justify-self-end md:justify-self-start">
                    <StatusBadge label={badge.label} tone={badge.tone} />
                  </div>
                </li>
              );
            })}
            {filteredDays.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">No days match your search.</li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: "emerald" | "rose" | "sky" }) {
  const map = {
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20",
    rose: "bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-500/20",
    sky: "bg-sky-500/10 text-sky-700 dark:text-sky-400 ring-sky-500/20",
  } as const;
  return (
    <div className={cn("rounded-xl px-3 py-2.5 ring-1", map[tone])}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-0.5 font-display text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "emerald" | "rose" | "amber" | "sky" | "muted" }) {
  const map = {
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20",
    rose: "bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-500/20",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20",
    sky: "bg-sky-500/10 text-sky-700 dark:text-sky-400 ring-sky-500/20",
    muted: "bg-muted text-muted-foreground ring-border/60",
  } as const;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1", map[tone])}>
      {label}
    </span>
  );
}
