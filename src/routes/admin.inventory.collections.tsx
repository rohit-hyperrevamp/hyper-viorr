import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, PackageCheck, Inbox, ShieldCheck, Warehouse, ChevronDown, ChevronRight, X, PackagePlus, UserPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { toast } from "sonner";
import { confirmAction } from "@/components/ConfirmProvider";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { postMovements, type LocationType } from "@/lib/inv-helpers";
import { useAuth, SUPER_ADMIN_PHONE } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";

export const Route = createFileRoute("/admin/inventory/collections")({ component: CollectionsPage });

const MODULE = "Inventory Collections";
const ENTITY = "inv_stock_movements";

type OffboardingDetails = {
  pending_collection_fo_id?: string | null;
  collection_status?: "pending" | "completed" | null;
  collection_requested_at?: string | null;
  reason_text?: string;
  date_of_offboarding?: string | null;
};
type Candidate = { id: string; full_name: string; employee_code: string | null; mobile: string | null; role_key: string; unit_id: string | null; reports_to: string | null; offboarding_details?: OffboardingDetails | null };

type Unit = { id: string; code: string; name: string };
type Item = { id: string; name: string; item_code: string; is_sized: boolean };
type Balance = { location_type: string; location_id: string; item_id: string; size_value: string; qty: number };

function CollectionsPage() {
  const { user } = useAuth();
  const myPhone = user?.phone?.replace(/\D/g, "").slice(-10) ?? "";
  const isSuperAdmin = myPhone === SUPER_ADMIN_PHONE;

  const { data: me = null, isLoading: meLoading } = useQuery({
    queryKey: ["candidate-by-phone", myPhone],
    enabled: !!myPhone && !isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates" as never)
        .select("id,full_name,employee_code,mobile,role_key,unit_id,reports_to")
        .eq("mobile", myPhone)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Candidate) ?? null;
    },
  });

  const isFieldOfficer = !isSuperAdmin && me?.role_key === "field_officer";

  return (
    <div>
      <PageHeader
        title="Collections"
        description="Issue assets to newly-approved candidates, and collect stock back from guards reporting to you."
        crumbs={[{ label: "Uniform Manager", to: "/admin/inventory" }, { label: "Collections" }]}
      />
      {meLoading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : !isFieldOfficer || !me ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          <Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Collections are available to field officers only.
        </div>
      ) : (
        <div className="space-y-6">
          <IssuancesPanel me={me} />
          <CollectionsPanel me={me} />
        </div>
      )}
    </div>
  );
}

function CollectionsPanel({ me }: { me: Candidate }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [openGuard, setOpenGuard] = useState<string | null>(null);

  // 1. Guards reporting to me
  const { data: guards = [], isLoading: guardsLoading } = useQuery({
    queryKey: ["collections", "guards", me.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates" as never)
        .select("id,full_name,employee_code,mobile,role_key,unit_id,reports_to,offboarding_details")
        .eq("reports_to", me.id)
        .in("role_key", ["guard", "security_guard"])
        .eq("status", "active")
        .order("full_name");
      if (error) throw error;
      return (data as unknown as Candidate[]) ?? [];
    },
  });


  // Units covered by this field officer, so Collections opens with unit coverage first.
  const { data: coveredUnitIds = [] } = useQuery({
    queryKey: ["collections", "fo-covered-units", me.id],
    queryFn: async () => {
      const [scopeRes, legacyRes] = await Promise.all([
        supabase
          .from("employee_scope_assignments" as never)
          .select("scope_id,scope_type")
          .eq("candidate_id", me.id)
          .eq("scope_type", "unit"),
        supabase
          .from("candidate_units" as never)
          .select("unit_id")
          .eq("candidate_id", me.id),
      ]);
      if (scopeRes.error) throw scopeRes.error;
      if (legacyRes.error) throw legacyRes.error;
      const scoped = ((scopeRes.data ?? []) as unknown as { scope_id: string }[]).map((r) => r.scope_id);
      const legacy = ((legacyRes.data ?? []) as unknown as { unit_id: string }[]).map((r) => r.unit_id);
      return Array.from(new Set([...scoped, ...legacy]));
    },
  });

  // 2. Unit assignments (handles guards whose unit_id is null but who have scope_assignments)
  const guardIds = useMemo(() => guards.map((g) => g.id), [guards]);
  const { data: scopeUnits = [] } = useQuery({
    queryKey: ["collections", "guard-scope-units", guardIds.join(",")],
    enabled: guardIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_scope_assignments" as never)
        .select("candidate_id,scope_id,scope_type")
        .in("candidate_id", guardIds)
        .eq("scope_type", "unit");
      if (error) throw error;
      return (data as unknown as { candidate_id: string; scope_id: string }[]) ?? [];
    },
  });

  const guardUnitMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of guards) if (g.unit_id) m.set(g.id, g.unit_id);
    for (const r of scopeUnits) if (!m.has(r.candidate_id)) m.set(r.candidate_id, r.scope_id);
    return m;
  }, [guards, scopeUnits]);

  const unitIds = useMemo(() => Array.from(new Set([...coveredUnitIds, ...guardUnitMap.values()])), [coveredUnitIds, guardUnitMap]);

  const { data: units = [] } = useQuery({
    queryKey: ["collections", "units", unitIds.join(",")],
    enabled: unitIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("units" as never).select("id,code,name").in("id", unitIds);
      if (error) throw error;
      return (data as unknown as Unit[]) ?? [];
    },
  });
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  // 3. Stock at each guard
  const { data: balances = [] } = useQuery({
    queryKey: ["collections", "balances", guardIds.join(",")],
    enabled: guardIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inv_stock_balances" as never)
        .select("location_type,location_id,item_id,size_value,qty")
        .in("location_type", ["guard", "security_guard"])
        .in("location_id", guardIds)
        .gt("qty", 0);
      if (error) throw error;
      return (data as unknown as Balance[]) ?? [];
    },
  });

  const itemIds = useMemo(() => Array.from(new Set(balances.map((b) => b.item_id))), [balances]);
  const { data: items = [] } = useQuery({
    queryKey: ["collections", "items", itemIds.join(",")],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_items" as never).select("id,name,item_code,is_sized").in("id", itemIds);
      if (error) throw error;
      return (data as unknown as Item[]) ?? [];
    },
  });
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const balByGuard = useMemo(() => {
    const m = new Map<string, Balance[]>();
    for (const b of balances) {
      const arr = m.get(b.location_id) ?? [];
      arr.push(b);
      m.set(b.location_id, arr);
    }
    return m;
  }, [balances]);

  // Group by unit
  const grouped = useMemo(() => {
    const s = q.trim().toLowerCase();
    const filteredGuards = guards.filter((g) => {
      if (!s) return true;
      return g.full_name.toLowerCase().includes(s) || (g.employee_code ?? "").toLowerCase().includes(s) || (g.mobile ?? "").includes(s);
    });
    const m = new Map<string, Candidate[]>();
    const UNASSIGNED = "__unassigned__";
    if (!s) {
      for (const uid of coveredUnitIds) m.set(uid, []);
    }
    for (const g of filteredGuards) {
      const uid = guardUnitMap.get(g.id) ?? UNASSIGNED;
      const arr = m.get(uid) ?? [];
      arr.push(g);
      m.set(uid, arr);
    }
    const out: { unit: Unit | null; guards: Candidate[] }[] = [];
    for (const [uid, arr] of m) {
      out.push({ unit: uid === UNASSIGNED ? null : unitMap.get(uid) ?? null, guards: arr });
    }
    out.sort((a, b) => (a.unit?.name ?? "zzz").localeCompare(b.unit?.name ?? "zzz"));
    return out;
  }, [guards, guardUnitMap, unitMap, q, coveredUnitIds]);

  const totalGuards = guards.length;
  const guardsWithStock = useMemo(() => guards.filter((g) => (balByGuard.get(g.id)?.length ?? 0) > 0).length, [guards, balByGuard]);
  const pendingOffboardCount = useMemo(
    () =>
      guards.filter(
        (g) =>
          g.offboarding_details?.collection_status === "pending" &&
          g.offboarding_details?.pending_collection_fo_id === me.id,
      ).length,
    [guards, me.id],
  );


  const activeGuard = openGuard ? guards.find((g) => g.id === openGuard) ?? null : null;
  const activeBalances = openGuard ? balByGuard.get(openGuard) ?? [] : [];

  const collectMut = useMutation({
    mutationFn: async (payload: { guard: Candidate; rows: { item_id: string; size_value: string; qty: number }[] }) => {
      const movs = payload.rows.flatMap((r) => ([
        {
          movement_type: "COLLECT_GUARD_OUT",
          location_type: (payload.guard.role_key === "security_guard" ? "guard" : "guard") as LocationType,
          location_id: payload.guard.id,
          item_id: r.item_id, size_value: r.size_value, qty_change: -r.qty,
          reference_type: "collection", reference_id: payload.guard.id,
        },
        {
          movement_type: "COLLECT_FO_IN",
          location_type: "field_officer" as LocationType,
          location_id: me.id,
          item_id: r.item_id, size_value: r.size_value, qty_change: r.qty,
          reference_type: "collection", reference_id: payload.guard.id,
        },
      ]));
      await postMovements(movs);

      // Offboarding handshake — if this guard was flagged pending-offboarding for me,
      // check that no stock remains at the guard, then finalise the offboarding.
      const od = payload.guard.offboarding_details ?? null;
      const isPendingOffboarding =
        od?.collection_status === "pending" && od?.pending_collection_fo_id === me.id;
      let finalisedOffboarding = false;
      if (isPendingOffboarding) {
        const { data: remainingRows, error: remErr } = await supabase
          .from("inv_stock_balances" as never)
          .select("qty")
          .eq("location_type", "guard")
          .eq("location_id", payload.guard.id)
          .gt("qty", 0);
        if (remErr) throw remErr;
        const remaining = ((remainingRows as unknown as { qty: number }[]) ?? []).reduce(
          (s, r) => s + Number(r.qty || 0),
          0,
        );
        if (remaining === 0) {
          const nowIso = new Date().toISOString();
          const nextDetails: OffboardingDetails = {
            ...od,
            collection_status: "completed",
            collection_requested_at: od?.collection_requested_at ?? nowIso,
          };
          const { error: upErr } = await supabase
            .from("candidates" as never)
            .update({
              is_enabled: false,
              status: "inactive",
              offboarded_at: nowIso,
              offboarding_details: { ...nextDetails, collection_completed_at: nowIso, collection_completed_by: me.id },
            } as unknown as never)
            .eq("id", payload.guard.id);
          if (upErr) throw upErr;
          finalisedOffboarding = true;
          void logActivity({
            module: "Employees",
            action: "offboard",
            entityType: "candidate",
            entityId: payload.guard.id,
            entityLabel: `${payload.guard.full_name} finalised on FO collection`,
            details: { collected_by: me.id },
          });
        }
      }

      void logActivity({
        module: MODULE, action: "collect", entityType: ENTITY, entityId: payload.guard.id,
        entityLabel: `Collected from ${payload.guard.full_name} (${payload.rows.length} item${payload.rows.length === 1 ? "" : "s"})`,
      });

      return { finalisedOffboarding };
    },
    onSuccess: (res) => {
      if (res?.finalisedOffboarding) {
        toast.success("Collection confirmed — employee offboarded.");
      } else {
        toast.success("Collected — stock returned to you");
      }
      qc.invalidateQueries({ queryKey: ["collections"] });
      qc.invalidateQueries({ queryKey: ["inv", "balances-sum"] });
      qc.invalidateQueries({ queryKey: ["inv"] });
      setOpenGuard(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });


  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Warehouse} label="Units covered" value={unitIds.length} accent="bg-cyan-600" />
        <StatTile icon={ShieldCheck} label="Guards on duty" value={totalGuards} accent="bg-emerald-600" />
        <StatTile icon={PackageCheck} label="Guards with stock" value={guardsWithStock} accent="bg-violet-600" />
        <StatTile icon={Inbox} label="Total items at guards" value={balances.reduce((s, b) => s + Number(b.qty || 0), 0)} accent="bg-amber-500" />
      </div>

      {pendingOffboardCount > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 shadow-sm">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500/20">
            <PackageCheck className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <div className="font-semibold">Offboarding collection pending</div>
            <div className="text-[12px] text-rose-700/80">
              {pendingOffboardCount} guard{pendingOffboardCount === 1 ? "" : "s"} awaiting your inventory recovery.
              Their offboarding will complete only after you confirm collection.
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guard name, code or mobile…" className="h-10 rounded-lg pl-9" />
        </div>
      </div>


      {guardsLoading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 opacity-40" />
          No guards are reporting to you yet.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ unit, guards: gList }) => (
            <UnitBlock
              key={unit?.id ?? "__unassigned__"}
              unit={unit}
              guards={gList}
              balByGuard={balByGuard}
              itemMap={itemMap}
              onCollect={(g) => setOpenGuard(g.id)}
            />
          ))}
        </div>
      )}

      {activeGuard && (
        <CollectDialog
          open={!!activeGuard}
          onOpenChange={(o) => !o && setOpenGuard(null)}
          guard={activeGuard}
          unit={unitMap.get(guardUnitMap.get(activeGuard.id) ?? "") ?? null}
          balances={activeBalances}
          itemMap={itemMap}
          submitting={collectMut.isPending}
          onConfirm={(rows) => collectMut.mutate({ guard: activeGuard, rows })}
        />
      )}
    </div>
  );
}

function StatTile({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; accent: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 shadow-sm text-white ${accent}`}>
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/25">
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/90">{label}</div>
      </div>
      <div className="mt-2 font-display text-2xl font-bold tabular-nums tracking-tight text-white">{value.toLocaleString()}</div>
    </div>
  );
}

function UnitBlock({ unit, guards, balByGuard, itemMap, onCollect }: {
  unit: Unit | null;
  guards: Candidate[];
  balByGuard: Map<string, Balance[]>;
  itemMap: Map<string, Item>;
  onCollect: (g: Candidate) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-5 py-4 text-left transition hover:bg-secondary/30">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600">
            <Warehouse className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">{unit ? `${unit.code} · ${unit.name}` : "Unassigned guards"}</div>
            <div className="text-[11px] text-muted-foreground">{guards.length} guard{guards.length === 1 ? "" : "s"}</div>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="divide-y divide-border/50">
          {guards.map((g) => {
            const bals = balByGuard.get(g.id) ?? [];
            const totalQty = bals.reduce((s, b) => s + Number(b.qty || 0), 0);
            const isPendingOff =
              g.offboarding_details?.collection_status === "pending" &&
              !!g.offboarding_details?.pending_collection_fo_id;
            return (
              <div
                key={g.id}
                className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${isPendingOff ? "bg-rose-500/5" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isPendingOff ? "bg-rose-500/15 text-rose-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                      <span>{g.full_name}</span>
                      {isPendingOff && (
                        <span className="inline-flex items-center rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                          Offboarding · collect pending
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{g.employee_code ?? "—"}{g.mobile ? ` · +91 ${g.mobile}` : ""}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {bals.length === 0 && <span className="text-[11px] text-muted-foreground">Nothing assigned</span>}
                      {bals.map((b, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">
                          {itemMap.get(b.item_id)?.name ?? "—"}
                          {b.size_value ? <span className="text-muted-foreground">({b.size_value})</span> : null}
                          <span className="text-muted-foreground">× {b.qty}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right text-[11px] text-muted-foreground">{totalQty} item{totalQty === 1 ? "" : "s"} held</div>
                  <Button
                    size="sm"
                    disabled={bals.length === 0}
                    onClick={() => onCollect(g)}
                    className={`h-9 rounded-md ${isPendingOff ? "bg-rose-600 text-white hover:bg-rose-700" : ""}`}
                  >
                    <PackageCheck className="mr-1.5 h-4 w-4" /> {isPendingOff ? "Confirm collection" : "Recover"}
                  </Button>
                </div>
              </div>
            );

          })}
        </div>
      )}
    </div>
  );
}

function CollectDialog({ open, onOpenChange, guard, unit, balances, itemMap, onConfirm, submitting }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  guard: Candidate;
  unit: Unit | null;
  balances: Balance[];
  itemMap: Map<string, Item>;
  onConfirm: (rows: { item_id: string; size_value: string; qty: number }[]) => void;
  submitting: boolean;
}) {
  // Default: take everything back
  const [qtyMap, setQtyMap] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const b of balances) m[`${b.item_id}|${b.size_value}`] = Number(b.qty || 0);
    return m;
  });
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const b of balances) m[`${b.item_id}|${b.size_value}`] = Number(b.qty || 0) > 0;
    return m;
  });

  const setAll = (mode: "all" | "none") => {
    const q: Record<string, number> = {};
    const checked: Record<string, boolean> = {};
    for (const b of balances) {
      const key = `${b.item_id}|${b.size_value}`;
      q[key] = mode === "all" ? Number(b.qty || 0) : 0;
      checked[key] = mode === "all";
    }
    setQtyMap(q);
    setCheckedMap(checked);
  };

  const totalSelected = balances.reduce((s, b) => {
    const key = `${b.item_id}|${b.size_value}`;
    return s + (checkedMap[key] ? Number(qtyMap[key] || 0) : 0);
  }, 0);

  const handleConfirm = async () => {
    const rows = balances
      .map((b) => ({ item_id: b.item_id, size_value: b.size_value, qty: Math.min(Number(qtyMap[`${b.item_id}|${b.size_value}`] || 0), Number(b.qty || 0)) }))
      .filter((r) => checkedMap[`${r.item_id}|${r.size_value}`] && r.qty > 0);
    if (!rows.length) return toast.error("Select at least one item");
    const allFull = rows.length === balances.length && rows.every((r) => {
      const b = balances.find((x) => x.item_id === r.item_id && x.size_value === r.size_value);
      return b && r.qty === Number(b.qty || 0);
    });
    if (!(await confirmAction({
      title: "Confirm collection",
      description: allFull
        ? `Recover everything from ${guard.full_name}? It will be removed from the guard and added to your field-officer stock.`
        : `Recover ${rows.length} selected item${rows.length === 1 ? "" : "s"} from ${guard.full_name}?`,
      confirmText: "Mark Recovered",
    }))) return;
    onConfirm(rows);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Recover stock from {guard.full_name}</DialogTitle>
          <div className="text-xs text-muted-foreground">
            {guard.employee_code ?? "—"}{unit ? ` · ${unit.code} · ${unit.name}` : ""}
          </div>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Tick the items being recovered, then set the quantity.</div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" className="h-7 rounded-md text-xs" onClick={() => setAll("all")}>Recover all</Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 rounded-md text-xs" onClick={() => setAll("none")}>Clear</Button>
          </div>
        </div>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto rounded-xl border border-border/70 bg-background p-3">
          {balances.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Nothing assigned to this guard.</div>
          ) : balances.map((b) => {
            const key = `${b.item_id}|${b.size_value}`;
            const item = itemMap.get(b.item_id);
            const max = Number(b.qty || 0);
            const val = qtyMap[key] ?? 0;
            const checked = checkedMap[key] ?? false;
            return (
              <div key={key} className={`flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-3 py-2 transition ${checked ? "ring-1 ring-emerald-500/25" : "opacity-60"}`}>
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => {
                    const isChecked = next === true;
                    setCheckedMap((m) => ({ ...m, [key]: isChecked }));
                    if (isChecked && Number(qtyMap[key] || 0) === 0) {
                      setQtyMap((m) => ({ ...m, [key]: max }));
                    }
                  }}
                  aria-label={`Recover ${item?.name ?? "item"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{item?.name ?? "—"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {item?.item_code ?? ""}{b.size_value ? ` · Size ${b.size_value}` : ""} · Held: {max}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" size="sm" variant="outline" disabled={!checked} className="h-8 w-8 rounded-md p-0" onClick={() => setQtyMap((m) => ({ ...m, [key]: Math.max(0, (m[key] ?? 0) - 1) }))}>−</Button>
                  <Input
                    type="number"
                    min={0}
                    max={max}
                    value={val}
                    disabled={!checked}
                    onChange={(e) => {
                      const n = Math.max(0, Math.min(max, Number(e.target.value) || 0));
                      setQtyMap((m) => ({ ...m, [key]: n }));
                      setCheckedMap((m) => ({ ...m, [key]: n > 0 }));
                    }}
                    className="h-8 w-16 rounded-md text-center"
                  />
                  <Button type="button" size="sm" variant="outline" disabled={!checked} className="h-8 w-8 rounded-md p-0" onClick={() => setQtyMap((m) => ({ ...m, [key]: Math.min(max, (m[key] ?? 0) + 1) }))}>+</Button>
                  <span className="ml-1 text-[11px] text-muted-foreground">/ {max}</span>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-9 rounded-md">
            <X className="mr-1.5 h-4 w-4" /> Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting || totalSelected === 0} className="h-9 rounded-md">
            <PackageCheck className="mr-1.5 h-4 w-4" />
            {submitting ? "Recovering…" : `Mark recovered (${totalSelected})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Issuances panel — onboarding-issuance handshake (mirrors the offboarding
// collection flow). When HR/Leadership approves a candidate that has assigned
// assets AND a reporting Field Officer, the candidate goes to status='approved'
// with onboarding_details.issuance_status='pending' and pending_issuance_fo_id
// set to the FO's auth user_id. The FO sees the candidate here, confirms the
// hand-over, and the candidate flips to status='active' + is_enabled=true.
// ---------------------------------------------------------------------------

type PendingIssuanceCandidate = {
  id: string;
  full_name: string;
  employee_code: string | null;
  candidate_code: string | null;
  mobile: string | null;
  role_key: string | null;
  unit_id: string | null;
  designation_id: string | null;
  assigned_asset_ids: string[] | null;
  onboarding_details: {
    pending_issuance_fo_id?: string | null;
    pending_issuance_fo_name?: string | null;
    issuance_status?: "pending" | "completed" | null;
    issuance_requested_at?: string | null;
    issuance_asset_ids?: string[] | null;
  } | null;
};

function IssuancesPanel({ me }: { me: Candidate }) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: myUserId = null } = useQuery({
    queryKey: ["issuances", "my-user-id"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
  });

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["issuances", "pending", myUserId],
    enabled: !!myUserId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates" as never)
        .select("id,full_name,employee_code,candidate_code,mobile,role_key,unit_id,designation_id,assigned_asset_ids,onboarding_details")
        .eq("status", "approved")
        .eq("onboarding_details->>issuance_status", "pending")
        .eq("onboarding_details->>pending_issuance_fo_id", myUserId!)
        .order("full_name");
      if (error) throw error;
      return (data as unknown as PendingIssuanceCandidate[]) ?? [];
    },
  });

  const assetIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of pending) {
      for (const id of c.onboarding_details?.issuance_asset_ids ?? c.assigned_asset_ids ?? []) s.add(id);
    }
    return Array.from(s);
  }, [pending]);

  const { data: invItems = [] } = useQuery({
    queryKey: ["issuances", "inv-items", assetIds.join(",")],
    enabled: assetIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inv_items" as never)
        .select("id,name,item_code,is_sized")
        .in("id", assetIds);
      if (error) throw error;
      return (data as unknown as Item[]) ?? [];
    },
  });

  const { data: legacyAssets = [] } = useQuery({
    queryKey: ["issuances", "legacy-assets", assetIds.join(",")],
    enabled: assetIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets" as never)
        .select("id,name")
        .in("id", assetIds);
      if (error) throw error;
      return (data as unknown as { id: string; name: string }[]) ?? [];
    },
  });

  const invItemMap = useMemo(() => new Map(invItems.map((i) => [i.id, i])), [invItems]);
  const legacyMap = useMemo(() => new Map(legacyAssets.map((a) => [a.id, a])), [legacyAssets]);

  const unitIds = useMemo(() => Array.from(new Set(pending.map((c) => c.unit_id).filter(Boolean))) as string[], [pending]);
  const { data: units = [] } = useQuery({
    queryKey: ["issuances", "units", unitIds.join(",")],
    enabled: unitIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("units" as never).select("id,code,name").in("id", unitIds);
      if (error) throw error;
      return (data as unknown as Unit[]) ?? [];
    },
  });
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  const active = openId ? pending.find((c) => c.id === openId) ?? null : null;

  const issueMut = useMutation({
    mutationFn: async (payload: { candidate: PendingIssuanceCandidate; rows: { item_id: string; size_value: string; qty: number }[] }) => {
      // Post FO OUT → guard IN movements for any assigned assets that are real
      // inv_items. Legacy assets (assets table only) have no stock ledger, so
      // we skip movements for them and only flip the candidate status.
      if (payload.rows.length > 0) {
        const movs = payload.rows.flatMap((r) => ([
          {
            movement_type: "ISSUE_FO_OUT",
            location_type: "field_officer" as LocationType,
            location_id: me.id,
            item_id: r.item_id,
            size_value: r.size_value,
            qty_change: -r.qty,
            reference_type: "issuance",
            reference_id: payload.candidate.id,
          },
          {
            movement_type: "ISSUE_GUARD_IN",
            location_type: "guard" as LocationType,
            location_id: payload.candidate.id,
            item_id: r.item_id,
            size_value: r.size_value,
            qty_change: r.qty,
            reference_type: "issuance",
            reference_id: payload.candidate.id,
          },
        ]));
        await postMovements(movs);
      }

      const nowIso = new Date().toISOString();
      const prevDetails = payload.candidate.onboarding_details ?? {};
      const nextDetails = {
        ...prevDetails,
        issuance_status: "completed" as const,
        issuance_completed_at: nowIso,
        issuance_completed_by: me.id,
      };
      const { error } = await supabase
        .from("candidates" as never)
        .update({
          status: "active",
          is_enabled: true,
          onboarding_details: nextDetails,
        } as unknown as never)
        .eq("id", payload.candidate.id);
      if (error) throw error;

      void logActivity({
        module: MODULE,
        action: "issue",
        entityType: ENTITY,
        entityId: payload.candidate.id,
        entityLabel: `Issued to ${payload.candidate.full_name} (${payload.rows.length} item${payload.rows.length === 1 ? "" : "s"})`,
      });

      // Fire-and-forget welcome + approver notifications.
      void (async () => {
        try {
          let empUserId: string | null = null;
          try {
            const { data: uid } = await supabase.rpc("get_user_id_by_candidate" as never, { _candidate_id: payload.candidate.id } as never);
            empUserId = uid ? String(uid) : null;
          } catch { /* ignore */ }
          const firstName = (payload.candidate.full_name || "").split(" ")[0] || "there";
          const empCode = payload.candidate.employee_code || "";
          if (empUserId) {
            await createNotification({
              userId: empUserId,
              type: "welcome_onboarded",
              title: `Welcome to Radiant Guard Services${empCode ? ` — ${empCode}` : ""}`,
              message: `Hi ${firstName}, your assets have been issued and your account is now active. Welcome aboard! 🎉`,
              link: "/admin/employee-dashboard",
              entityType: "candidate",
              entityId: payload.candidate.id,
            });
          }
          // approver-side notification already emitted at approval time

        } catch (e) {
          console.error("post-issue notifications failed", e);
        }
      })();

      return { candidate: payload.candidate };
    },
    onSuccess: (res) => {
      toast.success(`Issued & activated — ${res.candidate.full_name}`);
      qc.invalidateQueries({ queryKey: ["issuances"] });
      qc.invalidateQueries({ queryKey: ["collections"] });
      qc.invalidateQueries({ queryKey: ["inv"] });
      setOpenId(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Issuance failed"),
  });

  if (isLoading) return null;
  if (pending.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-sky-300/60 bg-sky-500/[0.04] shadow-sm">
      <div className="flex items-center gap-3 border-b border-sky-300/50 bg-sky-500/[0.08] px-5 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500/20 text-sky-700">
          <PackagePlus className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <div className="text-sm font-semibold text-sky-900 dark:text-sky-200">Issuances pending — activate new employees</div>
          <div className="text-[12px] text-sky-800/80 dark:text-sky-200/80">
            {pending.length} candidate{pending.length === 1 ? "" : "s"} approved. Confirm hand-over to activate their account.
          </div>
        </div>
      </div>

      <div className="divide-y divide-sky-200/60">
        {pending.map((c) => {
          const unit = c.unit_id ? unitMap.get(c.unit_id) : undefined;
          const ids = c.onboarding_details?.issuance_asset_ids ?? c.assigned_asset_ids ?? [];
          const preview = ids
            .map((id) => invItemMap.get(id)?.name ?? legacyMap.get(id)?.name)
            .filter(Boolean) as string[];
          return (
            <div key={c.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/15 text-sky-700">
                  <UserPlus className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">{c.full_name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {c.candidate_code || c.employee_code || "—"}
                    {c.mobile ? ` · +91 ${c.mobile}` : ""}
                    {unit ? ` · ${unit.code} · ${unit.name}` : ""}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {preview.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground">No assets to issue</span>
                    ) : preview.map((name, i) => (
                      <span key={i} className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setOpenId(c.id)}
                  className="h-9 rounded-md bg-sky-600 text-white hover:bg-sky-700"
                >
                  <PackagePlus className="mr-1.5 h-4 w-4" /> Confirm issuance
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {active && (
        <IssueDialog
          open={!!active}
          onOpenChange={(o) => !o && setOpenId(null)}
          candidate={active}
          unit={active.unit_id ? unitMap.get(active.unit_id) ?? null : null}
          invItemMap={invItemMap}
          legacyMap={legacyMap}
          foId={me.id}
          submitting={issueMut.isPending}
          onConfirm={(rows) => issueMut.mutate({ candidate: active, rows })}
        />
      )}
    </section>
  );
}

function IssueDialog({ open, onOpenChange, candidate, unit, invItemMap, legacyMap, foId, submitting, onConfirm }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  candidate: PendingIssuanceCandidate;
  unit: Unit | null;
  invItemMap: Map<string, Item>;
  legacyMap: Map<string, { id: string; name: string }>;
  foId: string;
  submitting: boolean;
  onConfirm: (rows: { item_id: string; size_value: string; qty: number }[]) => void;
}) {
  const ids = candidate.onboarding_details?.issuance_asset_ids ?? candidate.assigned_asset_ids ?? [];
  const invIds = useMemo(() => ids.filter((id) => invItemMap.has(id)), [ids, invItemMap]);
  const legacyIds = useMemo(() => ids.filter((id) => !invItemMap.has(id) && legacyMap.has(id)), [ids, invItemMap, legacyMap]);

  const [foStock, setFoStock] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!open || invIds.length === 0) { setFoStock(new Map()); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("inv_stock_balances" as never)
        .select("item_id,qty")
        .eq("location_type", "field_officer")
        .eq("location_id", foId)
        .in("item_id", invIds);
      if (cancelled) return;
      const m = new Map<string, number>();
      for (const r of (((data as unknown) as Array<{ item_id: string; qty: number }>) ?? [])) {
        m.set(r.item_id, (m.get(r.item_id) ?? 0) + Number(r.qty || 0));
      }
      setFoStock(m);
    })();
    return () => { cancelled = true; };
  }, [open, foId, invIds]);

  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const m: Record<string, boolean> = {};
    for (const id of invIds) m[id] = true;
    setCheckedMap(m);
  }, [invIds]);

  const handleConfirm = async () => {
    const rows = invIds
      .filter((id) => checkedMap[id])
      .map((id) => ({ item_id: id, size_value: "", qty: 1 }));
    const insufficient = rows.filter((r) => (foStock.get(r.item_id) ?? 0) < r.qty);
    if (insufficient.length > 0) {
      const names = insufficient.map((r) => invItemMap.get(r.item_id)?.name ?? r.item_id).join(", ");
      const proceed = await confirmAction({
        title: "Insufficient stock",
        description: `Your current stock is short for: ${names}. Continue anyway? The balance will go negative.`,
        confirmText: "Issue anyway",
      });
      if (!proceed) return;
    } else {
      if (!(await confirmAction({
        title: "Confirm issuance",
        description: `Issue ${rows.length} item${rows.length === 1 ? "" : "s"} to ${candidate.full_name}? This will activate their account.`,
        confirmText: "Issue & activate",
      }))) return;
    }
    onConfirm(rows);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Issue assets to {candidate.full_name}</DialogTitle>
          <div className="text-xs text-muted-foreground">
            {candidate.candidate_code || candidate.employee_code || "—"}{unit ? ` · ${unit.code} · ${unit.name}` : ""}
          </div>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto rounded-xl border border-border/70 bg-background p-3">
          {invIds.length === 0 && legacyIds.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No assets are assigned. Confirm to activate the account.</div>
          ) : (
            <>
              {invIds.map((id) => {
                const item = invItemMap.get(id);
                const stock = foStock.get(id) ?? 0;
                const short = stock < 1;
                const checked = checkedMap[id] ?? true;
                return (
                  <div key={id} className={`flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-3 py-2 ${checked ? "ring-1 ring-sky-500/25" : "opacity-60"}`}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => setCheckedMap((m) => ({ ...m, [id]: next === true }))}
                      aria-label={`Issue ${item?.name ?? "item"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{item?.name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {item?.item_code ?? ""} · Your stock: {stock}{short ? " (short)" : ""}
                      </div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-foreground">× 1</div>
                  </div>
                );
              })}
              {legacyIds.map((id) => (
                <div key={id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{legacyMap.get(id)?.name ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">Legacy asset · no stock ledger</div>
                  </div>
                  <div className="text-[11px] font-semibold text-muted-foreground">Info only</div>
                </div>
              ))}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-9 rounded-md">
            <X className="mr-1.5 h-4 w-4" /> Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting} className="h-9 rounded-md bg-sky-600 text-white hover:bg-sky-700">
            <PackagePlus className="mr-1.5 h-4 w-4" />
            {submitting ? "Issuing…" : "Issue & activate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
