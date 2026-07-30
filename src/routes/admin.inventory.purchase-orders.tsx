import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2, FileText, Edit2, Eye, AlertTriangle, Download } from "lucide-react";
import { downloadPOPdf, type POPdfLine } from "@/lib/po-pdf";
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
import { useItemSizeOptions, type ItemSizeOptions } from "@/lib/inv-sizes";
import { nextSeq, fmtNumber, statusBadgeClass } from "@/lib/inv-helpers";

// PO status → user-facing delivery label. Legacy "approved" maps to Delivery Open.
const PO_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  open: "Delivery Open",
  approved: "Delivery Open",
  partially_received: "Delivery Ongoing",
  received: "Delivery Completed",
  closed: "Delivery Completed",
  cancelled: "Cancelled",
};
const poStatusLabel = (s: string) => PO_STATUS_LABEL[s] ?? s.replace(/_/g, " ");

// Editable status options shown in the dialog toggle.
const EDITABLE_STATUSES: Array<{ value: string; label: string }> = [
  { value: "open", label: "Delivery Open" },
  { value: "partially_received", label: "Delivery Ongoing" },
  { value: "received", label: "Delivery Completed" },
  { value: "cancelled", label: "Cancelled" },
];


export const Route = createFileRoute("/admin/inventory/purchase-orders")({ component: POPage });

const MODULE = "Inventory Purchase Orders";
const ENTITY = "inv_purchase_orders";

type Vendor = { id: string; name: string; vendor_code: string };
type Warehouse = { id: string; name: string; warehouse_code: string };
type Branch = { id: string; name: string; code: string };
type Item = { id: string; name: string; item_code: string; unit: string; is_sized: boolean };
type ItemSize = { item_id: string; size_value: string; sort_order: number };
type POLine = { id?: string; item_id: string; size_value: string; ordered_qty: number; unit_price: number; tax_percent: number; notes: string };
type RateCard = { vendor_id: string; item_id: string; size_value: string; unit_price: number; tax_percent: number };
type PO = {
  id: string;
  po_number: string;
  vendor_id: string | null;
  destination_warehouse_id: string | null;
  destination_branch_id: string | null;
  source_warehouse_id: string | null;
  requesting_branch_id: string | null;
  po_date: string;
  expected_date: string | null;
  status: string;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  notes: string;
};

// Combined location selector encoding: warehouses vs branches share one Select.
type LocKind = "wh" | "br";
const encLoc = (k: LocKind, id: string) => `${k}:${id}`;
const decLoc = (v: string | null | undefined): { kind: LocKind; id: string } | null => {
  if (!v) return null;
  const [k, id] = v.split(":");
  return (k === "wh" || k === "br") && id ? { kind: k, id } : null;
};

function POPage() {
  const qc = useQueryClient();
  const { data: pos = [] } = useQuery({
    queryKey: ["inv", "pos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inv_purchase_orders" as never)
        .select("id,po_number,vendor_id,destination_warehouse_id,destination_branch_id,source_warehouse_id,requesting_branch_id,po_date,expected_date,status,subtotal,tax_total,grand_total,notes")
        .eq("po_type", "vendor")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as PO[]) ?? [];
    },
  });
  const { data: branches = [] } = useQuery({
    queryKey: ["inv", "branches-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id,name,code").order("name");
      if (error) throw error;
      return (data as unknown as Branch[]) ?? [];
    },
  });
  const { data: vendors = [] } = useQuery({
    queryKey: ["inv", "vendors-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_vendors" as never).select("id,name,vendor_code").eq("enabled", true).order("name");
      if (error) throw error;
      return (data as unknown as Vendor[]) ?? [];
    },
  });
  const { data: warehouses = [] } = useQuery({
    queryKey: ["inv", "warehouses-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_warehouses" as never).select("id,name,warehouse_code").eq("enabled", true).order("name");
      if (error) throw error;
      return (data as unknown as Warehouse[]) ?? [];
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ["inv", "items-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_items" as never).select("id,name,item_code,unit,is_sized").eq("enabled", true).order("name");
      if (error) throw error;
      return (data as unknown as Item[]) ?? [];
    },
  });
  const { data: rateCards = [] } = useQuery({
    queryKey: ["inv", "rate-cards-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_vendor_rate_cards" as never).select("vendor_id,item_id,size_value,unit_price,tax_percent").eq("enabled", true);
      if (error) throw error;
      return (data as unknown as RateCard[]) ?? [];
    },
  });
  const { data: sizeOptions = new Map<string, ItemSizeOptions>() } = useItemSizeOptions();
  const itemSizes = useMemo<ItemSize[]>(() => {
    const rows: ItemSize[] = [];
    for (const [itemId, opt] of sizeOptions) {
      opt.options.forEach((size_value, i) => rows.push({ item_id: itemId, size_value, sort_order: i }));
    }
    return rows;
  }, [sizeOptions]);
  const { data: lineAgg = new Map<string, { products: number; qty: number }>() } = useQuery({
    queryKey: ["inv", "po-line-agg"],
    queryFn: async () => {
      // Paginate to bypass Supabase's 1000-row default and aggregate every line.
      const m = new Map<string, { products: number; qty: number }>();
      const pageSize = 1000;
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("inv_po_lines" as never)
          .select("po_id,ordered_qty")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = (data as unknown as Array<{ po_id: string; ordered_qty: number | null }>) ?? [];
        for (const r of rows) {
          const cur = m.get(r.po_id) ?? { products: 0, qty: 0 };
          cur.products += 1;
          cur.qty += Number(r.ordered_qty ?? 0) || 0;
          m.set(r.po_id, cur);
        }
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      return m;
    },
  });


  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const warehouseMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);
  const branchMap = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const locationLabel = (whId: string | null, brId: string | null) => {
    if (whId) return warehouseMap.get(whId)?.name ?? "—";
    if (brId) return branchMap.get(brId)?.name ?? "—";
    return "—";
  };

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PO | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("new") === "1") {
      setEditing(null);
      setOpen(true);
      url.searchParams.delete("new");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
    }
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pos.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      const v = p.vendor_id ? vendorMap.get(p.vendor_id)?.name ?? "" : "";
      return p.po_number.toLowerCase().includes(q) || v.toLowerCase().includes(q);
    });
  }, [pos, query, statusFilter, vendorMap]);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inv", "pos"] });
    qc.invalidateQueries({ queryKey: ["inv", "po-line-agg"] });
  };



  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inv_purchase_orders" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: ENTITY, entityId: id });
    },
    onSuccess: invalidate,
  });

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const handleDownloadPO = async (p: PO) => {
    const [vendorRes, linesRes] = await Promise.all([
      p.vendor_id
        ? supabase.from("inv_vendors" as never).select("vendor_code,name,phone,email,gstin,address1,address2,city,state,pincode,country").eq("id", p.vendor_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from("inv_po_lines" as never).select("item_id,size_value,ordered_qty,unit_price,tax_percent").eq("po_id", p.id).order("sort_order"),
    ]);
    if (vendorRes.error) throw vendorRes.error;
    if (linesRes.error) throw linesRes.error;
    const lineRows = ((linesRes.data ?? []) as unknown as Array<{ item_id: string; size_value: string; ordered_qty: number; unit_price: number; tax_percent: number }>);
    const pdfLines: POPdfLine[] = lineRows.map((l) => {
      const it = itemMap.get(l.item_id);
      return {
        item_code: it?.item_code ?? "",
        item_name: it?.name ?? "",
        unit: it?.unit ?? "",
        size_value: l.size_value || undefined,
        qty: Number(l.ordered_qty) || 0,
        unit_price: Number(l.unit_price) || 0,
        tax_percent: Number(l.tax_percent) || 0,
      };
    });
    await downloadPOPdf({
      po_number: p.po_number,
      po_date: p.po_date,
      remarks: p.notes,
      vendor: vendorRes.data as never,
      ordering_from: locationLabel(p.source_warehouse_id, p.requesting_branch_id),
      deliver_to: locationLabel(p.destination_warehouse_id, p.destination_branch_id),
      lines: pdfLines,
    });
    toast.success("PDF downloaded");
  };

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        description="Warehouse needs stock? Create a PO: pick the vendor, add items + qty + price, issue it. When goods arrive, receive against the PO in Goods Receipts to add stock into the warehouse."
        crumbs={[{ label: "Uniform Manager", to: "/admin/inventory" }, { label: "Purchase Orders" }]}
      />


      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search PO #, vendor…" className="h-10 rounded-lg pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-full rounded-lg sm:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Delivery Open</SelectItem>
              <SelectItem value="partially_received">Delivery Ongoing</SelectItem>
              <SelectItem value="received">Delivery Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>

          </Select>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1.5 h-4 w-4" />Order from Vendor
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-accent/10 px-5 py-2.5 text-xs font-medium">
          <span className="inline-flex items-center gap-2">
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{filtered.length}</span>
            <span className="uppercase tracking-[0.14em] text-muted-foreground">Total rows</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">PO #</th>
                <th className="px-5 py-3">Vendor</th>
                <th className="px-5 py-3">Deliver To</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Products</th>
                <th className="px-5 py-3 text-right">Qty</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => {
                const agg = lineAgg.get(p.id) ?? { products: 0, qty: 0 };
                const canEdit = p.status !== "cancelled";
                const canDownload = p.status !== "draft" && p.status !== "cancelled";
                return (
                  <tr key={p.id} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{p.po_number}</td>
                    <td className="px-5 py-3 font-medium">{p.vendor_id ? vendorMap.get(p.vendor_id)?.name ?? "—" : "—"}</td>
                    <td className="px-5 py-3">{locationLabel(p.destination_warehouse_id, p.destination_branch_id)}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground tabular-nums">{p.po_date}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${statusBadgeClass(p.status)}`}>{poStatusLabel(p.status)}</span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{agg.products}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{agg.qty}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold">₹{Number(p.grand_total ?? 0).toFixed(2)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="View" onClick={() => { setEditing(p); setOpen(true); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Edit" onClick={() => { setEditing(p); setOpen(true); }}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" title="Delete" onClick={async () => {
                          const isRaised = p.status !== "draft";
                          const desc = isRaised
                            ? `Are you sure? A purchase order has been raised (${p.po_number}). Do you really want to delete?`
                            : `Delete ${p.po_number}?`;
                          if (!(await confirmAction({ title: "Delete PO?", description: desc, confirmText: "Delete" }))) return;
                          try { await deleteMut.mutateAsync(p.id); toast.success("Deleted"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                        }}><Trash2 className="h-4 w-4" /></Button>
                        {canDownload && (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Download PO PDF" onClick={async () => {
                            try { await handleDownloadPO(p); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to generate PDF"); }
                          }}><Download className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && <tr><td colSpan={9} className="px-5 py-12 text-center text-sm text-muted-foreground"><FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />No purchase orders yet. Click <span className="font-semibold text-foreground">Order from Vendor</span> to create your first PO.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <POFormDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}
        initial={editing}
        vendors={vendors}
        warehouses={warehouses}
        branches={branches}
        items={items}
        itemSizes={itemSizes}
        rateCards={rateCards}
        onSaved={invalidate}
      />
    </div>
  );
}

function POFormDialog({
  open, onOpenChange, initial, vendors, warehouses, branches, items, itemSizes, rateCards, onSaved,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  initial: PO | null; vendors: Vendor[]; warehouses: Warehouse[]; branches: Branch[]; items: Item[];
  itemSizes: ItemSize[];
  rateCards: RateCard[];
  onSaved: () => void;
}) {
  const [vendorId, setVendorId] = useState<string>("");
  const [orderingFrom, setOrderingFrom] = useState<string>(""); // "wh:<id>" or "br:<id>"
  const [deliverTo, setDeliverTo] = useState<string>("");
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<POLine[]>([]);
  const [status, setStatus] = useState<string>("open");
  const [saving, setSaving] = useState(false);


  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const sizesByItem = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of itemSizes) {
      const arr = m.get(s.item_id) ?? [];
      arr.push(s.size_value);
      m.set(s.item_id, arr);
    }
    return m;
  }, [itemSizes]);
  // Items quoted by the selected vendor (via rate cards). Empty vendor => no items.
  const vendorItems = useMemo(() => {
    if (!vendorId) return [] as Item[];
    const ids = new Set(rateCards.filter((rc) => rc.vendor_id === vendorId).map((rc) => rc.item_id));
    return items.filter((i) => ids.has(i.id));
  }, [vendorId, rateCards, items]);
  // Line/header field edits lock once goods start arriving. Status toggle stays available unless cancelled.
  const readOnly = !!initial && !(initial.status === "draft" || initial.status === "open" || initial.status === "approved");



  // Pick best matching rate card: prefer exact size match, then blank-size fallback.
  const findRate = (vId: string, itemId: string, sizeValue: string): RateCard | undefined => {
    if (!vId || !itemId) return undefined;
    const matches = rateCards.filter((rc) => rc.vendor_id === vId && rc.item_id === itemId);
    if (!matches.length) return undefined;
    return matches.find((rc) => rc.size_value === sizeValue) ?? matches.find((rc) => !rc.size_value) ?? matches[0];
  };
  const cheapestRate = (itemId: string, sizeValue: string): RateCard | undefined => {
    const matches = rateCards
      .filter((rc) => rc.item_id === itemId)
      .filter((rc) => rc.size_value === sizeValue || !rc.size_value);
    if (!matches.length) return undefined;
    return matches.reduce((min, rc) => (rc.unit_price < min.unit_price ? rc : min));
  };
  const vendorNameById = (id: string) => vendors.find((v) => v.id === id)?.name ?? "";

  function applyVendorPriceToLines(newVendorId: string) {
    setLines((ls) => ls.map((l) => {
      if (!l.item_id) return l;
      const rc = findRate(newVendorId, l.item_id, l.size_value);
      if (!rc) return l;
      // Only overwrite if line price is zero (user hasn't customized)
      if (l.unit_price === 0) return { ...l, unit_price: rc.unit_price, tax_percent: rc.tax_percent };
      return l;
    }));
  }

  function applyRateToLine(idx: number, itemId: string, sizeValue: string) {
    const rc = findRate(vendorId, itemId, sizeValue);
    setLines((ls) => ls.map((x, i) => {
      if (i !== idx) return x;
      const next = { ...x, item_id: itemId, size_value: sizeValue };
      if (rc) {
        next.unit_price = rc.unit_price;
        next.tax_percent = rc.tax_percent;
      }
      return next;
    }));
  }


  useResetOnOpen(open, async () => {
    if (initial) {
      setVendorId(initial.vendor_id ?? "");
      setOrderingFrom(
        initial.source_warehouse_id ? encLoc("wh", initial.source_warehouse_id)
        : initial.requesting_branch_id ? encLoc("br", initial.requesting_branch_id)
        : ""
      );
      setDeliverTo(
        initial.destination_warehouse_id ? encLoc("wh", initial.destination_warehouse_id)
        : initial.destination_branch_id ? encLoc("br", initial.destination_branch_id)
        : ""
      );
      setPoDate(initial.po_date);
      setExpectedDate(initial.expected_date ?? "");
      setNotes(initial.notes);
      // Legacy "approved" maps to "open" in the toggle.
      setStatus(initial.status === "approved" ? "open" : initial.status);
      const { data } = await supabase.from("inv_po_lines" as never).select("*").eq("po_id", initial.id).order("sort_order");
      setLines(((data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
        id: String(r.id),
        item_id: String(r.item_id),
        size_value: String(r.size_value ?? ""),
        ordered_qty: Number(r.ordered_qty ?? 0),
        unit_price: Number(r.unit_price ?? 0),
        tax_percent: Number(r.tax_percent ?? 0),
        notes: String(r.notes ?? ""),
      })));
    } else {
      setVendorId(""); setOrderingFrom(""); setDeliverTo("");
      setPoDate(new Date().toISOString().slice(0, 10));
      setExpectedDate(""); setNotes(""); setLines([]); setStatus("open");
    }
  });

  const totals = useMemo(() => {
    let sub = 0, tax = 0;
    for (const l of lines) {
      const lt = l.ordered_qty * l.unit_price;
      sub += lt;
      tax += lt * (l.tax_percent / 100);
    }
    return { sub, tax, grand: sub + tax };
  }, [lines]);

  async function save(targetStatus: string) {

    if (!vendorId) { toast.error("Vendor required"); return; }
    const dFrom = decLoc(orderingFrom);
    const dTo = decLoc(deliverTo);
    if (!dFrom) { toast.error("Ordering From is required"); return; }
    if (!dTo) { toast.error("Deliver To is required"); return; }
    if (!lines.length) { toast.error("Add at least one line"); return; }
    for (const l of lines) {
      if (!l.item_id) { toast.error("Pick an item on every line"); return; }
      if (!Number.isInteger(l.ordered_qty) || l.ordered_qty < 1) { toast.error("Quantity must be a whole number ≥ 1"); return; }
      const item = itemMap.get(l.item_id);
      if (item?.is_sized && !l.size_value) { toast.error(`Pick a size for ${item.name}`); return; }
    }
    const locationFields = {
      source_warehouse_id: dFrom.kind === "wh" ? dFrom.id : null,
      requesting_branch_id: dFrom.kind === "br" ? dFrom.id : null,
      destination_warehouse_id: dTo.kind === "wh" ? dTo.id : null,
      destination_branch_id: dTo.kind === "br" ? dTo.id : null,
    };
    setSaving(true);
    try {
      const linesPayload = lines.map((l, idx) => ({
        item_id: l.item_id,
        size_value: l.size_value,
        ordered_qty: l.ordered_qty,
        unit_price: l.unit_price,
        tax_percent: l.tax_percent,
        line_total: l.ordered_qty * l.unit_price * (1 + l.tax_percent / 100),
        notes: l.notes,
        sort_order: idx,
      }));
      let poId = initial?.id;
      if (initial) {
        const { error } = await supabase.from("inv_purchase_orders" as never).update({
          vendor_id: vendorId,
          ...locationFields,
          po_date: poDate,
          expected_date: expectedDate || null,
          notes,
          subtotal: totals.sub,
          tax_total: totals.tax,
          grand_total: totals.grand,
          status: targetStatus,
        } as never).eq("id", initial.id);

        if (error) throw error;
        const { error: delErr } = await supabase.from("inv_po_lines" as never).delete().eq("po_id", initial.id);
        if (delErr) throw delErr;
        const { error: insErr } = await supabase.from("inv_po_lines" as never).insert(linesPayload.map((l) => ({ ...l, po_id: initial.id })) as never);
        if (insErr) throw insErr;
      } else {
        const n = await nextSeq("inv_po_number_seq");
        const po_number = fmtNumber("PO", n);
        const { data: { user } } = await supabase.auth.getUser();
        const { data: ins, error } = await supabase.from("inv_purchase_orders" as never).insert({
          po_number, po_type: "vendor",
          vendor_id: vendorId,
          ...locationFields,
          po_date: poDate,
          expected_date: expectedDate || null,
          notes,
          subtotal: totals.sub,
          tax_total: totals.tax,
          grand_total: totals.grand,
          status: targetStatus,

          created_by: user?.id ?? null,
        } as never).select("id").single();
        if (error) throw error;
        poId = (ins as unknown as { id: string }).id;
        const { error: insErr } = await supabase.from("inv_po_lines" as never).insert(linesPayload.map((l) => ({ ...l, po_id: poId })) as never);
        if (insErr) throw insErr;
      }
      void logActivity({
        module: MODULE,
        action: initial ? "update" : "create",
        entityType: ENTITY,
        entityId: poId,
        entityLabel: initial?.po_number ?? "PO",
      });
      toast.success(targetStatus === "draft" ? "Draft saved" : initial ? "Changes saved" : "PO issued");

      onSaved();
      onOpenChange(false);
    } catch (e) {
      const msg = (e as { message?: string; details?: string; hint?: string } | null)?.message
        || (e as { details?: string } | null)?.details
        || (typeof e === "string" ? e : JSON.stringify(e));
      // eslint-disable-next-line no-console
      console.error("PO save failed", e);
      toast.error(msg || "Failed to save PO");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{initial ? `Purchase Order ${initial.po_number}` : "New Purchase Order"}</DialogTitle>
          <DialogDescription>{readOnly ? "Read-only — goods have started arriving, edits are locked." : initial ? "Edit the PO. Available until the first Goods Receipt is posted." : "Order items from a vendor."}</DialogDescription>

        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Vendor</Label>
              <Select value={vendorId} onValueChange={(v) => { setVendorId(v); applyVendorPriceToLines(v); }} disabled={readOnly}>
                <SelectTrigger><SelectValue placeholder="Pick vendor" /></SelectTrigger>
                <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Ordering From</Label>
              <Select value={orderingFrom} onValueChange={setOrderingFrom} disabled={readOnly}>
                <SelectTrigger><SelectValue placeholder="Pick warehouse or branch" /></SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  {warehouses.length > 0 && <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Warehouses</div>}
                  {warehouses.map((w) => <SelectItem key={`fw-${w.id}`} value={encLoc("wh", w.id)}>{w.name}</SelectItem>)}
                  {branches.length > 0 && <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Branches</div>}
                  {branches.map((b) => <SelectItem key={`fb-${b.id}`} value={encLoc("br", b.id)}>{b.name}{b.code ? ` (${b.code})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Deliver To</Label>
              <Select value={deliverTo} onValueChange={setDeliverTo} disabled={readOnly}>
                <SelectTrigger><SelectValue placeholder="Pick warehouse or branch" /></SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  {warehouses.length > 0 && <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Warehouses</div>}
                  {warehouses.map((w) => <SelectItem key={`tw-${w.id}`} value={encLoc("wh", w.id)}>{w.name}</SelectItem>)}
                  {branches.length > 0 && <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Branches</div>}
                  {branches.map((b) => <SelectItem key={`tb-${b.id}`} value={encLoc("br", b.id)}>{b.name}{b.code ? ` (${b.code})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>PO Date</Label><Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} disabled={readOnly} /></div>
            <div className="grid gap-2"><Label>Expected Delivery</Label><Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} disabled={readOnly} /></div>
            {initial && (
              <div className="grid gap-2 sm:col-span-2"><Label>Delivery Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EDITABLE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Auto-updates as Goods Receipts are posted; override here only when needed.</p>
              </div>
            )}
          </div>


          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <Label className="text-sm font-semibold">Line Items</Label>
                {vendorId && <span className="ml-2 text-[11px] text-muted-foreground">Showing {vendorItems.length} item{vendorItems.length === 1 ? "" : "s"} this vendor quotes</span>}
                {!vendorId && <span className="ml-2 text-[11px] text-muted-foreground">Pick a vendor to see their items</span>}
              </div>
              {!readOnly && (
                <div className="flex gap-2">
                  <Button size="sm" type="button" variant="outline" disabled={!vendorId || !vendorItems.length} onClick={() => {
                    // Add every vendor item that isn't already on the PO. User can trim and set qty.
                    const existing = new Set(lines.map((l) => l.item_id).filter(Boolean));
                    const toAdd: POLine[] = [];
                    for (const it of vendorItems) {
                      if (existing.has(it.id)) continue;
                      const rc = findRate(vendorId, it.id, "");
                      toAdd.push({ item_id: it.id, size_value: "", ordered_qty: 1, unit_price: rc?.unit_price ?? 0, tax_percent: rc?.tax_percent ?? 0, notes: "" });
                    }
                    if (!toAdd.length) { toast.info("All vendor items already added"); return; }
                    setLines((ls) => [...ls, ...toAdd]);
                  }}>
                    <Plus className="mr-1 h-3.5 w-3.5" />Add all vendor items
                  </Button>
                  <Button size="sm" type="button" disabled={!vendorId} onClick={() => setLines((ls) => [...ls, { item_id: "", size_value: "", ordered_qty: 1, unit_price: 0, tax_percent: 0, notes: "" }])}>
                    <Plus className="mr-1 h-3.5 w-3.5" />Add line
                  </Button>
                </div>
              )}
            </div>
            <div className="overflow-x-clip rounded-xl border border-border">
              <table className="ios-table w-full text-sm">
                <thead className="bg-secondary/60 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 w-20">Size</th>
                    <th className="px-3 py-2 w-20 text-right">Qty</th>
                    <th className="px-3 py-2 w-24 text-right">Unit ₹</th>
                    <th className="px-3 py-2 w-20 text-right">Tax %</th>
                    <th className="px-3 py-2 w-28 text-right">Total</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((l, idx) => {
                    const item = itemMap.get(l.item_id);
                    const lt = l.ordered_qty * l.unit_price * (1 + l.tax_percent / 100);
                    const cheap = l.item_id ? cheapestRate(l.item_id, l.size_value) : undefined;
                    const overpay = cheap && l.unit_price > 0 && l.unit_price > cheap.unit_price * 1.1;
                    const overpayPct = cheap && cheap.unit_price > 0 ? ((l.unit_price - cheap.unit_price) / cheap.unit_price) * 100 : 0;
                    return (
                      <tr key={idx}>
                        <td className="px-2 py-1.5">
                          <Select value={l.item_id} onValueChange={(v) => applyRateToLine(idx, v, l.size_value)} disabled={readOnly}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="Pick item" /></SelectTrigger>
                            <SelectContent>{vendorItems.map((it) => <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>)}{!vendorItems.length && <div className="px-3 py-2 text-xs text-muted-foreground">No items quoted by this vendor</div>}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          {item?.is_sized ? (
                            (sizesByItem.get(l.item_id)?.length ?? 0) > 0 ? (
                              <Select value={l.size_value || undefined} onValueChange={(v) => applyRateToLine(idx, l.item_id, v)} disabled={readOnly}>
                                <SelectTrigger className="h-9"><SelectValue placeholder="Size" /></SelectTrigger>
                                <SelectContent>
                                  {sizesByItem.get(l.item_id)!.map((sv) => <SelectItem key={sv} value={sv}>{sv}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input className="h-9" value={l.size_value} onChange={(e) => applyRateToLine(idx, l.item_id, e.target.value)} placeholder="M/L/40" disabled={readOnly} />
                            )
                          ) : (
                            <Input className="h-9" disabled value="" placeholder="—" />
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top"><Input type="number" min={1} step={1} className="h-9 text-right" value={l.ordered_qty === 0 ? "" : l.ordered_qty} onChange={(e) => { const v = e.target.value === "" ? 0 : Math.max(0, Math.floor(Number(e.target.value) || 0)); setLines((ls) => ls.map((x, i) => i === idx ? { ...x, ordered_qty: v } : x)); }} disabled={readOnly} /></td>
                        <td className="px-2 py-1.5 align-top">
                          <Input type="number" min={0} step="0.01" className={`h-9 text-right ${overpay ? "border-amber-500 text-amber-700" : ""}`} value={l.unit_price === 0 ? "" : l.unit_price} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, unit_price: e.target.value === "" ? 0 : Number(e.target.value) || 0 } : x))} disabled={readOnly} />
                          {cheap && (
                            <div className={`mt-1 truncate text-[10px] leading-tight ${overpay ? "text-amber-600" : "text-muted-foreground"}`} title={`Cheapest: ₹${cheap.unit_price.toFixed(2)} (${vendorNameById(cheap.vendor_id)})${overpay ? ` · +${overpayPct.toFixed(0)}%` : ""}`}>
                              {overpay && <AlertTriangle className="mr-0.5 inline h-3 w-3" />}
                              ₹{cheap.unit_price.toFixed(2)}
                              {overpay && <> · +{overpayPct.toFixed(0)}%</>}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top"><Input type="number" min={0} step="0.01" className="h-9 text-right" value={l.tax_percent === 0 ? "" : l.tax_percent} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, tax_percent: e.target.value === "" ? 0 : Number(e.target.value) || 0 } : x))} disabled={readOnly} /></td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums align-top">₹{lt.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>

                        <td className="px-2 py-1.5">
                          {!readOnly && (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}><Trash2 className="h-3.5 w-3.5" /></Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!lines.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">No lines yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end gap-6 text-sm">
              <div className="text-muted-foreground">Subtotal: <span className="font-medium tabular-nums text-foreground">₹{totals.sub.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></div>
              <div className="text-muted-foreground">Tax: <span className="font-medium tabular-nums text-foreground">₹{totals.tax.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></div>
              <div className="font-display text-base font-bold tabular-nums">Total ₹{totals.grand.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
            </div>
          </div>

          <div className="grid gap-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} rows={2} /></div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Close</Button>
          {initial ? (
            <Button onClick={() => save(status)} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => save("draft")} disabled={saving}>Save Draft</Button>
              <Button onClick={() => save("open")} disabled={saving}>{saving ? "Saving…" : "Issue PO"}</Button>
            </>
          )}
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}

function useResetOnOpen(open: boolean, reset: () => void) {
  const [last, setLast] = useState(false);
  if (open !== last) { setLast(open); if (open) reset(); }
}
