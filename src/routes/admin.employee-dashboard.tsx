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
  ArrowUpRight,
  ShieldCheck,
  Phone,
  MapPin,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";


import { supabase } from "@/integrations/supabase/client";

import { useAuth } from "@/lib/auth";
import { useCountUp } from "@/hooks/useCountUp";
import { nextOccurrence, ageFrom, yearsBetween } from "@/lib/people-insights";
import { DashboardSkeleton } from "@/components/Skeletons";
import { MarkAttendanceCard } from "@/components/MarkAttendanceCard";


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
        .select("id,full_name,employee_code,photo_url,mobile,email,role_key,status,unit_id,designation_id,reports_to,date_of_birth,approved_at,created_at")
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
        .select("unit_id,is_primary")
        .eq("candidate_id", me!.id);
      const rows = ((data as unknown) as Array<{ unit_id: string; is_primary: boolean | null }>) ?? [];
      for (const r of rows) {
        if (r.unit_id) set.add(r.unit_id);
      }
      const primaryId = rows.find((r) => r.is_primary)?.unit_id ?? null;
      return { ids: Array.from(set), primaryId };
    },
  });
  const myUnitIds = useMemo(() => myUnitsQ.data?.ids ?? [], [myUnitsQ.data]);
  const primaryUnitId = myUnitsQ.data?.primaryId ?? null;


  const teamQ = useQuery({
    queryKey: ["me-team", myUnitIds.join(","), me?.id],
    enabled: !!me?.id && myUnitIds.length > 0,
    queryFn: async () => {
      // Guards mapped via candidates.unit_id
      const { data: direct, error } = await supabase
        .from("candidates")
        .select("id,full_name,employee_code,photo_url,date_of_birth,approved_at,created_at,designation_id,role_key,unit_id")
        .in("unit_id", myUnitIds)
        .in("status", ["active", "approved"])
        .neq("id", me!.id)
        .order("full_name");
      if (error) throw error;
      // Guards mapped via candidate_units (many-to-many)
      const { data: cu } = await supabase
        .from("candidate_units" as never)
        .select("candidate_id")
        .in("unit_id", myUnitIds);
      const extraIds = Array.from(
        new Set(((cu as unknown as Array<{ candidate_id: string }>) ?? []).map((r) => r.candidate_id).filter((id) => id && id !== me!.id)),
      );
      let extras: Teammate[] = [];
      if (extraIds.length) {
        const { data: ex } = await supabase
          .from("candidates")
          .select("id,full_name,employee_code,photo_url,date_of_birth,approved_at,created_at,designation_id,role_key,unit_id")
          .in("id", extraIds)
          .in("status", ["active", "approved"]);
        extras = (ex as unknown as Teammate[]) ?? [];
      }
      const map = new Map<string, Teammate>();
      for (const t of (direct as unknown as Teammate[]) ?? []) map.set(t.id, t);
      for (const t of extras) if (!map.has(t.id)) map.set(t.id, t);
      return Array.from(map.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });
  const team = teamQ.data ?? [];
  const guardTeam = useMemo(
    () => team.filter((t) => t.role_key === "guard" || t.role_key === "security_guard"),
    [team],
  );

  // Names of all units the employee is part of
  const unitsListQ = useQuery({
    queryKey: ["me-units-list", myUnitIds.join(",")],
    enabled: myUnitIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id,name,code,latitude,longitude")
        .in("id", myUnitIds);
      if (error) throw error;
      return (data as unknown as Array<{ id: string; name: string; code: string | null; latitude: number | null; longitude: number | null }>) ?? [];
    },
  });
  const myUnits = unitsListQ.data ?? [];
  const isGuard = me?.role_key === "guard" || me?.role_key === "security_guard";
  // Attendance can only be marked at the primary unit. All other units are
  // reliever units where the guard is only paid for extra duty (ED).
  const allowedUnits = useMemo(() => {
    const list = myUnits.map((u) => ({ id: u.id, name: u.name, latitude: u.latitude, longitude: u.longitude }));
    if (!isGuard || !primaryUnitId) return list;
    const primary = list.filter((u) => u.id === primaryUnitId);
    return primary.length ? primary : list;
  }, [myUnits, isGuard, primaryUnitId]);



  // Reporting manager (field officer)
  const managerQ = useQuery({
    queryKey: ["me-manager", me?.reports_to],
    enabled: !!me?.reports_to,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("id,full_name,employee_code,photo_url,mobile,email,role_key,designation_id")
        .eq("id", me!.reports_to!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Manager) ?? null;
    },
  });
  const manager = managerQ.data ?? null;


  const desigIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of team) if (t.designation_id) ids.add(t.designation_id);
    if (manager?.designation_id) ids.add(manager.designation_id);
    return Array.from(ids);
  }, [team, manager]);
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

  if (meQ.isLoading) return <DashboardSkeleton />;
  if (!me) return <div className="p-4 text-sm text-muted-foreground">No employee profile found for this phone.</div>;

  const age = me.date_of_birth ? ageFrom(me.date_of_birth) : null;
  const started = me.approved_at || me.created_at;
  const tenureYears = started ? yearsBetween(started, new Date()) : null;

  return (
    <div className="space-y-5">

      {/* Profile hero — matches Field Officer dashboard */}
      <section className="relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 text-white shadow-[0_20px_50px_-24px_rgba(15,23,42,0.55)] sm:p-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-accent/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-emerald-400/15 blur-3xl" />

        <div className="relative flex items-center gap-3 sm:gap-4">
          <div className="relative shrink-0">
            <div className="rounded-full bg-white/10 p-[3px] ring-1 ring-white/20 backdrop-blur">
              {me.photo_url ? (
                <img
                  src={me.photo_url}
                  alt={me.full_name}
                  className="!aspect-square h-16 w-16 !rounded-full object-cover sm:h-20 sm:w-20"
                />
              ) : (
                <div className="grid !aspect-square h-16 w-16 place-items-center !rounded-full bg-accent font-display text-lg font-bold text-accent-foreground sm:h-20 sm:w-20">
                  {initials(me.full_name)}
                </div>
              )}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white shadow ring-2 ring-slate-900 sm:h-6 sm:w-6">
              <ShieldCheck className="h-3 w-3" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
              {(me.role_key || "employee").replace(/_/g, " ")}
            </div>
            <div className="mt-0.5 truncate font-display text-lg font-bold tracking-tight sm:text-2xl">
              {me.full_name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {me.employee_code && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 ring-1 ring-white/15">{me.employee_code}</span>
              )}
              {unit && (
                <span className="max-w-[180px] truncate rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-300/25">
                  {unit.name}
                </span>
              )}
              {desig?.name && (
                <span className="max-w-[160px] truncate rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 ring-1 ring-white/15">
                  {desig.name}
                </span>
              )}
            </div>
          </div>

          <Link
            to="/admin/profile"
            aria-label="Edit profile"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20"
          >
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        {(me.mobile || unit?.site_address) && (
          <div className="relative mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/75 sm:text-xs">
            {me.mobile && (
              <span className="inline-flex items-center gap-1.5"><Phone className="h-3 w-3" /><span className="tabular-nums">{me.mobile}</span></span>
            )}
            {(unit?.site_address || unit?.name) && (
              <span className="inline-flex items-center gap-1.5 min-w-0"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{unit?.site_address || unit?.name}</span></span>
            )}
          </div>
        )}

        <div className="relative mt-4 grid grid-cols-3 min-[320px]:grid-cols-3 gap-2 sm:gap-3">
          <HeroStat label="Present" value={attStats.present} tint="emerald" />
          <HeroStat label="ED hrs" value={attStats.ot} tint="sky" />
          <HeroStat label="Team" value={guardTeam.length + 1} tint="amber" />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {/* Pastel summary tiles — matches FO */}
          <section>
            <div className="mb-2 flex items-end justify-between sm:mb-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Overview</div>
                <h2 className="mt-0.5 font-display text-lg font-bold tracking-tight text-foreground sm:text-2xl">My Summary</h2>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
              <PastelTile palette="lime" label="Present days" value={attStats.present} hint={new Date().toLocaleString("en-IN",{month:"long"})} delta={0} deltaSuffix="" icon={ClipboardCheck} />
              <PastelTile palette="rose" label="Absent" value={attStats.absent} hint="this month" delta={0} deltaSuffix="" icon={ClipboardCheck} />
              <PastelTile palette="amber" label="Leaves" value={attStats.leave} hint="this month" delta={0} deltaSuffix="" icon={ClipboardCheck} />
              <PastelTile palette="teal" label="Uniform items" value={issQ.data?.total ?? 0} hint={issQ.data?.pending ? `${issQ.data.pending} pending OTP` : "in hand"} delta={0} deltaSuffix="" icon={Package} to="/admin/my-inventory" />
            </div>
          </section>


          {isGuard && (
            <MarkAttendanceCard
              candidateId={me.id}
              allowedUnits={allowedUnits}
              proximityThresholdM={300}
            />
          )}

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
                <dt className="text-muted-foreground">Extra duty this month</dt>
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
                  <div className="font-display text-[15px] font-bold leading-tight">Units ({myUnits.length})</div>
                </div>
              </div>
              {myUnits.length === 0 ? (
                <div className="text-sm text-muted-foreground">Not assigned</div>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {[...myUnits]
                      .sort((a, b) => Number(b.id === primaryUnitId) - Number(a.id === primaryUnitId))
                      .map((u) => {
                        const isPrimary = u.id === primaryUnitId;
                        return (
                          <li key={u.id} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 px-2.5 py-1.5 ring-1 ring-border">
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{u.name}</span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${
                                isPrimary
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                              }`}
                            >
                              {isPrimary ? "Primary" : "Reliever · ED"}
                            </span>
                            {u.code && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{u.code}</span>}
                          </li>
                        );
                      })}
                  </ul>
                  {isGuard && !primaryUnitId && (
                    <div className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20">
                      No primary unit assigned yet — ask your field officer to set one.
                    </div>
                  )}
                  {isGuard && primaryUnitId && myUnits.length > 1 && (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      Attendance is marked at your primary unit. Reliever units record extra duty (ED) only.
                    </div>
                  )}
                </>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-secondary/60 px-3 py-2 text-center ring-1 ring-border">
                  <div className="font-display text-lg font-bold tabular-nums">{guardTeam.length + 1}</div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Team size</div>
                </div>
                <Link to="/admin/my-inventory" className="flex items-center justify-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-center text-sm font-semibold hover:bg-secondary">
                  My Uniform <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </section>

          {/* Reporting manager */}
          <section className="rounded-[24px] border border-border/60 bg-card/70 p-5 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.85)_inset,0_24px_60px_-30px_rgba(15,23,42,0.22)]">
            <div className="mb-3 flex items-center gap-2">
              <span className={`grid h-8 w-8 place-items-center rounded-xl ring-1 ring-inset ${ACCENT_CHIP.sky}`}><UserRound className="h-3.5 w-3.5" /></span>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Reports to</div>
                <div className="font-display text-[15px] font-bold leading-tight">Reporting Manager</div>
              </div>
            </div>
            {!manager ? (
              <div className="text-sm text-muted-foreground">No reporting manager assigned yet.</div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-accent/15 text-[13px] font-bold text-accent ring-1 ring-inset ring-accent/20">
                  {manager.photo_url ? <img src={manager.photo_url} alt="" className="h-full w-full object-cover" /> : initials(manager.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{manager.full_name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {manager.designation_id ? desigMap.get(manager.designation_id) ?? "" : ""}
                    {manager.role_key ? ` · ${manager.role_key.replace(/_/g, " ")}` : ""}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {manager.employee_code && <span className="font-mono">{manager.employee_code}</span>}
                    {manager.mobile && <span>{manager.mobile}</span>}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Team roster */}
          <section className="overflow-hidden rounded-[24px] border border-border/60 bg-card/70 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.85)_inset,0_24px_60px_-30px_rgba(15,23,42,0.22)]">
            <header className="flex items-center gap-3 border-b border-border/50 bg-card px-5 py-3.5">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${ACCENT_CHIP.indigo}`}><Users className="h-3.5 w-3.5" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Your unit</div>
                <div className="font-display text-[15px] font-bold text-foreground leading-tight">Fellow guards</div>
              </div>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/15 px-1.5 text-[10px] font-bold text-accent ring-1 ring-inset ring-accent/20">{guardTeam.length}</span>
            </header>
            {guardTeam.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">No fellow guards in your unit yet.</div>
            ) : (
              <ul className="max-h-[320px] divide-y divide-border/60 overflow-y-auto">
                {guardTeam.map((t) => (
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

function HeroStat({ label, value, tint }: { label: string; value: number | string; tint: "sky" | "emerald" | "amber" }) {
  const dot = { sky: "bg-sky-400", emerald: "bg-emerald-400", amber: "bg-amber-400" }[tint];
  return (
    <div className="min-w-0 rounded-2xl bg-white/8 px-3 py-2.5 ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        <span className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-white/60">{label}</span>
      </div>
      <div className="mt-1 font-display text-[20px] font-bold tabular-nums leading-none text-white sm:text-2xl">{value}</div>
    </div>
  );
}

function PastelTile({
  palette, label, value, hint, delta, deltaSuffix, invertColor, icon: Icon, to,
}: {
  palette: "lime" | "teal" | "rose" | "amber";
  label: string; value: number | string; hint: string;
  delta: number; deltaSuffix: string; invertColor?: boolean;
  icon: React.ComponentType<{ className?: string }>; to?: string;
}) {
  const bg = {
    lime: "bg-[color-mix(in_oklab,oklch(0.75_0.16_140)_18%,var(--card))]",
    teal: "bg-[color-mix(in_oklab,oklch(0.75_0.12_195)_18%,var(--card))]",
    rose: "bg-[color-mix(in_oklab,oklch(0.72_0.16_20)_18%,var(--card))]",
    amber: "bg-[color-mix(in_oklab,oklch(0.82_0.14_75)_20%,var(--card))]",
  }[palette];
  const ring = {
    lime: "ring-[color-mix(in_oklab,oklch(0.75_0.16_140)_35%,transparent)]",
    teal: "ring-[color-mix(in_oklab,oklch(0.75_0.12_195)_35%,transparent)]",
    rose: "ring-[color-mix(in_oklab,oklch(0.72_0.16_20)_35%,transparent)]",
    amber: "ring-[color-mix(in_oklab,oklch(0.82_0.14_75)_40%,transparent)]",
  }[palette];

  const positive = invertColor ? delta < 0 : delta > 0;
  const negative = invertColor ? delta > 0 : delta < 0;
  const TrendIcon = delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const trendCls = delta === 0
    ? "bg-card/70 text-foreground/60"
    : positive ? "bg-card/85 text-emerald-700 dark:text-emerald-300"
    : negative ? "bg-card/85 text-rose-700 dark:text-rose-300"
    : "bg-card/70 text-foreground/60";

  const inner = (
    <div className={`relative flex h-full min-h-[86px] flex-col justify-between overflow-hidden rounded-2xl p-3 ring-1 ring-inset transition-transform hover:-translate-y-0.5 sm:min-h-[132px] sm:rounded-[26px] sm:p-5 ${bg} ${ring}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold leading-tight text-foreground/80 sm:text-[13px]">{label}</div>
          <div className="mt-0.5 line-clamp-1 text-[10px] text-foreground/60 sm:text-[11px]">{hint}</div>
        </div>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-card/80 text-foreground/70 shadow-sm sm:h-9 sm:w-9">
          <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2 sm:gap-3">
        <div className="font-display text-[22px] font-bold leading-none tabular-nums tracking-tight text-foreground sm:text-[36px]">
          {value}
        </div>
        <div className="flex flex-col items-end gap-1 sm:gap-1.5">
          {delta !== 0 && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${trendCls}`}>
              <TrendIcon className="h-3 w-3" />
              {delta > 0 ? "+" : ""}{delta}{deltaSuffix}
            </span>
          )}
          <span className="hidden h-7 w-7 place-items-center rounded-full bg-card/70 text-foreground/70 sm:grid">
            <Icon className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

