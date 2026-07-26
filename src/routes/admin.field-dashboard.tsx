import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Minus,
  Warehouse,
  Activity,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";


import { DashboardShell } from "@/components/LiveFeed";
import { LiveFieldOfficersCard } from "@/components/LiveFieldOfficersCard";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentPermissions } from "@/lib/rbac";
import { PeopleInsightsCard } from "@/components/PeopleInsightsCard";
import { usePeopleInsights } from "@/lib/people-insights";
import { MarkAttendanceCard } from "@/components/MarkAttendanceCard";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/admin/field-dashboard")({
  component: FieldOfficerDashboard,
});

type Guard = { id: string; full_name: string; designation: string };
type UnitNode = {
  id: string;
  code: string;
  name: string;
  customer_name: string;
  is_primary: boolean;
  guards: Guard[];
  pending_onboarding: number;
  open_demands: number;
  inventory_items: number;
};

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "FO";
}

function FieldOfficerDashboard() {
  const { roleKey, isSuperAdmin } = useCurrentPermissions();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      const em = data.user?.email ?? "";
      const m = em.match(/phone-(\d{10})@/);
      setPhone(m?.[1] ?? "");
      setEmail(em);
    });
  }, []);

  useEffect(() => {
    if (!isSuperAdmin && roleKey && roleKey !== "field_officer") {
      navigate({ to: "/admin/dashboard", replace: true });
    }
  }, [roleKey, isSuperAdmin, navigate]);

  const dashQ = useQuery({
    queryKey: ["field-officer-dashboard-v4", phone, userId],
    enabled: !!phone,
    queryFn: async () => {
      const { data: me } = await supabase
        .from("candidates")
        .select("id,full_name,employee_code,designation_id,photo_url")
        .eq("mobile", phone)
        .maybeSingle();
      const meId = (me as { id?: string } | null)?.id ?? null;
      const meName = (me as { full_name?: string } | null)?.full_name ?? "";
      const meCode = (me as { employee_code?: string } | null)?.employee_code ?? "";
      const mePhoto = (me as { photo_url?: string } | null)?.photo_url ?? "";

      const empty = {
        meId, meName, meCode, mePhoto,
        units: [] as UnitNode[],
        guardsTotal: 0, joinedThisWeek: 0, joinedLastWeek: 0,
        attendanceRateToday: 0, attendanceRateYesterday: 0,
        pendingOnboardingTotal: 0, pendingOnboardingLastWeek: 0,
        openDemandsTotal: 0, inventoryItemsTotal: 0,
        myStockQty: 0, myStockSkus: 0,
      };


      if (!meId) return empty;

      const [scopeRes, cuRes] = await Promise.all([
        supabase.from("employee_scope_assignments").select("scope_id,scope_type").eq("candidate_id", meId).eq("scope_type", "unit"),
        supabase.from("candidate_units").select("unit_id,is_primary").eq("candidate_id", meId),
      ]);
      const scopeUnitIds = ((scopeRes.data ?? []) as Array<{ scope_id: string }>).map((r) => r.scope_id);
      const legacyUnits = ((cuRes.data ?? []) as Array<{ unit_id: string; is_primary: boolean }>);
      const primaryMap = new Map(legacyUnits.map((r) => [r.unit_id, r.is_primary]));
      const unitIds = Array.from(new Set([...scopeUnitIds, ...legacyUnits.map((r) => r.unit_id)]));

      let guardQuery = supabase
        .from("candidates")
        .select("id,full_name,designation_id,unit_id,role_key,status,is_enabled,reports_to,created_by,created_at")
        .in("role_key", ["guard", "security_guard"])
        .eq("status", "active").eq("is_enabled", true);
      const teamFilters = [`reports_to.eq.${meId}`];
      if (userId) teamFilters.push(`created_by.eq.${userId}`);
      if (unitIds.length) teamFilters.push(`unit_id.in.(${unitIds.join(",")})`);
      guardQuery = guardQuery.or(teamFilters.join(","));
      const { data: myGuards } = await guardQuery;
      const guardList = (myGuards ?? []) as Array<{ id: string; full_name: string; designation_id: string | null; unit_id: string | null; created_at: string | null }>;

      const guardsMissingUnit = guardList.filter((g) => !g.unit_id).map((g) => g.id);
      const guardScopeUnit = new Map<string, string>();
      if (guardsMissingUnit.length) {
        const { data: gs } = await supabase.from("employee_scope_assignments").select("candidate_id,scope_id,scope_type").in("candidate_id", guardsMissingUnit).eq("scope_type", "unit");
        for (const r of (gs ?? []) as Array<{ candidate_id: string; scope_id: string }>) {
          if (!guardScopeUnit.has(r.candidate_id)) guardScopeUnit.set(r.candidate_id, r.scope_id);
        }
      }
      for (const g of guardList) {
        const uid = g.unit_id ?? guardScopeUnit.get(g.id) ?? null;
        if (uid && !unitIds.includes(uid)) unitIds.push(uid);
      }

      const [unitsRes, custRes, mineRes, desigsRes, codesRes] = await Promise.all([
        unitIds.length
          ? supabase.from("units").select("id,code,name,customer_id").in("id", unitIds)
          : Promise.resolve({ data: [] as Array<{ id: string; code: string; name: string; customer_id: string | null }> }),
        supabase.from("customers").select("id,name"),
        userId
          ? supabase.from("candidates").select("id,status,unit_id,created_by,created_at").eq("created_by", userId)
          : Promise.resolve({ data: [] as Array<{ id: string; status: string; unit_id: string | null; created_by: string | null; created_at: string | null }> }),
        supabase.from("designations").select("id,name"),
        supabase.from("attendance_codes").select("code,counts_as_present"),
      ]);

      const desigMap = new Map(((desigsRes.data ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]));
      const custMap = new Map(((custRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
      const presentCodes = new Set(((codesRes.data ?? []) as Array<{ code: string; counts_as_present: boolean }>).filter((c) => c.counts_as_present).map((c) => c.code));

      const guardsByUnit = new Map<string, Guard[]>();
      const UNASSIGNED = "__unassigned__";
      const guardIdToUnit = new Map<string, string>();
      for (const g of guardList) {
        const uid = g.unit_id ?? guardScopeUnit.get(g.id) ?? UNASSIGNED;
        guardIdToUnit.set(g.id, uid);
        const arr = guardsByUnit.get(uid) ?? [];
        arr.push({ id: g.id, full_name: g.full_name, designation: (g.designation_id && desigMap.get(g.designation_id)) || "—" });
        guardsByUnit.set(uid, arr);
      }

      const today = isoDaysAgo(0);
      const yday = isoDaysAgo(1);
      const guardIds = guardList.map((g) => g.id);
      let presentToday = 0, totalToday = 0, presentYday = 0, totalYday = 0;
      if (guardIds.length) {
        const { data: entries } = await supabase.from("attendance_entries").select("candidate_id,code,entry_date").in("entry_date", [today, yday]).in("candidate_id", guardIds);
        for (const e of (entries ?? []) as Array<{ candidate_id: string; code: string; entry_date: string }>) {
          if (e.entry_date === today) { totalToday += 1; if (presentCodes.has(e.code)) presentToday += 1; }
          else { totalYday += 1; if (presentCodes.has(e.code)) presentYday += 1; }
        }
      }
      const attendanceRateToday = totalToday ? Math.round((presentToday / totalToday) * 100) : 0;
      const attendanceRateYesterday = totalYday ? Math.round((presentYday / totalYday) * 100) : 0;

      const mine = (mineRes.data ?? []) as Array<{ status: string; unit_id: string | null; created_at: string | null }>;
      const weekAgoIso = isoDaysAgo(7);
      const twoWeeksAgoIso = isoDaysAgo(14);
      const pendingOnboardingTotal = mine.filter((r) => ["pending", "rejected", "draft"].includes(r.status)).length;
      const pendingOnboardingLastWeek = mine.filter((r) => {
        const d = r.created_at ?? "";
        return d && d >= twoWeeksAgoIso && d < weekAgoIso && ["pending", "rejected", "draft"].includes(r.status);
      }).length;
      const pendingByUnit = new Map<string, number>();
      for (const c of mine) {
        if (!["pending", "rejected", "draft"].includes(c.status)) continue;
        const uid = c.unit_id ?? UNASSIGNED;
        pendingByUnit.set(uid, (pendingByUnit.get(uid) ?? 0) + 1);
      }

      let joinedThisWeek = 0, joinedLastWeek = 0;
      for (const g of guardList) {
        const d = g.created_at ?? "";
        if (!d) continue;
        if (d >= weekAgoIso) joinedThisWeek += 1;
        else if (d >= twoWeeksAgoIso) joinedLastWeek += 1;
      }

      const demandsByUnit = new Map<string, number>();
      const inventoryByUnit = new Map<string, number>();
      try {
        const teamIds = [meId, ...guardIds];
        const orClauses = [`requested_by.in.(${teamIds.join(",")})`];
        if (unitIds.length) orClauses.push(`unit_id.in.(${unitIds.join(",")})`);
        const { data: demands } = await supabase.from("inv_demands" as never).select("id,status,unit_id,requested_by").or(orClauses.join(",")).in("status", ["pending", "approved", "partial", "open", "raised", "submitted"]);
        for (const d of (demands ?? []) as Array<{ unit_id: string | null }>) {
          const uid = d.unit_id ?? UNASSIGNED;
          demandsByUnit.set(uid, (demandsByUnit.get(uid) ?? 0) + 1);
        }
      } catch { /* ignore */ }
      let myStockQty = 0;
      let myStockSkus = 0;
      try {
        const { data: myBal } = await supabase.from("inv_stock_balances" as never).select("item_id,size_value,qty").eq("location_type", "field_officer").eq("location_id", meId);
        for (const b of (myBal ?? []) as Array<{ qty: number }>) {
          const q = Number(b.qty) || 0;
          if (q > 0) { myStockQty += q; myStockSkus += 1; }
        }
        if (guardIds.length) {
          const { data: bal } = await supabase.from("inv_stock_balances" as never).select("location_type,location_id,qty").in("location_type", ["guard", "security_guard", "field_officer"]).in("location_id", [meId, ...guardIds]);
          for (const b of (bal ?? []) as Array<{ location_id: string; qty: number }>) {
            const uid = guardIdToUnit.get(b.location_id) ?? UNASSIGNED;
            if (b.qty > 0) inventoryByUnit.set(uid, (inventoryByUnit.get(uid) ?? 0) + 1);
          }
        }
      } catch { /* ignore */ }

      const rawUnits = (unitsRes.data ?? []) as Array<{ id: string; code: string; name: string; customer_id: string | null }>;
      const units: UnitNode[] = rawUnits.map((u) => ({
        id: u.id, code: u.code, name: u.name,
        customer_name: (u.customer_id && custMap.get(u.customer_id)) || "—",
        is_primary: primaryMap.get(u.id) ?? false,
        guards: guardsByUnit.get(u.id) ?? [],
        pending_onboarding: pendingByUnit.get(u.id) ?? 0,
        open_demands: demandsByUnit.get(u.id) ?? 0,
        inventory_items: inventoryByUnit.get(u.id) ?? 0,
      })).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name));

      const orphaned = guardsByUnit.get(UNASSIGNED) ?? [];
      const orphPending = pendingByUnit.get(UNASSIGNED) ?? 0;
      if (orphaned.length || orphPending) {
        units.push({
          id: UNASSIGNED, code: "—", name: "Unassigned", customer_name: "Map these to a unit",
          is_primary: false, guards: orphaned, pending_onboarding: orphPending,
          open_demands: demandsByUnit.get(UNASSIGNED) ?? 0, inventory_items: inventoryByUnit.get(UNASSIGNED) ?? 0,
        });
      }

      const guardsTotal = units.reduce((s, u) => s + u.guards.length, 0);
      const openDemandsTotal = units.reduce((s, u) => s + u.open_demands, 0);
      const inventoryItemsTotal = units.reduce((s, u) => s + u.inventory_items, 0);
      return {
        meId, meName, meCode, mePhoto, units, guardsTotal, joinedThisWeek, joinedLastWeek,
        attendanceRateToday, attendanceRateYesterday, pendingOnboardingTotal,
        pendingOnboardingLastWeek, openDemandsTotal, inventoryItemsTotal,
        myStockQty, myStockSkus,
      };


    },
  });

  const data = dashQ.data;
  const isLoading = dashQ.isLoading;
  const units = useMemo(() => data?.units ?? [], [data?.units]);

  const primaryUnit = units.find((u) => u.is_primary) ?? units[0];
  const teamDelta = (data?.joinedThisWeek ?? 0) - (data?.joinedLastWeek ?? 0);
  const attnDelta = (data?.attendanceRateToday ?? 0) - (data?.attendanceRateYesterday ?? 0);
  const onbDelta = (data?.pendingOnboardingTotal ?? 0) - (data?.pendingOnboardingLastWeek ?? 0);
  const totalListings = data?.guardsTotal ?? 0;
  const attnPresent = Math.round(((data?.attendanceRateToday ?? 0) / 100) * totalListings);
  const totalItems = data?.inventoryItemsTotal ?? 0;

  return (
    <DashboardShell rightExtras={<FoPeopleInsights />}>
      {/* Profile hero — modern gradient card with circular avatar */}
      <section className="relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 text-white shadow-[0_20px_50px_-24px_rgba(15,23,42,0.55)] sm:p-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-accent/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-emerald-400/15 blur-3xl" />

        <div className="relative flex items-center gap-3 sm:gap-4">
          <div className="relative shrink-0">
            <div className="rounded-full bg-white/10 p-[3px] ring-1 ring-white/20 backdrop-blur">
              {data?.mePhoto ? (
                <img
                  src={data.mePhoto}
                  alt={data?.meName || "Profile"}
                  className="!aspect-square h-16 w-16 !rounded-full object-cover sm:h-20 sm:w-20"
                />
              ) : (
                <div className="grid !aspect-square h-16 w-16 place-items-center !rounded-full bg-accent font-display text-lg font-bold text-accent-foreground sm:h-20 sm:w-20">
                  {initials(data?.meName || "FO")}
                </div>
              )}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white shadow ring-2 ring-slate-900 sm:h-6 sm:w-6">
              <ShieldCheck className="h-3 w-3" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">Field Officer</div>
            <div className="mt-0.5 truncate font-display text-lg font-bold tracking-tight sm:text-2xl">
              {data?.meName || (isLoading ? "…" : "Welcome")}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {data?.meCode && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 ring-1 ring-white/15">{data.meCode}</span>
              )}
              {primaryUnit && (
                <span className="max-w-[160px] truncate rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-300/25">
                  {primaryUnit.name}
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

        {(phone || email) && (
          <div className="relative mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/75 sm:text-xs">
            {phone && (
              <span className="inline-flex items-center gap-1.5"><Phone className="h-3 w-3" /><span className="tabular-nums">+91 {phone}</span></span>
            )}
            {primaryUnit && (
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-3 w-3" /><span className="truncate">{primaryUnit.customer_name}</span></span>
            )}
          </div>
        )}

        <div className="relative mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <HeroStat label="Team" value={totalListings} tint="sky" />
          <HeroStat label="Present" value={attnPresent} tint="emerald" />
          <HeroStat label="Items" value={totalItems} tint="amber" />
        </div>
      </section>


      <MarkAttendanceCard candidateId={data?.meId ?? null} />



      {/* Pastel summary tiles — "My Summary" */}
      <section>
        <div className="mb-2 flex items-end justify-between sm:mb-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Overview</div>
            <h2 className="mt-0.5 font-display text-lg font-bold tracking-tight text-foreground sm:text-2xl">My Summary</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
          <PastelTile
            palette="lime"
            label="Team size"
            value={totalListings}
            hint={`${data?.joinedThisWeek ?? 0} joined this week`}
            delta={teamDelta} deltaSuffix=" new"
            icon={ShieldCheck}
          />
          <PastelTile
            palette="teal"
            label="Attendance today"
            value={`${data?.attendanceRateToday ?? 0}%`}
            hint={`Yesterday ${data?.attendanceRateYesterday ?? 0}%`}
            delta={attnDelta} deltaSuffix="pp"
            icon={Activity}
          />
          <PastelTile
            palette="rose"
            label="Pending onboarding"
            value={data?.pendingOnboardingTotal ?? 0}
            hint="vs last week"
            delta={onbDelta} deltaSuffix="" invertColor
            icon={ClipboardList}
            to="/admin/employees"
          />
          <PastelTile
            palette="amber"
            label="My stock available"
            value={data?.myStockQty ?? 0}
            hint={`${data?.myStockSkus ?? 0} SKU${(data?.myStockSkus ?? 0) === 1 ? "" : "s"} in hand`}
            delta={0} deltaSuffix=""
            icon={Warehouse}
            to="/admin/inventory/stock"
          />
        </div>
      </section>


      {/* Units list */}
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-sm backdrop-blur-xl sm:rounded-[28px]">
        <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-3 sm:px-6 sm:py-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">New objects ({units.length})</div>
            <h2 className="mt-0.5 font-display text-lg font-bold text-foreground sm:text-xl">My units</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Tap to see the team and take action.</p>
          </div>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
            {units.length} unit{units.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="divide-y divide-border/50">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : units.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-12 text-center">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/10 text-accent"><Sparkles className="h-5 w-5" /></div>
              <div className="text-sm font-semibold text-foreground">No units yet</div>
              <div className="text-xs text-muted-foreground">Ask HR to map you to your unit(s).</div>
            </div>
          ) : (
            units.map((u) => <UnitRow key={u.id} unit={u} />)
          )}
        </div>
      </section>

    </DashboardShell>
  );
}

function FoPeopleInsights() {
  const { isLoading, birthdays, anniversaries } = usePeopleInsights();
  return (
    <div className="flex flex-col gap-4">
      <LiveFieldOfficersCard />
      <PeopleInsightsCard kind="birthdays" items={birthdays} isLoading={isLoading} />
      <PeopleInsightsCard kind="anniversaries" items={anniversaries} isLoading={isLoading} />
    </div>
  );
}


function StatBar({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0 rounded-lg bg-secondary/60 px-2 py-2 text-center sm:rounded-xl sm:px-3 sm:py-3">
      <div className="truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:text-[10px]">{label}</div>
      <div className="mt-0.5 font-display text-base font-bold tabular-nums leading-tight tracking-tight text-foreground sm:text-2xl">{value}</div>
    </div>
  );
}

function HeroStat({ label, value, tint }: { label: string; value: number | string; tint: "sky" | "emerald" | "amber" }) {
  const dot = { sky: "bg-sky-400", emerald: "bg-emerald-400", amber: "bg-amber-400" }[tint];
  return (
    <div className="min-w-0 rounded-2xl bg-white/8 px-3 py-2.5 ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        <span className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-white/60">{label}</span>
      </div>
      <div className="mt-1 font-display text-xl font-bold tabular-nums leading-none text-white sm:text-2xl">{value}</div>
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
        <div className="font-display text-[24px] font-bold leading-none tabular-nums tracking-tight text-foreground sm:text-[44px]">
          {value}
        </div>
        <div className="flex flex-col items-end gap-1 sm:gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${trendCls}`}>
            <TrendIcon className="h-3 w-3" />
            {delta > 0 ? "+" : ""}{delta}{deltaSuffix}
          </span>
          <span className="hidden h-7 w-7 place-items-center rounded-full bg-card/70 text-foreground/70 sm:grid">
            <Icon className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

function UnitRow({ unit }: { unit: UnitNode }) {
  const [open, setOpen] = useState(false);
  const total = unit.guards.length;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition hover:bg-secondary/40 sm:gap-4 sm:px-6 sm:py-4"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent sm:h-8 sm:w-8 sm:rounded-xl">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 truncate text-[13px] font-semibold sm:text-sm">
              {unit.name}
              {unit.is_primary && (
                <span className="inline-flex rounded-full bg-emerald-500/15 dark:bg-emerald-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Primary</span>
              )}
            </div>
            <div className="truncate text-[11px] text-muted-foreground sm:text-xs">{unit.customer_name} · <span className="font-mono">{unit.code}</span></div>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 text-[11px] font-medium sm:flex">
          <Pill tone="slate" value={total} label="team" />
          <Pill tone="amber" value={unit.pending_onboarding} label="pending" />
          <Pill tone="violet" value={unit.open_demands} label="demands" />
          <Pill tone="cyan" value={unit.inventory_items} label="items" />
        </div>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/40 bg-secondary/20 px-3.5 py-3 sm:px-6 sm:py-4">
          <div className="grid grid-cols-2 gap-2 sm:hidden">
            <Pill tone="slate" value={total} label="team" />
            <Pill tone="amber" value={unit.pending_onboarding} label="pending" />
            <Pill tone="violet" value={unit.open_demands} label="demands" />
            <Pill tone="cyan" value={unit.inventory_items} label="items" />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {unit.id !== "__unassigned__" && (
              <>
                <Link to="/admin/attendance/$unitId" params={{ unitId: unit.id }} className="rounded-full border border-border bg-card px-3 py-1 font-medium hover:border-accent/40 hover:text-accent">
                  Mark attendance
                </Link>
                <Link to="/admin/employees" className="rounded-full border border-border bg-card px-3 py-1 font-medium hover:border-accent/40 hover:text-accent">
                  Onboard employee
                </Link>
              </>
            )}
          </div>
          {unit.guards.length === 0 ? (
            <div className="py-2 text-sm text-muted-foreground">No active employees on this unit yet.</div>
          ) : (
            <table className="ios-table min-w-full table-auto text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr><th className="py-2 pr-4">Name</th><th className="py-2">Designation</th></tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {unit.guards.map((g) => (
                  <tr key={g.id}>
                    <td className="py-2 pr-4 font-medium">{g.full_name}</td>
                    <td className="py-2 text-muted-foreground">{g.designation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function Pill({ tone, value, label }: { tone: "slate" | "amber" | "violet" | "cyan"; value: number; label: string }) {
  const toneCls = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-500/15 dark:bg-amber-400/20 text-amber-700 dark:text-amber-300",
    violet: "bg-violet-100 text-violet-700",
    cyan: "bg-cyan-100 text-cyan-700",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${toneCls}`}>
      <span className="tabular-nums font-semibold">{value}</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}
