import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Truck, Eye, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { toast } from "sonner";
import { confirmAction } from "@/components/ConfirmProvider";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { nextSeq, fmtNumber, postMovements, statusBadgeClass, type LocationType } from "@/lib/inv-helpers";
import { useUserBranchScope } from "@/lib/use-user-branch-scope";
import { useDemandRequesters } from "@/lib/use-demand-requesters";
import { useDocItemSummaries } from "@/lib/inv-doc-summary";



export const Route = createFileRoute("/admin/inventory/transfers")({ component: TransfersPage });

const MODULE = "Inventory Transfers";
const ENTITY = "inv_transfers";

type Transfer = {
  id: string; transfer_number: string; transfer_date: string; status: string;
  source_type: string; source_id: string; destination_type: string; destination_id: string;
  vehicle_number: string; driver_name: string; driver_phone: string; notes: string;
  demand_id: string | null;
};
type Warehouse = { id: string; name: string };
type Branch = { id: string; name: string; code: string };
type Item = { id: string; name: string; item_code: string; is_sized: boolean };
type Candidate = { id: string; full_name: string; employee_code: string; role_key: string };
type Demand = { id: string; demand_number: string; branch_id: string | null; warehouse_id: string | null; requester_candidate_id: string | null; status: string };
type DemandLine = { id: string; demand_id: string; item_id: string; size_value: string; requested_qty: number };
type Line = { id?: string; item_id: string; size_value: string; requested_qty: number; dispatched_qty: number; received_qty: number; variance_reason: string };

function TransfersPage() {
  const qc = useQueryClient();
  const { data: transfers = [] } = useQuery({
    queryKey: ["inv", "transfers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_transfers" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Transfer[]) ?? [];
    },
  });
  const { data: warehouses = [] } = useQuery({
    queryKey: ["inv", "warehouses-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_warehouses" as never).select("id,name").eq("enabled", true);
      if (error) throw error;
      return (data as unknown as Warehouse[]) ?? [];
    },
  });
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches" as never).select("id,name,code").order("name");
      if (error) throw error;
      return (data as unknown as Branch[]) ?? [];
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ["inv", "items-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_items" as never).select("id,name,item_code,is_sized").eq("enabled", true).order("name");
      if (error) throw error;
      return (data as unknown as Item[]) ?? [];
    },
  });
  const { data: openDemands = [] } = useQuery({
    queryKey: ["inv", "demands-open-for-transfer"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inv_demands" as never)
        .select("id,demand_number,branch_id,warehouse_id,requester_candidate_id,status")
        .in("status", ["submitted"])
        .order("demand_date", { ascending: false });
      if (error) throw error;
      return (data as unknown as Demand[]) ?? [];
    },
  });
  // Resolve requester → branch for demands that don't carry branch_id directly
  const requesterIds = useMemo(
    () => Array.from(new Set(openDemands.filter((d) => !d.branch_id && d.requester_candidate_id).map((d) => d.requester_candidate_id as string))),
    [openDemands],
  );
  const { data: requesterBranchMap = new Map<string, string>() } = useQuery({
    queryKey: ["inv", "demand-requester-branches", requesterIds],
    enabled: requesterIds.length > 0,
    queryFn: async () => {
      const m = new Map<string, string>();
      const { data: scopes, error } = await supabase
        .from("employee_scope_assignments" as never)
        .select("candidate_id,scope_id,scope_type")
        .eq("scope_type", "branch")
        .in("candidate_id", requesterIds);
      if (error) throw error;
      for (const r of (scopes as unknown as { candidate_id: string; scope_id: string }[]) ?? []) {
        if (!m.has(r.candidate_id)) m.set(r.candidate_id, r.scope_id);
      }
      // Fallback for field officers mapped via candidate_units → units.branch_id
      const missing = requesterIds.filter((id) => !m.has(id));
      if (missing.length) {
        const { data: cu } = await supabase
          .from("candidate_units" as never)
          .select("candidate_id,unit_id")
          .in("candidate_id", missing);
        const rows = (cu as unknown as { candidate_id: string; unit_id: string }[]) ?? [];
        const unitIds = Array.from(new Set(rows.map((r) => r.unit_id).filter(Boolean)));
        if (unitIds.length) {
          const { data: us } = await supabase
            .from("units" as never)
            .select("id,branch_id")
            .in("id", unitIds);
          const uMap = new Map(((us as unknown as { id: string; branch_id: string | null }[]) ?? []).map((u) => [u.id, u.branch_id]));
          for (const r of rows) {
            if (m.has(r.candidate_id)) continue;
            const b = uMap.get(r.unit_id);
            if (b) m.set(r.candidate_id, b);
          }
        }
      }
      return m;
    },
  });
  const demandDestBranchId = (d: Demand): string => {
    if (d.branch_id) return d.branch_id;
    if (d.requester_candidate_id) return requesterBranchMap.get(d.requester_candidate_id) ?? "";
    return "";
  };

  const branchLabel = (id: string | null) => {
    if (!id) return "—";
    const b = branches.find((x) => x.id === id);
    return b ? [b.code, b.name].filter(Boolean).join(" – ") : "—";
  };
  const locName = (type: string, id: string): string => {
    if (!id) return "—";
    if (type === "warehouse") return warehouses.find((w) => w.id === id)?.name ?? "—";
    if (type === "branch") return branchLabel(id);
    return "—";
  };
  const demandLabel = (d: Demand): string => branchLabel(demandDestBranchId(d) || null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Transfer | null>(null);

  const scope = useUserBranchScope();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = transfers;
    if (scope.isScoped && scope.branchId) {
      list = list.filter(
        (t) =>
          (t.source_type === "branch" && t.source_id === scope.branchId) ||
          (t.destination_type === "branch" && t.destination_id === scope.branchId),
      );
    }
    if (!q) return list;
    return list.filter((t) => t.transfer_number.toLowerCase().includes(q));
  }, [transfers, query, scope.isScoped, scope.branchId]);


  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inv", "transfers"] });
    qc.invalidateQueries({ queryKey: ["inv", "balances-sum"] });
  };

  const deleteMut = useMutation({
    mutationFn: async (t: Transfer) => {
      if (t.status !== "draft") throw new Error("Only drafts can be deleted.");
      const { error } = await supabase.from("inv_transfers" as never).delete().eq("id", t.id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: ENTITY, entityId: t.id, entityLabel: t.transfer_number });
    },
    onSuccess: invalidate,
  });
  const demandInfo = useDemandRequesters(filtered.map((t) => t.demand_id));

  return (
    <div>
      <PageHeader title="Internal Transfers" description="Move stock warehouse → branch, or branch → branch. Dispatch decreases source; receipt increases destination." crumbs={[{ label: "Uniform Manager", to: "/admin/inventory" }, { label: "Transfers" }]} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search transfer #…" className="h-10 rounded-lg pl-9" />
        </div>
        <Button onClick={() => { setActive(null); setOpen(true); }} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1.5 h-4 w-4" />New Transfer
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-clip">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Transfer #</th>
                <th className="px-5 py-3">Requested From</th>
                <th className="px-5 py-3">Requested By</th>
                <th className="px-5 py-3">From</th>
                <th className="px-5 py-3">To</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((t) => {
                const info = t.demand_id ? demandInfo.get(t.demand_id) : null;
                return (
                <tr key={t.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs">{t.transfer_number}</td>
                  <td className="px-5 py-3 font-mono text-xs">{info?.demandNumber ?? "—"}</td>
                  <td className="px-5 py-3">
                    {info ? (
                      <>
                        <div className="font-medium">{info.requesterName}</div>
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          {info.requesterRole}{info.requesterCode ? ` · ${info.requesterCode}` : ""}
                        </div>
                      </>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3">{locName(t.source_type, t.source_id)}</td>
                  <td className="px-5 py-3">{locName(t.destination_type, t.destination_id)}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{t.transfer_date}</td>
                  <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${statusBadgeClass(t.status)}`}>{t.status.replace("_", " ")}</span></td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setActive(t); setOpen(true); }}><Eye className="h-4 w-4" /></Button>
                      {t.status === "draft" && (
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={async () => {
                          if (!(await confirmAction({ title: "Delete?", description: `Delete ${t.transfer_number}?`, confirmText: "Delete" }))) return;
                          try { await deleteMut.mutateAsync(t); toast.success("Deleted"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                        }}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
              {!filtered.length && <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-muted-foreground"><Truck className="mx-auto mb-2 h-8 w-8 opacity-40" />No transfers yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>


      <TransferDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setActive(null); }} initial={active} warehouses={warehouses} branches={branches} items={items} demands={openDemands} resolveDemandDest={demandDestBranchId} demandLabel={demandLabel} onSaved={invalidate} />
    </div>
  );
}

function TransferDialog({ open, onOpenChange, initial, warehouses, branches, items, demands, resolveDemandDest, demandLabel, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; initial: Transfer | null;
  warehouses: Warehouse[]; branches: Branch[]; items: Item[]; demands: Demand[];
  resolveDemandDest: (d: Demand) => string; demandLabel: (d: Demand) => string;
  onSaved: () => void;
}) {
  const [sourceType, setSourceType] = useState<LocationType>("warehouse");
  const [sourceId, setSourceId] = useState("");
  const [destType, setDestType] = useState<LocationType>("branch");
  const [destId, setDestId] = useState("");
  const [demandId, setDemandId] = useState<string>("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [vehicle, setVehicle] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const isDraft = !initial || initial.status === "draft";
  const isDispatched = initial?.status === "dispatched" || initial?.status === "in_transit";

  // Available stock at the source warehouse, keyed by `${item_id}|${size_value}`
  const { data: stockMap = new Map<string, number>() } = useQuery({
    queryKey: ["inv", "stock-balances", sourceType, sourceId],
    enabled: !!sourceId && isDraft,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inv_stock_balances" as never)
        .select("item_id,size_value,qty")
        .eq("location_type", sourceType)
        .eq("location_id", sourceId);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of (data as unknown as { item_id: string; size_value: string | null; qty: number }[]) ?? []) {
        m.set(`${r.item_id}|${r.size_value ?? ""}`, Number(r.qty ?? 0));
      }
      return m;
    },
  });
  const availableFor = (l: Line) => stockMap.get(`${l.item_id}|${l.size_value ?? ""}`) ?? 0;
  const overDispatchLines = lines.filter((l) => l.dispatched_qty > availableFor(l));
  const overDemandLines = lines.filter((l) => l.dispatched_qty > l.requested_qty);

  const isReceived = initial?.status === "completed";

  async function loadDemand(id: string) {
    setDemandId(id);
    if (!id) { setLines([]); setDestId(""); return; }
    const d = demands.find((x) => x.id === id);
    if (!d) return;
    setDestType("branch");
    setDestId(resolveDemandDest(d));
    if (d.warehouse_id) { setSourceType("warehouse"); setSourceId(d.warehouse_id); }
    const { data, error } = await supabase.from("inv_demand_lines" as never).select("*").eq("demand_id", id).order("sort_order");
    if (error) { toast.error("Could not load demand lines"); return; }
    const rows = (data as unknown as DemandLine[]) ?? [];
    setLines(rows.map((r) => ({
      item_id: r.item_id,
      size_value: r.size_value ?? "",
      requested_qty: Number(r.requested_qty ?? 0),
      dispatched_qty: Number(r.requested_qty ?? 0),
      received_qty: 0,
      variance_reason: "",
    })));
  }

  useResetOnOpen(open, async () => {
    if (initial) {
      setSourceType(initial.source_type as LocationType);
      setSourceId(initial.source_id);
      setDestType(initial.destination_type as LocationType);
      setDestId(initial.destination_id);
      setDemandId(initial.demand_id ?? "");
      setTransferDate(initial.transfer_date);
      setVehicle(initial.vehicle_number); setDriverName(initial.driver_name); setDriverPhone(initial.driver_phone);
      setNotes(initial.notes);
      const { data } = await supabase.from("inv_transfer_lines" as never).select("*").eq("transfer_id", initial.id).order("sort_order");
      // Also pull demand lines to show "Demanded" qty per item
      const reqMap = new Map<string, number>();
      if (initial.demand_id) {
        const { data: dl } = await supabase.from("inv_demand_lines" as never).select("item_id,size_value,requested_qty").eq("demand_id", initial.demand_id);
        for (const r of (dl as unknown as { item_id: string; size_value: string; requested_qty: number }[]) ?? []) {
          reqMap.set(`${r.item_id}|${r.size_value ?? ""}`, Number(r.requested_qty ?? 0));
        }
      }
      setLines(((data as unknown as Record<string, unknown>[]) ?? []).map((r) => {
        const itemId = String(r.item_id);
        const sz = String(r.size_value ?? "");
        return {
          id: String(r.id),
          item_id: itemId,
          size_value: sz,
          requested_qty: reqMap.get(`${itemId}|${sz}`) ?? Number(r.dispatched_qty ?? 0),
          dispatched_qty: Number(r.dispatched_qty ?? 0),
          received_qty: Number(r.received_qty ?? 0),
          variance_reason: String(r.variance_reason ?? ""),
        };
      }));
    } else {
      setSourceType("warehouse"); setSourceId(""); setDestType("branch"); setDestId("");
      setDemandId("");
      setTransferDate(new Date().toISOString().slice(0, 10));
      setVehicle(""); setDriverName(""); setDriverPhone(""); setNotes(""); setLines([]);
    }
  });


  async function initiateTransfer() {
    if (!demandId) { toast.error("Pick a demand to transfer against"); return; }
    if (!sourceId) { toast.error("Pick the source warehouse"); return; }
    if (!destId) { toast.error("Destination branch missing"); return; }
    if (!lines.length || lines.some((l) => l.dispatched_qty <= 0)) {
      toast.error("Enter dispatched quantity for each line"); return;
    }
    if (overDemandLines.length) {
      const first = overDemandLines[0];
      const it = itemMap.get(first.item_id);
      toast.error(`Dispatched cannot exceed demanded for ${it?.name ?? "item"}: demanded ${first.requested_qty}, entered ${first.dispatched_qty}`);
      return;
    }
    if (overDispatchLines.length) {
      const first = overDispatchLines[0];
      const it = itemMap.get(first.item_id);
      toast.error(`Insufficient stock for ${it?.name ?? "item"}${first.size_value ? ` (${first.size_value})` : ""}: only ${availableFor(first)} in stock, ${first.dispatched_qty} requested`);
      return;
    }
    if (!(await confirmAction({ title: "Initiate this transfer?", description: "Stock will be deducted from the source warehouse and the demand will move to In Transit.", confirmText: "Initiate Transfer" }))) return;


    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const n = await nextSeq("inv_transfer_number_seq");
      const number = fmtNumber("TR", n);
      const { data: ins, error } = await supabase.from("inv_transfers" as never).insert({
        transfer_number: number, source_type: sourceType, source_id: sourceId,
        destination_type: destType, destination_id: destId,
        demand_id: demandId,
        transfer_date: transferDate, status: "in_transit",
        vehicle_number: "", driver_name: "", driver_phone: "", notes,
        dispatched_by: user?.id ?? null, dispatched_at: new Date().toISOString(),
      } as never).select("id").single();
      if (error) throw error;
      const tid = (ins as unknown as { id: string }).id;
      const linesPayload = lines.map((l, idx) => ({
        transfer_id: tid, item_id: l.item_id, size_value: l.size_value,
        dispatched_qty: l.dispatched_qty, received_qty: 0, sort_order: idx,
      }));
      await supabase.from("inv_transfer_lines" as never).insert(linesPayload as never);
      await postMovements(lines.filter((l) => l.dispatched_qty > 0).map((l) => ({
        movement_type: "TRANSFER_OUT", location_type: sourceType, location_id: sourceId,
        item_id: l.item_id, size_value: l.size_value, qty_change: -l.dispatched_qty,
        reference_type: "transfer", reference_id: tid,
      })));
      await supabase.from("inv_demands" as never).update({ status: "in_transit" } as never).eq("id", demandId);
      void logActivity({ module: MODULE, action: "dispatch", entityType: ENTITY, entityId: tid, entityLabel: number });
      toast.success("Transfer initiated — stock deducted, awaiting delivery challan from branch");
      onSaved(); onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{initial ? `Transfer ${initial.transfer_number}` : "New Transfer"}</DialogTitle>
          <DialogDescription>{initial?.status === "completed" ? "Completed." : isDispatched ? "Initiated — awaiting delivery challan from branch." : "Pick a branch demand and initiate the transfer. Source inventory will be deducted immediately."}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {isDraft && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Against Demand</div>
              <DemandSelect demands={demands} demandId={demandId} demandLabel={demandLabel} onChange={(v) => loadDemand(v)} />

              <p className="mt-1 text-[11px] text-muted-foreground">
                {demands.length
                  ? "Selecting a demand prefills the destination branch and the requested item lines."
                  : "Transfers fulfil branch-raised demands (warehouse → branch). Field Officer demands are fulfilled from Issuances, not here."}
              </p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">From (Warehouse)</div>
              <Select value={sourceId} onValueChange={setSourceId} disabled={!isDraft}>
                <SelectTrigger><SelectValue placeholder="Pick warehouse" /></SelectTrigger>
                <SelectContent>{warehouses.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="rounded-xl border border-border p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">To (Branch)</div>
              <div className="flex h-10 items-center rounded-md border border-input bg-muted/30 px-3 text-sm">
                {(() => { const br = branches.find((b) => b.id === destId); if (!br) return "—"; return [br.code, br.name].filter(Boolean).join(" – "); })()}
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:w-1/3">
            <Label>Date</Label>
            <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} disabled={!isDraft} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-semibold">Items</Label>
            </div>
            <div className="overflow-x-clip rounded-xl border border-border">
              <table className="ios-table w-full text-sm">
                <thead className="bg-secondary/60 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 w-16">Size</th>
                    <th className="px-3 py-2 w-24 text-right">Demanded</th>
                    {isDraft && <th className="px-3 py-2 w-24 text-right">In Stock</th>}
                    <th className="px-3 py-2 w-24 text-right">Dispatched</th>
                    {isDispatched && <th className="px-3 py-2 w-24 text-right">Received</th>}
                    {isDispatched && <th className="px-3 py-2">Variance Reason</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((l, idx) => {
                    const it = itemMap.get(l.item_id);
                    const avail = availableFor(l);
                    const cap = Math.min(l.requested_qty, avail);
                    const over = isDraft && (l.dispatched_qty > avail || l.dispatched_qty > l.requested_qty);
                    return (
                      <tr key={idx} className={over ? "bg-destructive/5" : undefined}>
                        <td className="px-3 py-2 font-medium">{it?.name ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{l.size_value || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.requested_qty}</td>
                        {isDraft && <td className={`px-3 py-2 text-right tabular-nums ${!sourceId ? "text-muted-foreground" : avail <= 0 ? "text-destructive" : avail < l.requested_qty ? "text-amber-600" : "text-muted-foreground"}`}>{sourceId ? avail : "—"}</td>}
                        <td className="px-2 py-1.5">
                          {isDraft
                            ? <Input
                                type="number"
                                min={0}
                                max={cap}
                                disabled={!sourceId}
                                className={`h-9 text-right ${over ? "border-destructive text-destructive" : ""}`}
                                value={l.dispatched_qty}
                                onChange={(e) => {
                                  const raw = Number(e.target.value) || 0;
                                  let v = Math.max(0, raw);
                                  if (v > l.requested_qty) { v = l.requested_qty; toast.error(`Dispatched cannot exceed demanded (${l.requested_qty})`); }
                                  if (sourceId && v > avail) { v = avail; toast.error(`Only ${avail} in stock for ${it?.name ?? "item"}`); }
                                  setLines((ls) => ls.map((x, i) => i === idx ? { ...x, dispatched_qty: v } : x));
                                }}
                              />
                            : <div className="text-right tabular-nums">{l.dispatched_qty}</div>}
                        </td>
                        {isDispatched && <td className="px-2 py-1.5 text-right tabular-nums">{l.received_qty}</td>}
                        {isDispatched && <td className="px-2 py-1.5 text-xs text-muted-foreground">{l.variance_reason || "—"}</td>}
                      </tr>
                    );
                  })}
                  {!lines.length && <tr><td colSpan={isDispatched ? 6 : (isDraft ? 5 : 4)} className="px-3 py-6 text-center text-xs text-muted-foreground">{isDraft ? "Pick a demand above to load items." : "No lines."}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isReceived} rows={2} /></div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Close</Button>
          {isDraft && <Button onClick={initiateTransfer} disabled={saving || !demandId || !sourceId || overDispatchLines.length > 0 || overDemandLines.length > 0}>{saving ? "Initiating…" : overDispatchLines.length > 0 ? "Insufficient stock" : overDemandLines.length > 0 ? "Exceeds demand" : "Initiate Transfer"}</Button>}
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}

function useResetOnOpen(open: boolean, reset: () => void) {
  const [last, setLast] = useState(false);
  if (open !== last) { setLast(open); if (open) reset(); }
}

function DemandSelect({ demands, demandId, demandLabel, onChange }: { demands: Demand[]; demandId: string; demandLabel: (d: Demand) => string; onChange: (v: string) => void }) {
  const { data: summaries = new Map<string, string>() } = useDocItemSummaries("inv_demand_lines", demands.map((d) => d.id));
  const requesterMap = useDemandRequesters(demands.map((d) => d.id));

  const renderRow = (d: Demand) => {
    const s = summaries.get(d.id);
    const r = requesterMap.get(d.id);
    const dest = demandLabel(d);
    const requester = r && r.requesterName !== "—"
      ? `${r.requesterName}${r.requesterRole ? ` · ${r.requesterRole}` : ""}${r.requesterCode ? ` (${r.requesterCode})` : ""}`
      : null;
    return (
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-semibold">
          <span className="font-mono">{d.demand_number}</span>
          {dest && dest !== "—" ? <span className="text-muted-foreground font-normal"> → {dest}</span> : null}
        </span>
        {requester && <span className="text-[11px] text-muted-foreground truncate">Requested by {requester}</span>}
        {s && <span className="text-[11px] text-muted-foreground truncate">{s}</span>}
      </div>
    );
  };

  const selected = demands.find((d) => d.id === demandId);
  return (
    <Select value={demandId} onValueChange={onChange} disabled={!demands.length}>
      <SelectTrigger className="h-auto min-h-11 py-2 items-start">
        {selected ? renderRow(selected) : <SelectValue placeholder={demands.length ? "Pick a submitted branch demand" : "No branch demands awaiting transfer"} />}
      </SelectTrigger>
      <SelectContent>
        {demands.map((d) => (
          <SelectItem key={d.id} value={d.id} className="py-2">{renderRow(d)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
