import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  CalendarDays,
  Cake,
  ClipboardCheck,
  Package,
  PartyPopper,
  UserRound,
  Users,
  ArrowRight, ArrowUpRight,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCountUp } from "@/hooks/useCountUp";
import { nextOccurrence, ageFrom, yearsBetween } from "@/lib/people-insights";

export const Route = createFileRoute("/admin/employee-dashboard")({
  component: EmployeeDashboard,
});

type Me = {
  id: string;
  full_name: string;
  employee_code: string | null;
  photo_url: string | null;
  mobile: string | null;
  email: string | null;
  role_key: string | null;
  status: string | null;
  unit_id: string | null;
  designation_id: string | null;
  reports_to: string | null;
  date_of_birth: string | null;
  approved_at: string | null;
  created_at: string | null;
};

type Teammate = {
  id: string;
  full_name: string;
  employee_code: string | null;
  photo_url: string | null;
  date_of_birth: string | null;
  approved_at: string | null;
  created_at: string | null;
  designation_id: string | null;
  role_key: string | null;
  unit_id: string | null;
};

type Manager = {
  id: string;
  full_name: string;
  employee_code: string | null;
  photo_url: string | null;
  mobile: string | null;
  email: string | null;
  role_key: string | null;
  designation_id: string | null;
};

type Notif = { id: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null };

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmt(d: Date) { return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`; }
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]?.toUpperCase()??"").join("") || "?";
}

type Accent = "emerald" | "rose" | "amber" | "sky" | "indigo" | "violet";
const ACCENT_CHIP: Record<Accent, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  rose: "bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
  sky: "bg-sky-50 text-sky-700 ring-sky-200/70 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200/70 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-200/70 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20",
};
const ACCENT_BAR: Record<Accent, string> = {
  emerald: "bg-emerald-500", rose: "bg-rose-500", amber: "bg-amber-500",
  sky: "bg-sky-500", indigo: "bg-indigo-500", violet: "bg-violet-500",
};
const ACCENT_TILE_BG: Record<Accent, string> = {
  emerald: "bg-emerald-100/80 dark:bg-emerald-500/15",
  rose: "bg-rose-100/80 dark:bg-rose-500/15",
  amber: "bg-amber-100/80 dark:bg-amber-500/15",
  sky: "bg-sky-100/80 dark:bg-sky-500/15",
  indigo: "bg-indigo-100/80 dark:bg-indigo-500/15",
  violet: "bg-violet-100/80 dark:bg-violet-500/15",
};


function EmployeeDashboard() {
  const { user } = useAuth();
  const phone = user?.phone?.replace(/\D/g, "").slice(-10) ?? "";

  const meQ = useQuery({
    queryKey: ["me-emp", phone],
    enabled: !!phone,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("id,full_name,employee_code,photo_url,mobile,email,role_key,status,unit_id,designation_id,date_of_birth,approved_at,created_at")
        .eq("mobile", phone)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Me) ?? null;
    },
  });
  const me = meQ.data;

  const lookupsQ = useQuery({
    queryKey: ["me-emp-lookups", me?.unit_id, me?.designation_id],
    enabled: !!me,
    queryFn: async () => {
      const [u, d] = await Promise.all([
        me?.unit_id
          ? supabase.from("units").select("id,name,code,branch_id,customer_id,shift_start_time,shift_end_time,site_address").eq("id", me.unit_id).maybeSingle()
          : Promise.resolve({ data: null }),
        me?.designation_id
          ? supabase.from("designations").select("id,name").eq("id", me.designation_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return {
        unit: (u.data as unknown as { id: string; name: string; code: string; branch_id: string | null; customer_id: string | null; shift_start_time: string | null; shift_end_time: string | null; site_address: string | null } | null),
        designation: (d.data as unknown as { id: string; name: string } | null),
      };
    },
  });
  const unit = lookupsQ.data?.unit ?? null;
  const desig = lookupsQ.data?.designation ?? null;

  const monthStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  }, []);
  const monthEnd = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  }, []);
  const attQ = useQuery({
    queryKey: ["me-attendance", me?.id, monthStart],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_entries")
        .select("code,ot_hours,entry_date")
        .eq("candidate_id", me!.id)
        .gte("entry_date", monthStart)
        .lte("entry_date", monthEnd);
      if (error) throw error;
      return (data as unknown as { code: string; ot_hours: number; entry_date: string }[]) ?? [];
    },
  });
  const attStats = useMemo(() => {
    const rows = attQ.data ?? [];
    let present = 0, absent = 0, leave = 0, ot = 0;
    for (const r of rows) {
      const c = (r.code || "").toUpperCase();
      if (c === "A") absent++;
      else if (c === "L" || c === "LV") leave++;
      else if (c) present++;
      ot += Number(r.ot_hours || 0);
    }
    return { present, absent, leave, ot, total: rows.length };
  }, [attQ.data]);

  const myUnitsQ = useQuery({
    queryKey: ["me-units", me?.id, me?.unit_id],
    enabled: !!me?.id,
    queryFn: async () => {
      const set = new Set<string>();
      if (me?.unit_id) set.add(me.unit_id);
      const { data } = await supabase
        .from("candidate_units" as never)
        .select("unit_id")
        .eq("candidate_id", me!.id);
      for (const r of ((data as unknown) as Array<{ unit_id: string }>) ?? []) {
        if (r.unit_id) set.add(r.unit_id);
      }
      return Array.from(set);
    },
  });
  const myUnitIds = useMemo(() => myUnitsQ.data ?? [], [myUnitsQ.data]);

  const teamQ = useQuery({
    queryKey: ["me-team", myUnitIds.join(","), me?.id],
    enabled: !!me?.id && myUnitIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("id,full_name,employee_code,photo_url,date_of_birth,approved_at,created_at,designation_id")
        .in("unit_id", myUnitIds)
        .in("status", ["active", "approved"])
        .neq("id", me!.id)
        .order("full_name");
      if (error) throw error;
      return (data as unknown as Teammate[]) ?? [];
    },
  });
  const team = teamQ.data ?? [];

  const desigIds = useMemo(() => Array.from(new Set(team.map((t) => t.designation_id).filter(Boolean))) as string[], [team]);
  const desigNameQ = useQuery({
    queryKey: ["me-team-desig", desigIds.join(",")],
    enabled: desigIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("designations").select("id,name").in("id", desigIds);
      if (error) throw error;
      const m = new Map<string, string>();
      for (const d of (data as unknown as { id: string; name: string }[]) ?? []) m.set(d.id, d.name);
      return m;
    },
  });
  const desigMap = desigNameQ.data ?? new Map<string, string>();

  const issQ = useQuery({
    queryKey: ["me-iss-count", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inv_issuances")
        .select("id,status")
        .eq("destination_id", me!.id)
        .in("destination_type", ["guard", "field_officer"]);
      if (error) throw error;
      const rows = (data as unknown as { id: string; status: string }[]) ?? [];
      return { total: rows.length, pending: rows.filter((r) => r.status === "issued").length };
    },
  });

  const notifQ = useQuery({
    queryKey: ["me-notifs"],
    queryFn: async () => {
      const { data: { user: au } } = await supabase.auth.getUser();
      if (!au) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,body,link,created_at,read_at")
        .eq("user_id", au.id)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data as unknown as Notif[]) ?? [];
    },
  });
  const notifs = notifQ.data ?? [];

  const HORIZON = useMemo(() => {
    const today = new Date();
    const eoy = new Date(today.getFullYear(), 11, 31);
    return Math.round((eoy.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
  }, []);
  const birthdays = useMemo(() => {
    const list: Array<{ id: string; name: string; photo: string | null; days: number; date: Date; turningAge: number }> = [];
    for (const t of team) {
      if (!t.date_of_birth) continue;
      const { next, days } = nextOccurrence(t.date_of_birth);
      if (days <= HORIZON) list.push({ id: t.id, name: t.full_name, photo: t.photo_url, days, date: next, turningAge: yearsBetween(t.date_of_birth, next) });
    }
    return list.sort((a, b) => a.days - b.days);
  }, [team, HORIZON]);
  const anniversaries = useMemo(() => {
    const list: Array<{ id: string; name: string; photo: string | null; days: number; date: Date; years: number }> = [];
    for (const t of team) {
      const started = t.approved_at || t.created_at;
      if (!started) continue;
      const { next, days } = nextOccurrence(started);
      const years = yearsBetween(started, next);
      if (days <= HORIZON && years >= 1) list.push({ id: t.id, name: t.full_name, photo: t.photo_url, days, date: next, years });
    }
    return list.sort((a, b) => a.days - b.days);
  }, [team, HORIZON]);

  if (meQ.isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading your dashboard…</div>;
  if (!me) return <div className="p-4 text-sm text-muted-foreground">No employee profile found for this phone.</div>;

  const age = me.date_of_birth ? ageFrom(me.date_of_birth) : null;
  const started = me.approved_at || me.created_at;
  const tenureYears = started ? yearsBetween(started, new Date()) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${me.full_name.split(" ")[0] || "there"}`}
        description={desig?.name ? `${desig.name}${unit?.name ? ` · ${unit.name}` : ""}` : "Your workspace"}
        crumbs={[{ label: "My Dashboard" }]}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {/* Profile card — matches admin card aesthetic */}
          <section className="overflow-hidden rounded-[24px] border border-border/60 bg-card/70 p-5 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.85)_inset,0_24px_60px_-30px_rgba(15,23,42,0.22)]">
            <div className="flex items-start gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-secondary text-lg font-semibold ring-1 ring-border">
                {me.photo_url ? <img src={me.photo_url} alt="" className="h-full w-full object-cover" /> : initials(me.full_name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <div className="font-display text-lg font-bold text-foreground">{me.full_name}</div>
                  {me.employee_code && <div className="font-mono text-xs text-muted-foreground">{me.employee_code}</div>}
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-300">{me.status}</span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
                  <div><span className="font-medium text-foreground">Phone:</span> {me.mobile ?? "—"}</div>
                  <div><span className="font-medium text-foreground">Email:</span> {me.email || "—"}</div>
                  <div><span className="font-medium text-foreground">Designation:</span> {desig?.name ?? "—"}</div>
                  <div><span className="font-medium text-foreground">Unit:</span> {unit?.name ?? "—"}</div>
                  {age !== null && <div><span className="font-medium text-foreground">Age:</span> {age}</div>}
                  {tenureYears !== null && <div><span className="font-medium text-foreground">Tenure:</span> {tenureYears} yr</div>}
                </div>
              </div>
              <Link to="/admin/profile" className="shrink-0 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary">
                <UserRound className="mr-1 inline h-3.5 w-3.5" /> View profile
              </Link>
            </div>
          </section>

          {/* Stat tiles — match admin MetricTile aesthetic */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricTile icon={ClipboardCheck} label="Present days" value={attStats.present} accent="emerald" sub={new Date().toLocaleString("en-IN",{month:"long"})} />
            <MetricTile icon={ClipboardCheck} label="Absent" value={attStats.absent} accent="rose" />
            <MetricTile icon={ClipboardCheck} label="Leaves" value={attStats.leave} accent="amber" />
            <MetricTile icon={Package} label="Uniform items" value={issQ.data?.total ?? 0} accent="sky" sub={issQ.data?.pending ? `${issQ.data.pending} pending OTP` : undefined} to="/admin/my-inventory" />
          </section>

          {/* Duty & unit */}
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[24px] border border-border/60 bg-card/70 p-5 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.85)_inset,0_24px_60px_-30px_rgba(15,23,42,0.22)]">
              <div className="mb-3 flex items-center gap-2">
                <span className={`grid h-8 w-8 place-items-center rounded-xl ring-1 ring-inset ${ACCENT_CHIP.indigo}`}><CalendarDays className="h-3.5 w-3.5" /></span>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Today</div>
                  <div className="font-display text-[15px] font-bold leading-tight">Your duty</div>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Shift start</dt>
                <dd className="font-medium tabular-nums">{unit?.shift_start_time || "—"}</dd>
                <dt className="text-muted-foreground">Shift end</dt>
                <dd className="font-medium tabular-nums">{unit?.shift_end_time || "—"}</dd>
                <dt className="text-muted-foreground">OT this month</dt>
                <dd className="font-medium tabular-nums">{attStats.ot} hrs</dd>
                <dt className="text-muted-foreground">Site</dt>
                <dd className="truncate font-medium">{unit?.site_address || unit?.name || "—"}</dd>
              </dl>
            </div>

            <div className="rounded-[24px] border border-border/60 bg-card/70 p-5 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.85)_inset,0_24px_60px_-30px_rgba(15,23,42,0.22)]">
              <div className="mb-3 flex items-center gap-2">
                <span className={`grid h-8 w-8 place-items-center rounded-xl ring-1 ring-inset ${ACCENT_CHIP.violet}`}><Building2 className="h-3.5 w-3.5" /></span>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Assignment</div>
                  <div className="font-display text-[15px] font-bold leading-tight">Unit</div>
                </div>
              </div>
              <div className="font-display text-lg font-bold">{unit?.name ?? "Not assigned"}</div>
              {unit?.code && <div className="font-mono text-xs text-muted-foreground">{unit.code}</div>}
              <div className="mt-3 flex gap-2">
                <div className="flex-1 rounded-xl bg-secondary/60 px-3 py-2 text-center ring-1 ring-border">
                  <div className="font-display text-lg font-bold tabular-nums">{team.length + 1}</div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Team size</div>
                </div>
                <Link to="/admin/my-inventory" className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-center text-sm font-semibold hover:bg-secondary">
                  My Uniform <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </section>

          {/* Team roster */}
          <section className="overflow-hidden rounded-[24px] border border-border/60 bg-card/70 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.85)_inset,0_24px_60px_-30px_rgba(15,23,42,0.22)]">
            <header className="flex items-center gap-3 border-b border-border/50 bg-card px-5 py-3.5">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${ACCENT_CHIP.indigo}`}><Users className="h-3.5 w-3.5" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Your unit</div>
                <div className="font-display text-[15px] font-bold text-foreground leading-tight">Teammates</div>
              </div>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/15 px-1.5 text-[10px] font-bold text-accent ring-1 ring-inset ring-accent/20">{team.length}</span>
            </header>
            {team.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">No teammates yet.</div>
            ) : (
              <ul className="max-h-[320px] divide-y divide-border/60 overflow-y-auto">
                {team.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-accent/15 text-[11px] font-bold text-accent ring-1 ring-inset ring-accent/20">
                      {t.photo_url ? <img src={t.photo_url} alt="" className="h-full w-full object-cover" /> : initials(t.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-foreground">{t.full_name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{t.designation_id ? desigMap.get(t.designation_id) ?? "" : ""}</div>
                    </div>
                    {t.employee_code && <div className="shrink-0 font-mono text-[11px] text-muted-foreground">{t.employee_code}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
          <SidePanel Icon={Bell} accent="indigo" eyebrow="Latest" title="Notifications" count={notifs.length}>
            {notifs.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">Nothing new.</div>
            ) : (
              <ul className="divide-y divide-border/60">
                {notifs.map((n) => (
                  <li key={n.id}>
                    <Link
                      to={n.link ?? "/admin/notifications"}
                      className={`block px-4 py-2.5 transition-colors hover:bg-accent/5 ${n.read_at ? "" : "bg-accent/8"}`}
                    >
                      <div className="text-[13px] font-semibold text-foreground">{n.title}</div>
                      {n.body && <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{n.body}</div>}
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{new Date(n.created_at).toLocaleString("en-IN")}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SidePanel>

          <SidePanel Icon={Cake} accent="rose" eyebrow="This year" title="Upcoming Birthdays" count={birthdays.length}>
            {birthdays.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">No more birthdays this year.</div>
            ) : (
              <ul className="divide-y divide-border/60">
                {birthdays.slice(0, 25).map((b) => {
                  const today = b.days === 0;
                  return (
                    <li key={b.id} className={`flex items-center gap-3 px-4 py-2.5 ${today ? "bg-accent/8" : ""}`}>
                      <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-accent/15 text-[11px] font-bold text-accent ring-1 ring-inset ring-accent/20">
                        {b.photo ? <img src={b.photo} alt="" className="h-full w-full object-cover" /> : initials(b.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-foreground">{b.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{fmt(b.date)} · turning {b.turningAge}</div>
                      </div>
                      <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${today ? "text-accent" : "text-muted-foreground"}`}>{today ? "Today" : `in ${b.days}d`}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SidePanel>

          <SidePanel Icon={PartyPopper} accent="amber" eyebrow="This year" title="Work Anniversaries" count={anniversaries.length}>
            {anniversaries.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">No more anniversaries this year.</div>
            ) : (
              <ul className="divide-y divide-border/60">
                {anniversaries.slice(0, 25).map((a) => {
                  const today = a.days === 0;
                  return (
                    <li key={a.id} className={`flex items-center gap-3 px-4 py-2.5 ${today ? "bg-accent/8" : ""}`}>
                      <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-accent/15 text-[11px] font-bold text-accent ring-1 ring-inset ring-accent/20">
                        {a.photo ? <img src={a.photo} alt="" className="h-full w-full object-cover" /> : initials(a.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-foreground">{a.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{fmt(a.date)} · {a.years} yr{a.years===1?"":"s"} with RGS</div>
                      </div>
                      <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${today ? "text-accent" : "text-muted-foreground"}`}>{today ? "Today" : `in ${a.days}d`}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SidePanel>
        </div>
      </div>
    </div>
  );
}

function SidePanel({
  Icon, accent, eyebrow, title, count, children,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  accent: Accent;
  eyebrow: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-border/60 bg-card/70 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.85)_inset,0_24px_60px_-30px_rgba(15,23,42,0.22)]">
      <header className="flex items-center gap-3 border-b border-border/50 bg-card px-5 py-3.5">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${ACCENT_CHIP[accent]}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</div>
          <div className="font-display text-[15px] font-bold text-foreground leading-tight">{title}</div>
        </div>
        {count > 0 && (
          <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 px-1.5 text-[10px] font-bold text-accent ring-1 ring-inset ring-accent/20">
            {count}
          </span>
        )}
      </header>
      <div className="max-h-[320px] overflow-y-auto">{children}</div>
    </section>
  );
}

function MetricTile({
  icon: Icon, label, value, accent, sub, to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent: Accent;
  sub?: string;
  to?: string;
}) {
  const display = useCountUp(value);
  const inner = (
    <>
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[15px] font-semibold text-foreground leading-tight">{label}</div>
          {sub && <div className="mt-1 text-[11px] text-muted-foreground truncate">{sub}</div>}
        </div>
        {to && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-foreground shadow-sm ring-1 ring-black/5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="relative mt-auto flex items-end justify-between gap-3">
        <div className="font-display text-[46px] font-bold leading-none tabular-nums tracking-tight text-foreground">{display}</div>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/80 ring-1 ring-inset ${ACCENT_CHIP[accent]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </>
  );
  const cls = `group relative flex h-[188px] flex-col overflow-hidden rounded-[26px] border border-border/40 ${ACCENT_TILE_BG[accent]} p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg`;
  return to ? <Link to={to} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;

}
