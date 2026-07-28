import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, MoveRight } from "lucide-react";
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
  PackageCheck,
  Sparkles,
} from "lucide-react";


import { DashboardShell } from "@/components/LiveFeed";
import { LiveFieldOfficersCard } from "@/components/LiveFieldOfficersCard";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentPermissions } from "@/lib/rbac";
import { PeopleInsightsCard } from "@/components/PeopleInsightsCard";
import { usePeopleInsights } from "@/lib/people-insights";
import { MarkAttendanceCard } from "@/components/MarkAttendanceCard";
import { MyLiveStatusCard } from "@/components/MyLiveStatusCard";
import { cn } from "@/lib/utils";
import { ListSkeleton } from "@/components/Skeletons";
import { RADIANT_BILLING_UNIT_ID } from "@/lib/business-constants";
import { UserCog } from "lucide-react";



export const Route = createFileRoute("/admin/field-dashboard")({
  component: FieldOfficerDashboard,
});

type Guard = { id: string; full_name: string; designation: string };
type CoFo = { id: string; full_name: string; employee_code: string | null };
type UnitNode = {
  id: string;
  code: string;
  name: string;
  customer_name: string;
  is_primary: boolean;
  guards: Guard[];
  co_field_officers: CoFo[];
  pending_onboarding: number;
  open_demands: number;
  inventory_items: number;
};

type PendingIssuance = {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  assigned_asset_ids: string[] | null;
  onboarding_details: { issuance_asset_ids?: string[] | null; issuance_requested_at?: string | null } | null;
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

      const [scopeRes, cuRes, allUnitsRes] = await Promise.all([
        supabase.from("employee_scope_assignments").select("scope_id,scope_type").eq("candidate_id", meId),
        supabase.from("candidate_units").select("unit_id,is_primary").eq("candidate_id", meId),
        supabase.from("units").select("id,code,name,customer_id,branch_id"),
      ]);
      const scopeRows = ((scopeRes.data ?? []) as Array<{ scope_id: string; scope_type: string }>);
      const scopeUnitIds = scopeRows.filter((r) => r.scope_type === "unit").map((r) => r.scope_id);
      const scopeBranchIds = new Set(scopeRows.filter((r) => r.scope_type === "branch").map((r) => r.scope_id));
      const scopeCustomerIds = new Set(scopeRows.filter((r) => r.scope_type === "customer").map((r) => r.scope_id));
      const legacyUnits = ((cuRes.data ?? []) as Array<{ unit_id: string; is_primary: boolean }>);
      const primaryMap = new Map(legacyUnits.map((r) => [r.unit_id, r.is_primary]));
      const allUnitsRaw = ((allUnitsRes.data ?? []) as Array<{ id: string; code: string; name: string; customer_id: string | null; branch_id: string | null }>);
      // Merge every mechanism: candidate.unit_id (home) + candidate_units + esa unit
      // + esa branch expansion + esa customer expansion. Radiant Pune home unit
      // is excluded from the "My units" panel since it's a payroll marker, not
      // an operational client site.
      const unitIdSet = new Set<string>();
      const meUnitId = (me as { unit_id?: string | null } | null)?.unit_id ?? null;
      if (meUnitId) unitIdSet.add(meUnitId);
      for (const r of legacyUnits) unitIdSet.add(r.unit_id);
      for (const id of scopeUnitIds) unitIdSet.add(id);
      if (scopeBranchIds.size || scopeCustomerIds.size) {
        for (const u of allUnitsRaw) {
          if (u.branch_id && scopeBranchIds.has(u.branch_id)) unitIdSet.add(u.id);
          if (u.customer_id && scopeCustomerIds.has(u.customer_id)) unitIdSet.add(u.id);
        }
      }
      unitIdSet.delete(RADIANT_BILLING_UNIT_ID);
      const unitIds = Array.from(unitIdSet);

      // Guards mapped to any of my units via candidate_units (multi-unit coverage)
      // must be included even when their primary candidates.unit_id points elsewhere.
      const guardExtraUnits = new Map<string, Set<string>>();
      if (unitIds.length) {
        const { data: cuGuards } = await supabase
          .from("candidate_units")
          .select("candidate_id,unit_id")
          .in("unit_id", unitIds);
        for (const r of (cuGuards ?? []) as Array<{ candidate_id: string; unit_id: string }>) {
          const gs = guardExtraUnits.get(r.candidate_id) ?? new Set<string>();
          gs.add(r.unit_id);
          guardExtraUnits.set(r.candidate_id, gs);
        }
      }
      const extraGuardIds = Array.from(guardExtraUnits.keys());

      let guardQuery = supabase
        .from("candidates")
        .select("id,full_name,designation_id,unit_id,role_key,status,is_enabled,reports_to,created_by,created_at")
        .in("role_key", ["guard", "security_guard"])
        .eq("status", "active").eq("is_enabled", true);
      const teamFilters = [`reports_to.eq.${meId}`];
      if (userId) teamFilters.push(`created_by.eq.${userId}`);
      if (unitIds.length) teamFilters.push(`unit_id.in.(${unitIds.join(",")})`);
      if (extraGuardIds.length) teamFilters.push(`id.in.(${extraGuardIds.join(",")})`);
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
        if (uid && uid !== RADIANT_BILLING_UNIT_ID && !unitIds.includes(uid)) unitIds.push(uid);
      }

      // Co-field-officers: other FOs mapped to any of our unitIds via candidate_units,
      // esa unit, esa branch, or esa customer. Used to show peer coverage on each unit.
      const coFoByUnit = new Map<string, CoFo[]>();
      if (unitIds.length) {
        const [foRes, foCuRes, foEsaRes] = await Promise.all([
          supabase
            .from("candidates")
            .select("id,full_name,employee_code,unit_id,role_key,status,is_enabled")
            .eq("role_key", "field_officer")
            .in("status", ["active", "approved"])
            .eq("is_enabled", true),
          supabase.from("candidate_units").select("candidate_id,unit_id"),
          supabase.from("employee_scope_assignments").select("candidate_id,scope_id,scope_type"),
        ]);
        const fos = ((foRes.data ?? []) as Array<{ id: string; full_name: string; employee_code: string | null; unit_id: string | null }>).filter((f) => f.id !== meId);
        const foMap = new Map(fos.map((f) => [f.id, f]));
        const foCu = ((foCuRes.data ?? []) as Array<{ candidate_id: string; unit_id: string }>);
        const foEsa = ((foEsaRes.data ?? []) as Array<{ candidate_id: string; scope_id: string; scope_type: string }>);
        const unitById = new Map(allUnitsRaw.map((u) => [u.id, u]));
        for (const uid of unitIds) {
          const u = unitById.get(uid);
          if (!u) continue;
          const mapped = new Set<string>();
          for (const f of fos) if (f.unit_id === uid) mapped.add(f.id);
          for (const r of foCu) if (r.unit_id === uid && foMap.has(r.candidate_id)) mapped.add(r.candidate_id);
          for (const r of foEsa) {
            if (!foMap.has(r.candidate_id)) continue;
            if (r.scope_type === "unit" && r.scope_id === uid) mapped.add(r.candidate_id);
            if (r.scope_type === "branch" && u.branch_id && r.scope_id === u.branch_id) mapped.add(r.candidate_id);
            if (r.scope_type === "customer" && u.customer_id && r.scope_id === u.customer_id) mapped.add(r.candidate_id);
          }
          if (mapped.size) {
            coFoByUnit.set(
              uid,
              Array.from(mapped)
                .map((id) => foMap.get(id)!)
                .filter(Boolean)
                .map((f) => ({ id: f.id, full_name: f.full_name, employee_code: f.employee_code }))
                .sort((a, b) => a.full_name.localeCompare(b.full_name)),
            );
          }
        }
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
        const primary = g.unit_id ?? guardScopeUnit.get(g.id) ?? UNASSIGNED;
        const placements = new Set<string>([primary]);
        const extras = guardExtraUnits.get(g.id);
        if (extras) for (const uid of extras) placements.add(uid);
        guardIdToUnit.set(g.id, primary);
        const entry = { id: g.id, full_name: g.full_name, designation: (g.designation_id && desigMap.get(g.designation_id)) || "—" };
        for (const uid of placements) {
          const arr = guardsByUnit.get(uid) ?? [];
          if (!arr.some((x) => x.id === entry.id)) arr.push(entry);
          guardsByUnit.set(uid, arr);
        }
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
        co_field_officers: coFoByUnit.get(u.id) ?? [],
        pending_onboarding: pendingByUnit.get(u.id) ?? 0,
        open_demands: demandsByUnit.get(u.id) ?? 0,
        inventory_items: inventoryByUnit.get(u.id) ?? 0,
      })).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name));

      const orphaned = guardsByUnit.get(UNASSIGNED) ?? [];
      const orphPending = pendingByUnit.get(UNASSIGNED) ?? 0;
      if (orphaned.length || orphPending) {
        units.push({
          id: UNASSIGNED, code: "—", name: "Unassigned", customer_name: "Map these to a unit",
          is_primary: false, guards: orphaned, co_field_officers: [], pending_onboarding: orphPending,
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

  const pendingIssuanceQ = useQuery({
    queryKey: ["field-officer", "pending-issuance", userId],
    enabled: !!userId && (roleKey === "field_officer" || isSuperAdmin),
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("candidates" as never)
        .select("id,full_name,employee_code,assigned_asset_ids,onboarding_details")
        .eq("status", "approved")
        .eq("onboarding_details->>issuance_status", "pending")
        .eq("onboarding_details->>pending_issuance_fo_id", userId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return ((rows as unknown) as PendingIssuance[]) ?? [];
    },
  });

  const pendingIssuances = pendingIssuanceQ.data ?? [];
  const pendingAssetCount = pendingIssuances.reduce(
    (sum, row) => sum + (row.onboarding_details?.issuance_asset_ids?.length ?? row.assigned_asset_ids?.length ?? 0),
    0,
  );

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
            <div className="rounded-full bg-white/10 p-[2px] ring-1 ring-white/20 backdrop-blur">
              {data?.mePhoto ? (
                <img
                  src={data.mePhoto}
                  alt={data?.meName || "Profile"}
                  className="!aspect-square h-12 w-12 !rounded-full object-cover sm:h-14 sm:w-14"
                />
              ) : (
                <div className="grid !aspect-square h-12 w-12 place-items-center !rounded-full bg-accent font-display text-sm font-bold text-accent-foreground sm:h-14 sm:w-14">
                  {initials(data?.meName || "FO")}
                </div>
              )}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white shadow ring-2 ring-slate-900 sm:h-5 sm:w-5">
              <ShieldCheck className="h-2.5 w-2.5" />
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

        <div className="relative mt-4 grid grid-cols-3 min-[320px]:grid-cols-3 gap-2 sm:gap-3">
          <HeroStat label="Team" value={totalListings} tint="sky" />
          <HeroStat label="Present" value={attnPresent} tint="emerald" />
          <HeroStat label="Items" value={totalItems} tint="amber" />
        </div>
      </section>


      <MarkAttendanceCard candidateId={data?.meId ?? null} />

      {pendingIssuances.length > 0 && (
        <section className="rounded-2xl border border-amber-200/70 bg-amber-50/90 p-3 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 sm:p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500 text-white shadow-sm">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-200">Action required</div>
              <h2 className="mt-0.5 text-sm font-bold text-foreground sm:text-base">Issue assets to activate new guard</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {pendingIssuances[0]?.full_name || "New employee"}{pendingIssuances.length > 1 ? ` and ${pendingIssuances.length - 1} more` : ""} awaiting {pendingAssetCount} asset{pendingAssetCount === 1 ? "" : "s"}.
              </p>
            </div>
            <Button asChild size="sm" className="h-9 shrink-0 rounded-full px-3 text-xs">
              <Link to="/admin/inventory/issuances">Issue</Link>
            </Button>
          </div>
        </section>
      )}

      <MyLiveStatusCard />




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

      {data?.meId && <FieldSenseSummary candidateId={data.meId} />}




      {/* Units list */}
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-sm backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5 sm:px-4 sm:py-3">
          <div className="min-w-0">
            <h2 className="font-display text-sm font-bold text-foreground sm:text-base">My units</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Tap a row to see the team.</p>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {units.length} unit{units.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="divide-y divide-border/50">
          {isLoading ? (
            <ListSkeleton rows={3} />

          ) : units.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-12 text-center">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/10 text-accent"><Sparkles className="h-5 w-5" /></div>
              <div className="text-sm font-semibold text-foreground">No units yet</div>
              <div className="text-xs text-muted-foreground">Ask HR to map you to your unit(s).</div>
            </div>
          ) : (
            units.map((u) => <UnitRow key={u.id} unit={u} allUnits={units} />)
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

function FieldSenseSummary({ candidateId }: { candidateId: string }) {
  const todayStr = (() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  })();
  const firstOfMonth = `${todayStr.slice(0, 8)}01`;

  const q = useQuery({
    queryKey: ["fo-dashboard-visits-v2", candidateId, todayStr],
    queryFn: async () => {
      const [monthVisitsRes, punchRes, trackRes, unitsRes, cuRes, esaRes, allUnitsRes, custRes] = await Promise.all([
        supabase
          .from("field_visits" as never)
          .select("id, unit_id, customer_rating, check_out_at")
          .eq("candidate_id", candidateId)
          .gte("visit_date", firstOfMonth)
          .not("check_out_at", "is", null),
        supabase
          .from("self_attendance_punches" as never)
          .select("check_in_at, check_out_at")
          .eq("candidate_id", candidateId)
          .eq("punch_date", todayStr)
          .maybeSingle(),
        supabase
          .from("field_track_points" as never)
          .select("lat,lng,recorded_at")
          .eq("candidate_id", candidateId)
          .eq("track_date", todayStr)
          .order("recorded_at", { ascending: true }),
        supabase
          .from("candidates" as never)
          .select("unit_id")
          .eq("id", candidateId)
          .maybeSingle(),
        supabase.from("candidate_units").select("unit_id").eq("candidate_id", candidateId),
        supabase
          .from("employee_scope_assignments")
          .select("scope_id,scope_type")
          .eq("candidate_id", candidateId),
        supabase.from("units").select("id, name, customer_id, branch_id"),
        supabase.from("customers").select("id, name"),
      ]);
      return {
        visits: (monthVisitsRes.data ?? []) as Array<{
          id: string;
          unit_id: string;
          customer_rating: number | null;
          check_out_at: string | null;
        }>,
        punch: (punchRes.data as { check_in_at: string | null; check_out_at: string | null } | null) ?? null,
        track: ((trackRes.data as unknown) as Array<{ lat: number; lng: number }>) ?? [],
        candUnit: ((unitsRes.data as unknown) as { unit_id: string | null } | null)?.unit_id ?? null,
        cu: (cuRes.data ?? []) as Array<{ unit_id: string }>,
        esa: (esaRes.data ?? []) as Array<{ scope_id: string; scope_type: string }>,
        allUnits: (allUnitsRes.data ?? []) as Array<{
          id: string;
          name: string;
          customer_id: string | null;
          branch_id: string | null;
        }>,
        customers: (custRes.data ?? []) as Array<{ id: string; name: string }>,
      };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const custMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of q.data?.customers ?? []) m.set(c.id, c.name);
    return m;
  }, [q.data?.customers]);

  const scopedUnits = useMemo(() => {
    if (!q.data) return [] as Array<{ id: string; name: string; customer_name: string }>;
    const ids = new Set<string>();
    if (q.data.candUnit) ids.add(q.data.candUnit);
    for (const r of q.data.cu) ids.add(r.unit_id);
    const branchIds = new Set<string>();
    const custIds = new Set<string>();
    for (const s of q.data.esa) {
      if (s.scope_type === "unit") ids.add(s.scope_id);
      else if (s.scope_type === "branch") branchIds.add(s.scope_id);
      else if (s.scope_type === "customer") custIds.add(s.scope_id);
    }
    for (const u of q.data.allUnits) {
      if ((u.branch_id && branchIds.has(u.branch_id)) || (u.customer_id && custIds.has(u.customer_id))) {
        ids.add(u.id);
      }
    }
    return q.data.allUnits
      .filter((u) => ids.has(u.id))
      .map((u) => ({
        id: u.id,
        name: u.name,
        customer_name: (u.customer_id && custMap.get(u.customer_id)) || u.name,
      }));
  }, [q.data, custMap]);

  const visits = q.data?.visits ?? [];
  const monthCount = visits.length;
  const rated = visits.filter((v) => v.customer_rating != null);
  const avgRating = rated.length
    ? rated.reduce((s, v) => s + (v.customer_rating ?? 0), 0) / rated.length
    : 0;

  const perUnit = new Map<string, number>();
  for (const v of visits) perUnit.set(v.unit_id, (perUnit.get(v.unit_id) ?? 0) + 1);
  const scopedCounts = scopedUnits.map((u) => ({ u, count: perUnit.get(u.id) ?? 0 }));
  const visited = scopedCounts.filter((r) => r.count > 0);
  const most = visited.length ? [...visited].sort((a, b) => b.count - a.count)[0] : null;
  const least = visited.length ? [...visited].sort((a, b) => a.count - b.count)[0] : null;
  const unvisitedCount = scopedCounts.filter((r) => r.count === 0).length;

  // Hours today
  const hoursLabel = (() => {
    const p = q.data?.punch;
    if (!p?.check_in_at) return "—";
    const start = new Date(p.check_in_at).getTime();
    const end = p.check_out_at ? new Date(p.check_out_at).getTime() : Date.now();
    const mins = Math.max(0, Math.round((end - start) / 60000));
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  })();
  // Km traveled today
  const kmLabel = (() => {
    const pts = q.data?.track ?? [];
    if (pts.length < 2) return "0.00";
    const toRad = (x: number) => (x * Math.PI) / 180;
    let m = 0;
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      const dLat = toRad(Number(b.lat) - Number(a.lat));
      const dLng = toRad(Number(b.lng) - Number(a.lng));
      const lat1 = toRad(Number(a.lat));
      const lat2 = toRad(Number(b.lat));
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      m += 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    return (m / 1000).toFixed(2);
  })();

  const monthLink = { to: "/admin/field-sense", search: { range: "this_month" } } as const;

  return (
    <section>
      <div className="mb-2 flex items-end justify-between">
        <h2 className="font-display text-sm font-bold tracking-tight text-foreground sm:text-base">My site visits</h2>
        <Link to="/admin/field-sense" className="text-[11px] font-semibold text-primary underline-offset-2 hover:underline">
          Open Field Sense →
        </Link>
      </div>

      {/* Today strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Link
          to="/admin/field-sense"
          search={{ range: "today" }}
          className="rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm ring-1 ring-sky-200/50 dark:ring-sky-400/15"
        >
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Hours today</div>
          <div className="mt-1 font-display text-base font-bold tabular-nums leading-none text-foreground sm:text-lg">{hoursLabel}</div>
        </Link>
        <Link
          to="/admin/field-sense"
          search={{ range: "today" }}
          className="rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm ring-1 ring-violet-200/50 dark:ring-violet-400/15"
        >
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Km today</div>
          <div className="mt-1 font-display text-base font-bold tabular-nums leading-none text-foreground sm:text-lg">{kmLabel}</div>
        </Link>
        <Link
          {...monthLink}
          className="rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm ring-1 ring-emerald-200/50 dark:ring-emerald-400/15"
        >
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Visits (mo)</div>
          <div className="mt-1 font-display text-base font-bold tabular-nums leading-none text-foreground sm:text-lg">{monthCount}</div>
        </Link>
        <Link
          {...monthLink}
          className="rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm ring-1 ring-amber-200/50 dark:ring-amber-400/15"
        >
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Rating (mo)</div>
          <div className="mt-1 inline-flex items-baseline gap-1 font-display text-base font-bold tabular-nums leading-none text-foreground sm:text-lg">
            {rated.length ? avgRating.toFixed(1) : "—"}
            {rated.length ? <span className="text-amber-500">★</span> : null}
            {rated.length ? <span className="text-[9px] font-medium text-muted-foreground">·{rated.length}</span> : null}
          </div>
        </Link>
      </div>

      {/* Client insights this month */}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link
          to="/admin/field-sense"
          search={{ range: "this_month", highlight: "most" }}
          className="group rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm ring-1 ring-emerald-200/50 dark:ring-emerald-400/15"
        >
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Most visited</div>
          <div className="mt-0.5 truncate text-[13px] font-semibold text-foreground">{most?.u.customer_name ?? "—"}</div>
          <div className="text-[10px] text-muted-foreground">
            {most ? `${most.count} visit${most.count === 1 ? "" : "s"}` : "no visits yet"}
          </div>
        </Link>
        <Link
          to="/admin/field-sense"
          search={{ range: "this_month", highlight: "least" }}
          className="group rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm ring-1 ring-rose-200/50 dark:ring-rose-400/15"
        >
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Least visited</div>
          <div className="mt-0.5 truncate text-[13px] font-semibold text-foreground">{least?.u.customer_name ?? "—"}</div>
          <div className="text-[10px] text-muted-foreground">
            {least ? `${least.count} visit${least.count === 1 ? "" : "s"}` : "no visits yet"}
          </div>
        </Link>
        <Link
          to="/admin/field-sense"
          search={{ range: "this_month", highlight: "unvisited" }}
          className="group rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm ring-1 ring-slate-200/60 dark:ring-slate-400/15"
        >
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Not visited</div>
          <div className="mt-0.5 font-display text-base font-bold tabular-nums text-foreground sm:text-lg">
            {unvisitedCount}
            <span className="ml-1 text-[10px] font-medium text-muted-foreground">of {scopedUnits.length}</span>
          </div>
        </Link>
      </div>
    </section>
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

function UnitRow({ unit, allUnits }: { unit: UnitNode; allUnits: UnitNode[] }) {
  const [open, setOpen] = useState(false);
  const [manageGuard, setManageGuard] = useState<Guard | null>(null);
  const total = unit.guards.length;
  const assignableUnits = allUnits.filter((u) => u.id !== "__unassigned__");
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition hover:bg-secondary/40 sm:px-4"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
              {unit.name}
              {unit.is_primary && (
                <span className="inline-flex rounded-full bg-emerald-500/15 dark:bg-emerald-400/20 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Primary</span>
              )}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">{unit.customer_name} · <span className="font-mono">{unit.code}</span></div>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {total} team
        </span>
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-border/40 bg-secondary/20 px-3.5 py-3 sm:px-4">
          {unit.co_field_officers.length > 0 && (
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-2.5 py-1.5">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                <UserCog className="h-3 w-3" /> Also on this unit ({unit.co_field_officers.length})
              </div>
              <ul className="space-y-0.5">
                {unit.co_field_officers.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-[12px]">
                    <span className="font-medium text-foreground">{f.full_name}</span>
                    {f.employee_code && (
                      <span className="font-mono text-[10px] text-muted-foreground">{f.employee_code}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {unit.guards.length === 0 ? (
            <div className="py-1 text-[12px] text-muted-foreground">No active employees on this unit yet.</div>
          ) : (
            <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/50 bg-card">
              {unit.guards.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-foreground">{g.full_name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{g.designation}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 gap-1 rounded-full px-2 text-[11px]"
                    onClick={() => setManageGuard(g)}
                  >
                    <MoveRight className="h-3 w-3" /> Manage
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ManageGuardUnitsDialog
        guard={manageGuard}
        currentUnitId={unit.id}
        assignableUnits={assignableUnits}
        onClose={() => setManageGuard(null)}
      />
    </div>
  );
}

function ManageGuardUnitsDialog({
  guard,
  currentUnitId,
  assignableUnits,
  onClose,
}: {
  guard: Guard | null;
  currentUnitId: string;
  assignableUnits: UnitNode[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const open = !!guard;

  useEffect(() => {
    if (!guard) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("candidate_units")
        .select("unit_id")
        .eq("candidate_id", guard.id);
      if (cancel) return;
      if (error) {
        toast.error(error.message || "Failed to load unit mappings");
      }
      const ids = new Set<string>(((data ?? []) as Array<{ unit_id: string }>).map((r) => r.unit_id));
      // Ensure the unit the guard is currently visible under is reflected as selected
      // even if only tracked via candidates.unit_id and not candidate_units.
      ids.add(currentUnitId);
      setSelected(new Set(ids));
      setInitial(new Set(ids));
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [guard, currentUnitId]);

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const save = async () => {
    if (!guard) return;
    if (selected.size === 0) {
      toast.error("A guard must be mapped to at least one unit.");
      return;
    }
    const toAdd = [...selected].filter((u) => !initial.has(u));
    const toRemove = [...initial].filter((u) => !selected.has(u));
    if (toAdd.length === 0 && toRemove.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      if (toAdd.length) {
        const rows = toAdd.map((unit_id) => ({ candidate_id: guard.id, unit_id, is_primary: false }));
        const { error } = await supabase.from("candidate_units").insert(rows);
        if (error) throw error;
      }
      if (toRemove.length) {
        const { error } = await supabase
          .from("candidate_units")
          .delete()
          .eq("candidate_id", guard.id)
          .in("unit_id", toRemove);
        if (error) throw error;
      }
      toast.success(`Updated ${guard.full_name}'s unit mapping`);
      await qc.invalidateQueries({ queryKey: ["field-dashboard"] });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update unit mapping";
      toast.error(msg.includes("row-level security") ? "You don't have permission to change this guard's units." : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage units</DialogTitle>
          <DialogDescription>
            {guard ? (
              <>Tick every unit <span className="font-semibold text-foreground">{guard.full_name}</span> should cover. Uncheck to remove them from a unit.</>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading current mapping…
          </div>
        ) : (
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {assignableUnits.map((u) => {
              const checked = selected.has(u.id);
              return (
                <label
                  key={u.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${checked ? "border-emerald-500/40 bg-emerald-500/5" : "border-border/60 hover:bg-muted/50"}`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(u.id)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{u.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {u.customer_name} · <span className="font-mono">{u.code}</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={save}
            disabled={saving || loading}
            data-force-enabled="true"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
