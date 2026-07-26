import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle, Users, Building2, ShieldCheck, IndianRupee, ShoppingCart, TrendingUp, TrendingDown,
  ArrowRight, Boxes, Truck, Wallet, Warehouse, PackageOpen, ClipboardList,
  UserPlus, FileText, Bell, Clock, ClipboardCheck, Zap,
} from "lucide-react";
import { useCurrentPermissions } from "@/lib/rbac";
import { useUserBranchScope } from "@/lib/use-user-branch-scope";
import { useCurrentUserRole } from "@/lib/use-current-user-role";


import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Owner Dashboard is now merged into the /admin/inventory hub.
// This route redirects there so any old links / bookmarks keep working.
export const Route = createFileRoute("/admin/inventory/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/inventory" });
  },
  component: () => null,
});

type Balance = { location_type: string; location_id: string; item_id: string; size_value: string; qty: number };
type Item = { id: string; item_code: string; name: string; default_reorder_level: number; is_sized: boolean; standard_cost: number; category_id: string | null };
type Category = { id: string; name: string };
type ItemSize = { item_id: string; size_value: string; reorder_level: number };
type Vendor = { id: string; name: string; vendor_code: string; city: string };
type RateCard = { vendor_id: string; item_id: string; size_value: string; unit_price: number };
type POLine = { po_id: string; item_id: string; ordered_qty: number; accepted_qty: number; line_total: number; unit_price: number };
type PO = { id: string; po_number: string; vendor_id: string; status: string; po_date: string; grand_total: number; destination_warehouse_id: string | null; created_at: string };
type Cand = { id: string; full_name: string; employee_code: string; role_key: string; designation_id: string | null };
type Branch = { id: string; name: string; code: string };
type Designation = { id: string; name: string };
type GRN = { id: string; receipt_date: string; po_id: string | null; vendor_id: string | null; status: string; branch_id: string | null; created_at: string };

type ScopedMovement = { id: string; status: string; source_type: string; source_id: string; destination_type: string; destination_id: string; created_at: string };
type Demand = { id: string; demand_number: string; status: string; branch_id: string | null; warehouse_id: string | null; requester_candidate_id: string | null; demand_date: string; created_at: string; submitted_at: string | null };

type Range = "this_month" | "last_month" | "last_quarter" | "custom";

const RANGE_LABEL: Record<Range, string> = {
  this_month: "This month",
  last_month: "Last month",
  last_quarter: "Last quarter",
  custom: "Custom",
};

function rangeWindow(r: Range, cf?: string, ct?: string): { from: Date; to: Date; prevFrom: Date; prevTo: Date; days: number } {
  const now = new Date();
  let from: Date; let to: Date;
  if (r === "this_month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date();
  } else if (r === "last_month") {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (r === "last_quarter") {
    const q = Math.floor(now.getMonth() / 3);
    if (q === 0) {
      from = new Date(now.getFullYear() - 1, 9, 1);
      to = new Date(now.getFullYear() - 1, 12, 0);
    } else {
      from = new Date(now.getFullYear(), (q - 1) * 3, 1);
      to = new Date(now.getFullYear(), q * 3, 0);
    }
  } else {
    from = cf ? new Date(cf + "T00:00:00") : new Date(now.getFullYear(), now.getMonth(), 1);
    to = ct ? new Date(ct + "T23:59:59.999") : new Date();
  }
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1);
  const prevTo = new Date(from); prevTo.setMilliseconds(-1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevTo.getDate() - days + 1); prevFrom.setHours(0, 0, 0, 0);
  return { from, to, prevFrom, prevTo, days };
}

const inr = (n: number) =>
  "₹" + (Math.abs(n) >= 1e7
    ? (n / 1e7).toFixed(2) + " Cr"
    : Math.abs(n) >= 1e5
    ? (n / 1e5).toFixed(2) + " L"
    : n.toLocaleString("en-IN", { maximumFractionDigits: 0 }));

export function InventoryOwnerDashboard() {
  const scope = useUserBranchScope();
  const role = useCurrentUserRole();
  const [range, setRange] = useState<Range>("this_month");
  const [customFrom, setCustomFrom] = useState<string>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const w = useMemo(() => rangeWindow(range, customFrom, customTo), [range, customFrom, customTo]);

  // Field officers mapped to the scoped branch (for branch-scoped users)
  const scopeAssignmentsQ = useQuery({
    queryKey: ["dash2", "scope-assignments", scope.branchId],
    enabled: scope.isScoped && !!scope.branchId,
    queryFn: async () => {
      const { data } = await supabase
        .from("employee_scope_assignments" as never)
        .select("candidate_id,scope_type,scope_id")
        .eq("scope_type", "branch")
        .eq("scope_id", scope.branchId as string);
      return (data as unknown as { candidate_id: string }[]) ?? [];
    },
  });
  const allowedFoIds = useMemo(
    () => new Set((scopeAssignmentsQ.data ?? []).map((a) => a.candidate_id)),
    [scopeAssignmentsQ.data],
  );


  // ===== queries =====
  const balancesQ = useQuery({ queryKey: ["dash2", "balances"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_stock_balances" as never).select("location_type,location_id,item_id,size_value,qty");
    if (error) throw error; return (data as unknown as Balance[]) ?? [];
  }});
  const itemsQ = useQuery({ queryKey: ["dash2", "items"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_items" as never).select("id,item_code,name,default_reorder_level,is_sized,standard_cost,category_id");
    if (error) throw error; return (data as unknown as Item[]) ?? [];
  }});
  const catsQ = useQuery({ queryKey: ["dash2", "cats"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_item_categories" as never).select("id,name");
    if (error) throw error; return (data as unknown as Category[]) ?? [];
  }});
  const sizesQ = useQuery({ queryKey: ["dash2", "sizes"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_item_sizes" as never).select("item_id,size_value,reorder_level");
    if (error) throw error; return (data as unknown as ItemSize[]) ?? [];
  }});
  const vendorsQ = useQuery({ queryKey: ["dash2", "vendors"], enabled: !scope.isLoading && !scope.isScoped, queryFn: async () => {
    const { data, error } = await supabase.from("inv_vendors" as never).select("id,name,vendor_code,city");
    if (error) throw error; return (data as unknown as Vendor[]) ?? [];
  }});
  const rateCardsQ = useQuery({ queryKey: ["dash2", "rate-cards"], enabled: !scope.isLoading && !scope.isScoped, queryFn: async () => {
    const { data, error } = await supabase.from("inv_vendor_rate_cards" as never).select("vendor_id,item_id,size_value,unit_price").eq("enabled", true);
    if (error) throw error; return (data as unknown as RateCard[]) ?? [];
  }});
  const poQ = useQuery({ queryKey: ["dash2", "pos"], enabled: !scope.isLoading && !scope.isScoped, queryFn: async () => {
    const { data, error } = await supabase.from("inv_purchase_orders" as never).select("id,po_number,vendor_id,status,po_date,grand_total,destination_warehouse_id,created_at");
    if (error) throw error; return (data as unknown as PO[]) ?? [];
  }});
  const poLinesQ = useQuery({ queryKey: ["dash2", "po-lines"], enabled: !scope.isLoading && !scope.isScoped, queryFn: async () => {
    const { data, error } = await supabase.from("inv_po_lines" as never).select("po_id,item_id,ordered_qty,accepted_qty,line_total,unit_price");
    if (error) throw error; return (data as unknown as POLine[]) ?? [];
  }});
  const candsQ = useQuery({ queryKey: ["dash2", "cands"], queryFn: async () => {
    const { data, error } = await supabase.from("candidates").select("id,full_name,employee_code,role_key,designation_id").in("status", ["approved", "active"]);
    if (error) throw error; return (data as unknown as Cand[]) ?? [];
  }});
  const desigQ = useQuery({ queryKey: ["dash2", "desig"], queryFn: async () => {
    const { data, error } = await supabase.from("designations").select("id,name");
    if (error) throw error; return (data as unknown as Designation[]) ?? [];
  }});
  const branchesQ = useQuery({ queryKey: ["dash2", "branches"], queryFn: async () => {
    const { data, error } = await supabase.from("branches").select("id,name,code");
    if (error) throw error; return (data as unknown as Branch[]) ?? [];
  }});
  const grnQ = useQuery({ queryKey: ["dash2", "grns"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_goods_receipts" as never).select("id,receipt_date,po_id,vendor_id,status,branch_id,created_at");
    if (error) throw error; return (data as unknown as GRN[]) ?? [];
  }});
  const whsQ = useQuery({ queryKey: ["dash2", "whs"], enabled: !scope.isLoading && !scope.isScoped, queryFn: async () => {
    const { data, error } = await supabase.from("inv_warehouses" as never).select("id,name,warehouse_code");
    if (error) throw error; return (data as unknown as { id: string; name: string; warehouse_code: string }[]) ?? [];
  }});
  const transfersQ = useQuery({ queryKey: ["dash2", "transfers"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_transfers" as never).select("id,status,source_type,source_id,destination_type,destination_id,created_at");
    if (error) throw error; return (data as unknown as ScopedMovement[]) ?? [];
  }});
  const transferLinesQ = useQuery({ queryKey: ["dash2", "transfer-lines"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_transfer_lines" as never).select("transfer_id,item_id,size_value,dispatched_qty,received_qty");
    if (error) throw error;
    return (data as unknown as { transfer_id: string; item_id: string; size_value: string; dispatched_qty: number; received_qty: number }[]) ?? [];
  }});
  const issuancesQ = useQuery({ queryKey: ["dash2", "issuances"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_issuances" as never).select("id,status,source_type,source_id,destination_type,destination_id,created_at");
    if (error) throw error; return (data as unknown as ScopedMovement[]) ?? [];
  }});
  const demandsQ = useQuery({ queryKey: ["dash2", "demands"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_demands" as never).select("id,demand_number,status,branch_id,warehouse_id,requester_candidate_id,demand_date,created_at,submitted_at");
    if (error) throw error; return (data as unknown as Demand[]) ?? [];
  }});
  const capsQ = useQuery({ queryKey: ["dash2", "caps"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_caps" as never).select("scope_type,scope_id,min_value,max_value");
    if (error) throw error;
    return (data as unknown as { scope_type: "branch" | "field_officer"; scope_id: string | null; min_value: number; max_value: number }[]) ?? [];
  }});

  const itemsRaw = itemsQ.data ?? [];
  const cats = catsQ.data ?? [];
  const sizes = sizesQ.data ?? [];
  const balancesRaw = balancesQ.data ?? [];
  const vendorsRaw = vendorsQ.data ?? [];
  const rateCardsRaw = rateCardsQ.data ?? [];
  const posRaw = poQ.data ?? [];
  const poLines = poLinesQ.data ?? [];
  const cands = candsQ.data ?? [];
  const desigs = desigQ.data ?? [];
  const branchesRaw = branchesQ.data ?? [];
  const grnsRaw = grnQ.data ?? [];
  
  const whsRaw = whsQ.data ?? [];
  const transfersRaw = transfersQ.data ?? [];
  const issuancesRaw = issuancesQ.data ?? [];
  const demandsRaw = demandsQ.data ?? [];
  const canUseScopedData = !scope.isScoped || (!!scope.branchId && !scopeAssignmentsQ.isLoading);

  // ===== Branch-scope hard-filter =====
  // When the user is locked to a single branch, strip everything that does
  // not belong to that branch (or its mapped field officers).
  const items = itemsRaw;
  const balances = useMemo(() => {
    if (!scope.isScoped || !scope.branchId) return balancesRaw;
    return balancesRaw.filter((b) =>
      (b.location_type === "branch" && b.location_id === scope.branchId) ||
      ((b.location_type === "field_officer" || b.location_type === "guard") && allowedFoIds.has(b.location_id)),
    );
  }, [balancesRaw, scope.isScoped, scope.branchId, allowedFoIds]);
  const vendors = scope.isScoped ? [] : vendorsRaw;
  const rateCards = scope.isScoped ? [] : rateCardsRaw;
  const pos = scope.isScoped ? [] : posRaw;
  const grns = useMemo(() => {
    if (!scope.isScoped || !scope.branchId) return grnsRaw;
    return grnsRaw.filter((g) => g.branch_id === scope.branchId);
  }, [grnsRaw, scope.isScoped, scope.branchId]);
  const whs = scope.isScoped ? [] : whsRaw;
  const branches = useMemo(
    () => (scope.isScoped && scope.branchId ? branchesRaw.filter((b) => b.id === scope.branchId) : branchesRaw),
    [branchesRaw, scope.isScoped, scope.branchId],
  );
  const transfers = useMemo(() => {
    if (!scope.isScoped || !scope.branchId) return transfersRaw;
    if (!canUseScopedData) return [];
    return transfersRaw.filter((t) =>
      (t.source_type === "branch" && t.source_id === scope.branchId) ||
      (t.destination_type === "branch" && t.destination_id === scope.branchId) ||
      ((t.source_type === "field_officer" || t.source_type === "guard") && allowedFoIds.has(t.source_id)) ||
      ((t.destination_type === "field_officer" || t.destination_type === "guard") && allowedFoIds.has(t.destination_id)),
    );
  }, [transfersRaw, scope.isScoped, scope.branchId, canUseScopedData, allowedFoIds]);
  const issuances = useMemo(() => {
    if (!scope.isScoped || !scope.branchId) return issuancesRaw;
    if (!canUseScopedData) return [];
    return issuancesRaw.filter((i) =>
      (i.source_type === "branch" && i.source_id === scope.branchId) ||
      (i.destination_type === "branch" && i.destination_id === scope.branchId) ||
      ((i.source_type === "field_officer" || i.source_type === "guard") && allowedFoIds.has(i.source_id)) ||
      ((i.destination_type === "field_officer" || i.destination_type === "guard") && allowedFoIds.has(i.destination_id)),
    );
  }, [issuancesRaw, scope.isScoped, scope.branchId, canUseScopedData, allowedFoIds]);
  const demands = useMemo(() => {
    if (!scope.isScoped || !scope.branchId) return demandsRaw;
    if (!canUseScopedData) return [];
    return demandsRaw.filter((d) =>
      d.branch_id === scope.branchId ||
      (d.requester_candidate_id && allowedFoIds.has(d.requester_candidate_id)),
    );
  }, [demandsRaw, scope.isScoped, scope.branchId, canUseScopedData, allowedFoIds]);

  const { canSub } = useCurrentPermissions();


  const totalStockQty = useMemo(() => balances.reduce((s, b) => s + Math.max(0, Number(b.qty || 0)), 0), [balances]);

  const poSplit = useMemo(() => {
    const open = pos.filter((p) => ["draft", "approved", "partial", "open", "partially_received"].includes(p.status)).length;
    const closed = pos.filter((p) => ["received", "closed"].includes(p.status)).length;
    return { total: pos.length, open, closed };
  }, [pos]);
  const grnSplit = useMemo(() => {
    const received = grns.filter((g) => g.status === "received" || g.status === "draft").length;
    const posted = grns.filter((g) => g.status === "posted").length;
    return { total: grns.length, received, posted };
  }, [grns]);
  const transferSplit = useMemo(() => {
    const inTransit = transfers.filter((t) => ["in_transit", "dispatched"].includes(t.status)).length;
    const ack = transfers.filter((t) => ["completed", "received"].includes(t.status)).length;
    return { total: transfers.length, inTransit, ack };
  }, [transfers]);
  const issuanceSplit = useMemo(() => {
    const issued = issuances.filter((i) => i.status === "issued").length;
    const ack = issuances.filter((i) => i.status === "completed").length;
    return { total: issuances.length, issued, ack };
  }, [issuances]);

  // ====== Live Notifications / Pending Actions ======
  // SLA in days — anything older than this counts as "delayed".
  const SLA_DAYS = 3;
  const now = Date.now();
  const ageDays = (iso: string | null | undefined) =>
    iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86400000)) : 0;
  const ageBreakdown = <T extends { created_at: string }>(rows: T[]) => {
    let breached = 0; let oldest = 0;
    for (const r of rows) {
      const a = ageDays(r.created_at);
      if (a > SLA_DAYS) breached += 1;
      if (a > oldest) oldest = a;
    }
    return { breached, oldest };
  };
  const notifications = useMemo(() => {
    const openPOsAll = pos.filter((p) => ["draft", "approved", "partial", "open", "partially_received"].includes(p.status));
    const pendingDemands = demands.filter((d) => !["fulfilled", "cancelled", "rejected"].includes(d.status));
    const pendingGRNs = grns.filter((g) => g.status === "received" || g.status === "draft");
    const inTransit = transfers.filter((t) => ["in_transit", "dispatched"].includes(t.status));
    const pendingAck = issuances.filter((i) => i.status === "issued");
    return [
      { key: "demands", label: "Open Demands", hint: "Submitted, awaiting fulfilment", to: "/admin/inventory/demands", icon: ClipboardList, accent: "text-violet-500", count: pendingDemands.length, ...ageBreakdown(pendingDemands) },
      ...(!scope.isScoped ? [{ key: "pos", label: "Open Purchase Orders", hint: "Draft / Approved / Partial", to: "/admin/inventory/purchase-orders", icon: FileText, accent: "text-blue-500", count: openPOsAll.length, ...ageBreakdown(openPOsAll) }] : []),
      { key: "grns", label: "Delivery Challans to Post", hint: "Received but not posted", to: "/admin/inventory/goods-receipts", icon: ClipboardCheck, accent: "text-cyan-500", count: pendingGRNs.length, ...ageBreakdown(pendingGRNs) },
      { key: "transfers", label: "Transfers In-Transit", hint: "Dispatched, awaiting receipt", to: "/admin/inventory/transfers", icon: Truck, accent: "text-amber-500", count: inTransit.length, ...ageBreakdown(inTransit) },
      { key: "issuances", label: "Issuances Awaiting Ack", hint: "Issued, awaiting confirmation", to: "/admin/inventory/issuances", icon: UserPlus, accent: "text-teal-500", count: pendingAck.length, ...ageBreakdown(pendingAck) },
    ];
  }, [pos, demands, grns, transfers, issuances, scope.isScoped]);
  const totalPending = notifications.reduce((s, n) => s + n.count, 0);
  const totalBreached = notifications.reduce((s, n) => s + n.breached, 0);


  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const candMap = useMemo(() => new Map(cands.map((c) => [c.id, c])), [cands]);
  const desigMap = useMemo(() => new Map(desigs.map((d) => [d.id, d])), [desigs]);
  const branchMap = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const catMap = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats]);

  // Items respecting category filter
  const itemPasses = (id: string) => {
    if (categoryFilter === "all") return true;
    return itemMap.get(id)?.category_id === categoryFilter;
  };
  const balPasses = (b: Balance) => {
    if (!itemPasses(b.item_id)) return false;
    if (warehouseFilter === "all") return true;
    if (warehouseFilter.startsWith("branch:")) {
      return b.location_type === "branch" && b.location_id === warehouseFilter.slice(7);
    }
    return b.location_type === "warehouse" && b.location_id === warehouseFilter;
  };

  // In-transit transfers (dispatched but not yet received) still belong to
  // the organisation — count them toward stock value so the KPI matches
  // what the warehouse actually shipped.
  const transferLines = transferLinesQ.data ?? [];
  const inTransitTransferIds = useMemo(
    () => new Set(transfers.filter((t) => ["in_transit", "dispatched"].includes(t.status)).map((t) => t.id)),
    [transfers],
  );
  const transferById = useMemo(() => new Map(transfers.map((t) => [t.id, t])), [transfers]);
  const transferLinePasses = (l: { transfer_id: string; item_id: string }) => {
    if (!itemPasses(l.item_id)) return false;
    if (warehouseFilter === "all") return true;
    const t = transferById.get(l.transfer_id);
    if (!t) return false;
    if (warehouseFilter.startsWith("branch:")) {
      const id = warehouseFilter.slice(7);
      return (t.source_type === "branch" && t.source_id === id) || (t.destination_type === "branch" && t.destination_id === id);
    }
    return (t.source_type === "warehouse" && t.source_id === warehouseFilter) || (t.destination_type === "warehouse" && t.destination_id === warehouseFilter);
  };

  // ===== KPIs =====
  const stockValue = useMemo(() => {
    let v = 0;
    for (const b of balances) {
      if (!balPasses(b)) continue;
      const it = itemMap.get(b.item_id);
      if (!it) continue;
      v += Number(b.qty) * Number(it.standard_cost || 0);
    }
    for (const l of transferLines) {
      if (!inTransitTransferIds.has(l.transfer_id)) continue;
      if (!transferLinePasses(l)) continue;
      const it = itemMap.get(l.item_id);
      if (!it) continue;
      const outstanding = Math.max(0, Number(l.dispatched_qty || 0) - Number(l.received_qty || 0));
      v += outstanding * Number(it.standard_cost || 0);
    }
    return v;
  }, [balances, itemMap, categoryFilter, warehouseFilter, transferLines, inTransitTransferIds, transferById]);

  // ===== Inventory Caps =====
  const caps = capsQ.data ?? [];
  const capLookup = useMemo(() => {
    const branchDefault = caps.find((c) => c.scope_type === "branch" && !c.scope_id) ?? null;
    const foDefault = caps.find((c) => c.scope_type === "field_officer" && !c.scope_id) ?? null;
    const overrides = new Map<string, { min_value: number; max_value: number }>();
    for (const c of caps) if (c.scope_id) overrides.set(`${c.scope_type}:${c.scope_id}`, c);
    return { branchDefault, foDefault, overrides };
  }, [caps]);
  const getCap = (kind: "branch" | "field_officer", id: string) => {
    const ov = capLookup.overrides.get(`${kind}:${id}`);
    const def = kind === "branch" ? capLookup.branchDefault : capLookup.foDefault;
    return { min: ov?.min_value ?? def?.min_value ?? 0, max: ov?.max_value ?? def?.max_value ?? 0 };
  };
  // Value at a specific location only (matches Caps page math)
  const locValue = (locType: "branch" | "field_officer" | "guard", locId: string) => {
    let v = 0;
    for (const b of balancesRaw) {
      if (b.location_type !== locType || b.location_id !== locId) continue;
      const it = itemMap.get(b.item_id); if (!it) continue;
      v += Number(b.qty) * Number(it.standard_cost || 0);
    }
    return v;
  };
  // Scoped user's primary cap (branch for branch-roles, FO for field officers)
  const myCap = useMemo(() => {
    if (role.isFieldOfficer && role.candidateId) {
      const { min, max } = getCap("field_officer", role.candidateId);
      return { kind: "field_officer" as const, max, min, used: locValue("field_officer", role.candidateId) };
    }
    if (scope.isScoped && scope.branchId) {
      const { min, max } = getCap("branch", scope.branchId);
      return { kind: "branch" as const, max, min, used: locValue("branch", scope.branchId) };
    }
    return null;
  }, [role.isFieldOfficer, role.candidateId, scope.isScoped, scope.branchId, caps, balancesRaw, itemMap]);

  // For admin (non-scoped) — find branches/FOs at or beyond min threshold
  const capAlerts = useMemo(() => {
    if (scope.isScoped) return [] as { kind: "branch" | "field_officer"; id: string; name: string; used: number; min: number; max: number; status: "amber" | "red" }[];
    const rows: { kind: "branch" | "field_officer"; id: string; name: string; used: number; min: number; max: number; status: "amber" | "red" }[] = [];
    for (const b of branchesRaw) {
      const { min, max } = getCap("branch", b.id);
      if (max <= 0 && min <= 0) continue;
      const used = locValue("branch", b.id);
      const status: "amber" | "red" | null = max > 0 && used >= max ? "red" : min > 0 && used >= min ? "amber" : null;
      if (status) rows.push({ kind: "branch", id: b.id, name: b.code ? `${b.code} – ${b.name}` : b.name, used, min, max, status });
    }
    for (const c of cands.filter((c) => c.role_key === "field_officer")) {
      const { min, max } = getCap("field_officer", c.id);
      if (max <= 0 && min <= 0) continue;
      const used = locValue("field_officer", c.id);
      const status: "amber" | "red" | null = max > 0 && used >= max ? "red" : min > 0 && used >= min ? "amber" : null;
      if (status) rows.push({ kind: "field_officer", id: c.id, name: `${c.full_name}${c.employee_code ? ` · ${c.employee_code}` : ""}`, used, min, max, status });
    }
    return rows.sort((a, b) => (a.status === b.status ? b.used - a.used : a.status === "red" ? -1 : 1));
  }, [scope.isScoped, branchesRaw, cands, caps, balancesRaw, itemMap]);

  const inPeriod = (d: string | Date) => {
    const x = new Date(d);
    return x >= w.from && x <= w.to;
  };
  const inPrevPeriod = (d: string | Date) => {
    const x = new Date(d);
    return x >= w.prevFrom && x <= w.prevTo;
  };

  const spendCur = useMemo(() => pos.filter((p) => inPeriod(p.po_date)).reduce((s, p) => s + Number(p.grand_total || 0), 0), [pos, w]);
  const spendPrev = useMemo(() => pos.filter((p) => inPrevPeriod(p.po_date)).reduce((s, p) => s + Number(p.grand_total || 0), 0), [pos, w]);
  const posInPeriod = useMemo(() => pos.filter((p) => inPeriod(p.po_date)).length, [pos, w]);
  const posPrev = useMemo(() => pos.filter((p) => inPrevPeriod(p.po_date)).length, [pos, w]);
  const grnsInPeriod = useMemo(() => grns.filter((g) => inPeriod(g.receipt_date)).length, [grns, w]);
  const grnsPrev = useMemo(() => grns.filter((g) => inPrevPeriod(g.receipt_date)).length, [grns, w]);
  const openPOs = pos.filter((p) => ["draft", "approved", "partial"].includes(p.status)).length;
  

  // Low stock
  const lowStock = useMemo(() => {
    const grouped = new Map<string, { item_id: string; size_value: string; total: number }>();
    for (const b of balances) {
      if (!balPasses(b)) continue;
      if (b.location_type !== "warehouse" && b.location_type !== "branch") continue;
      const key = `${b.item_id}|${b.size_value}`;
      const cur = grouped.get(key) ?? { item_id: b.item_id, size_value: b.size_value, total: 0 };
      cur.total += Number(b.qty ?? 0);
      grouped.set(key, cur);
    }
    const sizeMap = new Map(sizes.map((s) => [`${s.item_id}|${s.size_value}`, s.reorder_level]));
    const rows: { item: Item; size_value: string; qty: number; reorder: number }[] = [];
    for (const [key, g] of grouped) {
      const item = itemMap.get(g.item_id);
      if (!item) continue;
      const reorder = sizeMap.get(key) ?? item.default_reorder_level;
      if (reorder > 0 && g.total <= reorder) rows.push({ item, size_value: g.size_value, qty: g.total, reorder });
    }
    // Also include items with zero balance everywhere (no record but reorder>0)
    return rows.sort((a, b) => a.qty / Math.max(1, a.reorder) - b.qty / Math.max(1, b.reorder));
  }, [balances, sizes, itemMap, categoryFilter, warehouseFilter]);

  // Cheapest vendor per item
  const cheapestPerItem = useMemo(() => {
    const map = new Map<string, { vendor_id: string; unit_price: number; count: number }>();
    for (const rc of rateCards) {
      if (!itemPasses(rc.item_id)) continue;
      const cur = map.get(rc.item_id);
      if (!cur) map.set(rc.item_id, { vendor_id: rc.vendor_id, unit_price: rc.unit_price, count: 1 });
      else {
        cur.count += 1;
        if (rc.unit_price < cur.unit_price) { cur.vendor_id = rc.vendor_id; cur.unit_price = rc.unit_price; }
      }
    }
    return Array.from(map.entries()).map(([item_id, v]) => ({
      item: itemMap.get(item_id), vendor: vendorMap.get(v.vendor_id), unit_price: v.unit_price, vendor_count: v.count,
    })).filter((r) => r.item && r.vendor);
  }, [rateCards, itemMap, vendorMap, categoryFilter]);

  // Vendor spend (period)
  const vendorSpend = useMemo(() => {
    const poVendor = new Map(pos.filter((p) => inPeriod(p.po_date)).map((p) => [p.id, { vendor_id: p.vendor_id, total: Number(p.grand_total || 0) }]));
    const tally = new Map<string, number>();
    for (const [, v] of poVendor) tally.set(v.vendor_id, (tally.get(v.vendor_id) ?? 0) + v.total);
    return Array.from(tally.entries())
      .map(([vid, total]) => ({ vendor: vendorMap.get(vid), total }))
      .filter((r) => r.vendor)
      .sort((a, b) => b.total - a.total);
  }, [pos, vendorMap, w]);

  // Spend over time (chart)
  const spendSeries = useMemo(() => {
    const buckets = new Map<string, { date: string; spend: number; orders: number }>();
    const days = Math.max(1, Math.ceil((w.to.getTime() - w.from.getTime()) / 86400000) + 1);
    for (let i = 0; i < days; i++) {
      const d = new Date(w.from); d.setDate(w.from.getDate() + i);
      const k = d.toISOString().slice(0, 10);
      buckets.set(k, { date: k, spend: 0, orders: 0 });
    }
    for (const p of pos) {
      if (!inPeriod(p.po_date)) continue;
      const k = new Date(p.po_date).toISOString().slice(0, 10);
      const cur = buckets.get(k);
      if (cur) { cur.spend += Number(p.grand_total || 0); cur.orders += 1; }
    }
    return Array.from(buckets.values());
  }, [pos, w]);

  // Top items by current stock value
  const topItems = useMemo(() => {
    const tally = new Map<string, { item: Item; qty: number; value: number }>();
    for (const b of balances) {
      if (!balPasses(b)) continue;
      const it = itemMap.get(b.item_id); if (!it) continue;
      const cur = tally.get(b.item_id) ?? { item: it, qty: 0, value: 0 };
      cur.qty += Number(b.qty); cur.value += Number(b.qty) * Number(it.standard_cost || 0);
      tally.set(b.item_id, cur);
    }
    return Array.from(tally.values()).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [balances, itemMap, categoryFilter, warehouseFilter]);

  // Category split
  const catSplit = useMemo(() => {
    const tally = new Map<string, number>();
    for (const b of balances) {
      if (!balPasses(b)) continue;
      const it = itemMap.get(b.item_id); if (!it) continue;
      const cName = (it.category_id && catMap.get(it.category_id)) || "Uncategorised";
      tally.set(cName, (tally.get(cName) ?? 0) + Number(b.qty) * Number(it.standard_cost || 0));
    }
    return Array.from(tally.entries()).map(([name, value]) => ({ name, value }));
  }, [balances, itemMap, catMap, categoryFilter, warehouseFilter]);

  // Holdings — per location, with item breakdown
  type HoldingLine = { item_id: string; item_name: string; item_code: string; size_value: string; qty: number; value: number };
  type HoldingEntry = { id: string; qty: number; value: number; lines: HoldingLine[] };
  const buildHoldings = (locType: string): HoldingEntry[] => {
    const byLoc = new Map<string, Map<string, HoldingLine>>();
    for (const b of balances) {
      if (b.location_type !== locType) continue;
      if (!itemPasses(b.item_id)) continue;
      if (Number(b.qty) <= 0) continue;
      const it = itemMap.get(b.item_id);
      if (!it) continue;
      const key = `${b.item_id}|${b.size_value}`;
      const m = byLoc.get(b.location_id) ?? new Map<string, HoldingLine>();
      const cur = m.get(key) ?? {
        item_id: b.item_id,
        item_name: it.name,
        item_code: it.item_code,
        size_value: b.size_value,
        qty: 0,
        value: 0,
      };
      cur.qty += Number(b.qty);
      cur.value += Number(b.qty) * Number(it.standard_cost || 0);
      m.set(key, cur);
      byLoc.set(b.location_id, m);
    }
    return Array.from(byLoc.entries()).map(([id, m]) => {
      const lines = Array.from(m.values()).sort((a, b) => b.qty - a.qty);
      return {
        id,
        qty: lines.reduce((s, l) => s + l.qty, 0),
        value: lines.reduce((s, l) => s + l.value, 0),
        lines,
      };
    }).sort((a, b) => b.qty - a.qty);
  };
  const guardHoldings = useMemo(() => buildHoldings("guard"), [balances, itemMap, categoryFilter, warehouseFilter]);
  const foHoldings = useMemo(() => buildHoldings("field_officer"), [balances, itemMap, categoryFilter, warehouseFilter]);
  const branchHoldings = useMemo(() => buildHoldings("branch"), [balances, itemMap, categoryFilter, warehouseFilter]);


  // Recent activity
  const recent = useMemo(() => {
    const events: { ts: string; type: string; label: string; value?: string; href: string }[] = [];
    for (const p of pos) events.push({ ts: p.po_date, type: "PO", label: `${p.po_number} · ${vendorMap.get(p.vendor_id)?.name ?? "vendor"}`, value: inr(Number(p.grand_total || 0)), href: "/admin/inventory/purchase-orders" });
    for (const g of grns) events.push({ ts: g.receipt_date, type: "GRN", label: `Goods received`, href: "/admin/inventory/goods-receipts" });
    return events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 10);
  }, [pos, grns, vendorMap]);

  const filter = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());
  const branchDashboardLoading = scope.isLoading || (scope.isScoped && scopeAssignmentsQ.isLoading);

  return (
    <div className="space-y-4 sm:space-y-6">
      <ScopeBanner />
      {branchDashboardLoading ? (
        <div className="flex min-h-[32vh] items-center justify-center rounded-2xl border border-border bg-card/60 text-sm text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/70" />
        </div>
      ) : (
        <>
      {/* Filter bar */}
      <div className="grid grid-cols-2 items-center gap-2 rounded-2xl border border-border bg-card/60 p-2.5 backdrop-blur sm:flex sm:flex-wrap sm:p-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="col-span-2 h-9 w-full sm:w-[220px]" />
        {scope.isScoped ? (
          <div className="col-span-2 flex h-9 items-center rounded-lg border border-border bg-secondary/40 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:col-auto">
            Branch: {scope.branchLabel || branches[0]?.name || "Assigned branch"}
          </div>
        ) : (
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="h-9 w-full sm:w-[220px]"><SelectValue placeholder="Warehouse / Branch" /></SelectTrigger>
            <SelectContent className="max-h-[320px]">
              <SelectItem value="all">All warehouses and branches ({whs.length + branches.length})</SelectItem>
              {whs.length > 0 && (
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Warehouses</div>
              )}
              {whs.map((wh) => <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>)}
              {branches.length > 0 && (
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Branches</div>
              )}
              {branches.map((b) => <SelectItem key={b.id} value={`branch:${b.id}`}>{b.name}{b.code ? ` (${b.code})` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 w-full sm:w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="col-span-2 flex flex-wrap items-center gap-2 sm:ml-auto">
          {range === "custom" && (
            <>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 flex-1 sm:w-[150px] sm:flex-none" />
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 flex-1 sm:w-[150px] sm:flex-none" />
            </>
          )}
          <div className="grid w-full grid-cols-2 gap-1 rounded-xl bg-secondary/40 p-1 sm:flex sm:w-auto sm:items-center">
            {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition sm:px-3 sm:text-xs ${range === r ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >{RANGE_LABEL[r]}</button>
            ))}
          </div>
        </div>
      </div>

      {scope.isScoped ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
          {(() => {
            const capLabel = myCap?.kind === "field_officer" ? "My Stock Value" : "Branch Stock Value";
            const capValue = myCap
              ? (myCap.max > 0 ? `${inr(myCap.used)} / ${inr(myCap.max)}` : inr(myCap.used))
              : inr(stockValue);
            const pct = myCap && myCap.max > 0 ? Math.round((myCap.used / myCap.max) * 100) : null;
            const hint = myCap && myCap.max > 0
              ? `${pct}% of cap${myCap.used >= myCap.max ? " · CAP REACHED" : myCap.min > 0 && myCap.used >= myCap.min ? " · nearing cap" : ""}`
              : (myCap?.kind === "field_officer" ? "Stock held against your field officer cap" : "Your branch and mapped field officers only");
            const tint = pct !== null && pct >= 100 ? "from-rose-500/20 to-rose-500/0"
              : pct !== null && pct >= 80 ? "from-amber-500/20 to-amber-500/0"
              : "from-emerald-500/15 to-emerald-500/0";
            const iconClass = pct !== null && pct >= 100 ? "text-rose-500"
              : pct !== null && pct >= 80 ? "text-amber-500"
              : "text-emerald-500";
            return <Kpi label={capLabel} value={capValue} icon={Wallet} tint={tint} iconClass={iconClass} hint={hint} to="/admin/inventory/stock" />;
          })()}
          <Kpi label="Branch Stock" value={branchHoldings.reduce((s, r) => s + r.qty, 0).toLocaleString("en-IN")} icon={Building2} tint="from-blue-500/15 to-blue-500/0" iconClass="text-blue-500" hint="In branch holding" to="/admin/inventory/stock" />
          <Kpi label="Field Officer Stock" value={foHoldings.reduce((s, r) => s + r.qty, 0).toLocaleString("en-IN")} icon={Users} tint="from-violet-500/15 to-violet-500/0" iconClass="text-violet-500" hint="Mapped to your branch" to="/admin/inventory/stock" />
          <Kpi label="Guard Stock" value={guardHoldings.reduce((s, r) => s + r.qty, 0).toLocaleString("en-IN")} icon={ShieldCheck} tint="from-teal-500/15 to-teal-500/0" iconClass="text-teal-500" hint="Under your branch chain" to="/admin/inventory/stock" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
          <Kpi label="Stock Value" value={inr(stockValue)} icon={Wallet} tint="from-emerald-500/15 to-emerald-500/0" iconClass="text-emerald-500" hint="On-hand + in-transit at standard cost" />
          <Kpi label="Low Stock Lines" value={lowStock.length.toString()} icon={AlertTriangle} tint="from-amber-500/15 to-amber-500/0" iconClass="text-amber-500" hint={`${openPOs} open POs`} to="/admin/inventory/stock" />
        </div>
      )}

      {/* Inventory Cap Alerts — visible to non-scoped admins (super admin / inventory manager) */}
      {!scope.isScoped && capAlerts.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-rose-500/5 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div>
                <div className="font-display text-sm font-bold tracking-tight">Inventory Cap Alerts</div>
                <div className="text-[11px] text-muted-foreground">
                  {capAlerts.filter((a) => a.status === "red").length} cap reached · {capAlerts.filter((a) => a.status === "amber").length} nearing cap
                </div>
              </div>
            </div>
            <Link to="/admin/inventory/caps" className="text-xs text-primary hover:underline flex items-center gap-1">Manage caps <ArrowRight className="h-3 w-3" /></Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {capAlerts.slice(0, 12).map((a) => {
              const pct = a.max > 0 ? Math.min(100, Math.round((a.used / a.max) * 100)) : 0;
              const barCls = a.status === "red" ? "bg-rose-500" : "bg-amber-500";
              const badgeCls = a.status === "red"
                ? "bg-rose-500/15 text-rose-600 border border-rose-500/30"
                : "bg-amber-500/15 text-amber-700 border border-amber-500/30";
              return (
                <div key={`${a.kind}:${a.id}`} className="rounded-xl border border-border bg-card/80 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{a.kind === "branch" ? "Branch" : "Field Officer"}</div>
                      <div className="truncate text-sm font-semibold">{a.name}</div>
                    </div>
                    <Badge className={badgeCls}>{a.status === "red" ? "Cap reached" : "Nearing"}</Badge>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between text-xs">
                    <span className="font-semibold tabular-nums">{inr(a.used)} <span className="text-muted-foreground font-normal">/ {inr(a.max)}</span></span>
                    <span className="text-muted-foreground tabular-nums">{pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary/60">
                    <div className={`h-full ${barCls}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live Notifications — pending actions across the inventory pipeline */}
      <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-5">
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:mb-4 sm:flex sm:flex-wrap sm:justify-between">
          <div className="flex items-center gap-2">
            <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-9 sm:w-9 ${totalPending > 0 ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`}>
              <Bell className="h-4 w-4" />
              {totalPending > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-amber-500 ring-2 ring-card" />}
            </span>
            <div>
              <div className="font-display text-sm font-bold tracking-tight">Live Notifications</div>
              <div className="text-[11px] text-muted-foreground">
                {totalPending === 0 ? "All caught up — nothing pending." : (
                  <>{totalPending} pending action{totalPending !== 1 ? "s" : ""}{totalBreached > 0 && <> · <span className="font-semibold text-rose-600">{totalBreached} past SLA ({SLA_DAYS}d)</span></>}</>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {(scope.isScoped || role.isFieldOfficer || role.isBranchManager) ? (
              <Link
                to="/admin/inventory/demands"
                search={{ new: "1" } as never}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
              >
                <Zap className="h-3.5 w-3.5" />Raise Demand
              </Link>
            ) : (
              <Link
                to="/admin/inventory/purchase-orders"
                search={{ new: "1" } as never}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-3 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
              >
                <Zap className="h-3.5 w-3.5" />Raise Purchase Order
              </Link>
            )}
            <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">SLA: {SLA_DAYS} days</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-5">
          {notifications.map(({ key, ...n }) => <NotifTile key={key} {...n} sla={SLA_DAYS} />)}
        </div>
      </div>


      {/* Overview — clickable totals across modules */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between px-1">
          <div className="font-display text-sm font-bold tracking-tight">{scope.isScoped ? "Branch Overview" : "Overview"}</div>
          {!scope.isScoped && <div className="text-[11px] text-muted-foreground">Click any tile to open the module</div>}
        </div>

        {/* Master counts */}
        {!scope.isScoped && <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          {canSub("inventory", "item_master") && <CountTile to="/admin/inventory/items" label="Products" value={items.length} icon={PackageOpen} accent="text-violet-500" />}
          {canSub("inventory", "vendors") && <CountTile to="/admin/inventory/vendors" label="Vendors" value={vendors.length} icon={ShoppingCart} accent="text-blue-500" />}
          {canSub("inventory", "warehouses") && <CountTile to="/admin/inventory/warehouses" label="Warehouses" value={whs.length} icon={Warehouse} accent="text-amber-500" />}
          {canSub("inventory", "stock_report") && <CountTile to="/admin/customers/branch-manager" label="Branches" value={branches.length} icon={Building2} accent="text-cyan-500" />}
        </div>}

        {/* Workflow counts with status split */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {!scope.isScoped && canSub("inventory", "purchase_orders") && (
            <WorkflowTile to="/admin/inventory/purchase-orders" label="Purchase Orders" value={poSplit.total} icon={FileText} accent="text-blue-500"
              chips={[{ label: "Open", value: poSplit.open, tone: "amber" }, { label: "Closed", value: poSplit.closed, tone: "emerald" }]} />
          )}
          {canSub("inventory", "goods_receipts") && (
            <WorkflowTile to="/admin/inventory/goods-receipts" label="Delivery Challans" value={grnSplit.total} icon={ClipboardList} accent="text-cyan-500"
              chips={[{ label: "Received", value: grnSplit.received, tone: "amber" }, { label: "Posted", value: grnSplit.posted, tone: "emerald" }]} />
          )}
          {canSub("inventory", "transfers") && (
            <WorkflowTile to="/admin/inventory/transfers" label="Transfers" value={transferSplit.total} icon={Truck} accent="text-violet-500"
              chips={[{ label: "In Transit", value: transferSplit.inTransit, tone: "amber" }, { label: "Ack.", value: transferSplit.ack, tone: "emerald" }]} />
          )}
          {canSub("inventory", "issuances") && (
            <WorkflowTile to="/admin/inventory/issuances" label="Issuances" value={issuanceSplit.total} icon={UserPlus} accent="text-teal-500"
              chips={[{ label: "Issued", value: issuanceSplit.issued, tone: "amber" }, { label: "Ack.", value: issuanceSplit.ack, tone: "emerald" }]} />
          )}
        </div>

      </div>


      {/* Holdings — who holds what, click for breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        <HoldingsCard
          title="Branch Holdings"
          icon={Building2}
          accent="text-blue-500"
          rows={branchHoldings.map((r) => {
            const b = branchMap.get(r.id);
            return {
              name: b ? `${b.code} · ${b.name}` : r.id.slice(0, 8),
              meta: `${r.lines.length} line${r.lines.length !== 1 ? "s" : ""}`,
              qty: r.qty,
              value: r.value,
              lines: r.lines,
            };
          })}
        />
        <HoldingsCard
          title="Field Officers"
          icon={Users}
          accent="text-violet-500"
          rows={foHoldings.map((r) => {
            const c = candMap.get(r.id);
            return {
              name: c?.full_name ?? r.id.slice(0, 8),
              meta: `${c?.employee_code ?? ""} · ${desigMap.get(c?.designation_id ?? "")?.name ?? "Field Officer"}`,
              qty: r.qty,
              value: r.value,
              lines: r.lines,
            };
          })}
        />
        <HoldingsCard
          title="Guards"
          icon={ShieldCheck}
          accent="text-teal-500"
          rows={guardHoldings.map((r) => {
            const c = candMap.get(r.id);
            return {
              name: c?.full_name ?? r.id.slice(0, 8),
              meta: `${c?.employee_code ?? ""} · ${desigMap.get(c?.designation_id ?? "")?.name ?? "Guard"}`,
              qty: r.qty,
              value: r.value,
              lines: r.lines,
            };
          })}
        />
      </div>



      {!scope.isScoped && (
        <div className="grid gap-4 lg:grid-cols-1">
          <Panel title="Low Stock Alerts" subtitle="Warehouse + Branch combined" right={<Link to="/admin/inventory/stock" className="text-xs text-primary hover:underline flex items-center gap-1">View stock <ArrowRight className="h-3 w-3" /></Link>}>
            {lowStock.length === 0 ? <Empty>Healthy — no items at reorder.</Empty> : (
              <DataTable head={["Item", "Size", "On Hand", "Reorder", ""]}>
                {lowStock.filter((r) => filter(r.item.name) || filter(r.item.item_code)).slice(0, 12).map((r, i) => {
                  const ratio = r.qty / Math.max(1, r.reorder);
                  return (
                    <tr key={i} className="border-t border-border/60">
                      <td className="p-2"><div className="font-medium">{r.item.name}</div><div className="text-xs text-muted-foreground">{r.item.item_code}</div></td>
                      <td className="p-2 text-muted-foreground">{r.size_value || "—"}</td>
                      <td className="p-2 tabular-nums font-semibold">{r.qty}</td>
                      <td className="p-2 tabular-nums text-muted-foreground">{r.reorder}</td>
                      <td className="p-2"><Badge variant={ratio < 0.25 ? "destructive" : "secondary"}>{ratio < 0.25 ? "Critical" : "Low"}</Badge></td>
                    </tr>
                  );
                })}
              </DataTable>
            )}
          </Panel>
        </div>
      )}


        </>
      )}
    </div>
  );
}

// ============= helpers =============
function delta(cur: number, prev: number) {
  if (prev === 0) return cur === 0 ? 0 : 100;
  return ((cur - prev) / prev) * 100;
}

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(220 70% 60%)",
  "hsl(160 70% 45%)",
  "hsl(280 70% 60%)",
  "hsl(30 90% 55%)",
  "hsl(340 75% 55%)",
];

function Kpi({ label, value, delta, icon: Icon, tint, iconClass, hint, to }: {
  label: string; value: string; delta?: number; icon: React.ComponentType<{ className?: string }>;
  tint: string; iconClass: string; hint?: string; to?: string;
}) {
  const up = (delta ?? 0) >= 0;
  const body = (
    <div className={`relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${tint} p-3 sm:p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs sm:tracking-wider">{label}</div>
          <div className="mt-1 truncate font-display text-xl font-bold tracking-tight sm:mt-2 sm:text-2xl">{value}</div>
          {delta !== undefined ? (
            <div className={`mt-1 flex items-center gap-1 text-[11px] font-medium sm:text-xs ${up ? "text-emerald-600" : "text-rose-600"}`}>
              {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(delta).toFixed(0)}% vs prev period
            </div>
          ) : hint ? (
            <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground sm:text-xs">{hint}</div>
          ) : null}
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-background/60 backdrop-blur sm:h-9 sm:w-9 ${iconClass}`}>
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </div>
      </div>
    </div>
  );
  if (to) return <Link to={to} className="block">{body}</Link>;
  return body;
}

function Panel({ title, subtitle, right, children, className = "" }: {
  title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-3.5 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
        <div>
          <div className="font-display text-sm font-bold tracking-tight">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

type HoldingRow = {
  name: string;
  meta: string;
  qty: number;
  value: number;
  lines: { item_id: string; item_name: string; item_code: string; size_value: string; qty: number; value: number }[];
};

function HoldingsCard({ title, icon: Icon, accent, rows }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  rows: HoldingRow[];
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const total = rows.reduce((s, r) => s + r.qty, 0);
  const active = openIdx !== null ? rows[openIdx] : null;
  return (
    <Panel title={title} subtitle={`${rows.length} holders · ${total.toLocaleString("en-IN")} units`}>
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/40 ${accent}`}><Icon className="h-4 w-4" /></div>
      {rows.length === 0 ? <Empty>Nothing in hand.</Empty> : (
        <div className="space-y-2">
          {rows.slice(0, 6).map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setOpenIdx(i)}
              className="flex w-full items-center justify-between rounded-lg border border-border/40 px-3 py-2 text-left transition hover:border-accent/50 hover:bg-accent/5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{r.name}</div>
                <div className="truncate text-xs text-muted-foreground">{r.meta}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums">
                <Boxes className="h-3.5 w-3.5 text-muted-foreground" />{r.qty.toLocaleString("en-IN")}
                <ArrowRight className="ml-1 h-3.5 w-3.5 text-muted-foreground/60" />
              </div>
            </button>
          ))}
          {rows.length > 6 && (
            <div className="pt-1 text-center text-[11px] text-muted-foreground">+ {rows.length - 6} more</div>
          )}
        </div>
      )}

      <Dialog open={openIdx !== null} onOpenChange={(o) => !o && setOpenIdx(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-secondary/40 ${accent}`}>
                <Icon className="h-4 w-4" />
              </span>
              {active?.name}
            </DialogTitle>
            <DialogDescription>
              {active?.meta} · {active?.qty.toLocaleString("en-IN")} units · {active ? inr(active.value) : ""}
            </DialogDescription>
          </DialogHeader>
          {active && (
            <div className="max-h-[60vh] overflow-auto">
              <DataTable head={["Item", "Code", "Size", "Qty", "Value"]}>
                {active.lines.map((l, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="p-2 font-medium">{l.item_name}</td>
                    <td className="p-2 text-xs text-muted-foreground">{l.item_code}</td>
                    <td className="p-2 text-muted-foreground">{l.size_value || "—"}</td>
                    <td className="p-2 tabular-nums font-semibold">{l.qty.toLocaleString("en-IN")}</td>
                    <td className="p-2 tabular-nums text-muted-foreground">{inr(l.value)}</td>
                  </tr>
                ))}
              </DataTable>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}


function DataTable({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-auto rounded-xl border border-border/60">
      <table className="ios-table w-full text-sm">
        <thead className="bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>{head.map((h, i) => <th key={i} className="p-2 text-left font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

function CountTile({ to, label, value, icon: Icon, accent }: { to: string; label: string; value: number; icon: React.ComponentType<{ className?: string }>; accent: string }) {
  return (
    <Link to={to} className="group flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3 transition hover:border-accent/40 hover:bg-accent/5 sm:gap-3 sm:p-4">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary/50 sm:h-10 sm:w-10 ${accent}`}><Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-[11px] sm:tracking-wider">{label}</div>
        <div className="font-display text-lg font-bold tabular-nums sm:text-xl">{value.toLocaleString("en-IN")}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-accent" />
    </Link>
  );
}

function HeroTile({ to, label, value, icon: Icon, accent }: { to: string; label: string; value: string; icon: React.ComponentType<{ className?: string }>; accent: string; tone?: string }) {
  return (
    <Link to={to} className="group relative overflow-hidden rounded-2xl border border-border bg-card p-3 transition hover:border-accent/40 hover:bg-accent/5 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-[11px] sm:tracking-wider">{label}</div>
          <div className="mt-1 truncate font-display text-xl font-bold tracking-tight sm:mt-2 sm:text-2xl">{value}</div>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary/50 sm:h-9 sm:w-9 ${accent}`}><Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></div>
      </div>
    </Link>
  );
}

function WorkflowTile({ to, label, value, icon: Icon, accent, chips }: {
  to: string; label: string; value: number; icon: React.ComponentType<{ className?: string }>; accent: string;
  chips: { label: string; value: number; tone: "amber" | "emerald" }[];
}) {
  const toneCls = (t: "amber" | "emerald") => t === "emerald" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  return (
    <Link to={to} className="group flex min-h-[112px] flex-col gap-2 rounded-2xl border border-border bg-card p-3 transition hover:border-accent/40 hover:bg-accent/5 sm:min-h-0 sm:p-4">
      <div className="flex items-center justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/50 ${accent}`}><Icon className="h-4 w-4" /></div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-accent" />
      </div>
      <div>
        <div className="line-clamp-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-[11px] sm:tracking-wider">{label}</div>
        <div className="font-display text-lg font-bold tabular-nums sm:text-xl">{value.toLocaleString("en-IN")}</div>
      </div>
      <div className="flex flex-wrap gap-1">
        {chips.map((c) => (
          <span key={c.label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneCls(c.tone)}`}>
            {c.label} <span className="tabular-nums">{c.value}</span>
          </span>
        ))}
      </div>
    </Link>
  );
}


function NotifTile({ label, hint, to, icon: Icon, accent, count, breached, oldest, sla }: {
  label: string; hint: string; to: string; icon: React.ComponentType<{ className?: string }>; accent: string;
  count: number; breached: number; oldest: number; sla: number;
}) {
  const isClear = count === 0;
  const isBreached = breached > 0;
  return (
    <Link to={to} className={`group relative flex min-h-[116px] flex-col gap-1.5 rounded-2xl border p-3 transition hover:bg-accent/5 sm:min-h-0 sm:gap-2 sm:p-4 ${isBreached ? "border-rose-500/40 bg-rose-500/5" : isClear ? "border-border bg-card" : "border-amber-500/30 bg-amber-500/5"}`}>
      <div className="flex items-center justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-background/70 ${accent}`}><Icon className="h-4 w-4" /></div>
        {!isClear && (
          <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${isBreached ? "bg-rose-500 text-white" : "bg-amber-500 text-white"}`}>
            {count}
          </span>
        )}
      </div>
      <div>
        <div className="line-clamp-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[11px] sm:tracking-wider">{label}</div>
        <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground sm:text-xs">{hint}</div>
      </div>
      {isClear ? (
        <div className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 sm:text-[11px]">
          <ClipboardCheck className="h-3 w-3" /> No pending actions
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 font-medium text-muted-foreground">
            <Clock className="h-3 w-3" /> Oldest {oldest}d
          </span>
          {isBreached && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 font-semibold text-rose-700 dark:text-rose-300">
              <AlertTriangle className="h-3 w-3" /> {breached} past {sla}d SLA
            </span>
          )}
        </div>
      )}
      <ArrowRight className="absolute bottom-3 right-3 h-3.5 w-3.5 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-accent" />
    </Link>
  );
}




function ScopeBanner() {
  const scope = useUserBranchScope();
  if (!scope.isScoped) return null;
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-2.5 text-sm">
      <Building2 className="h-4 w-4 text-accent" />
      <span className="font-medium text-foreground">Branch view:</span>
      <span className="text-muted-foreground">
        You are viewing data for <span className="font-semibold text-foreground">{scope.branchLabel || "your assigned branch"}</span> only.
      </span>
    </div>
  );
}
