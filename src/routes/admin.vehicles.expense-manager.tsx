import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Fuel,
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Upload,
  Image as ImageIcon,
  X,
  Check,
  ChevronsUpDown,
  Wrench,
  Droplets,
  Receipt,
  ParkingCircle,
  Tag,
  FileText,

} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { downloadCsv } from "@/lib/csv-export";
import { confirmAction } from "@/components/ConfirmProvider";
import { PageHeader } from "@/components/PageHeader";
import { SortHeader, sortRows, useSort } from "@/components/SortableHeader";



import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { useVehicleOptions, fmtDate } from "@/lib/vehicle-helpers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/vehicles/expense-manager")({
  component: ExpenseManagerPage,
});

const MODULE = "Expense Manager";
const ENTITY = "vehicle_fuel_entries";
const QK = ["admin", "vehicle-expense-entries"] as const;
const BUCKET = "vehicle-fuel-proofs";


const EXPENSE_TYPES = [
  { value: "fuel", label: "Fuel", icon: Fuel },
  { value: "maintenance", label: "Maintenance", icon: Wrench },
  { value: "washing", label: "Washing", icon: Droplets },
  { value: "repair", label: "Repair", icon: Wrench },
  { value: "parking", label: "Parking", icon: ParkingCircle },
  { value: "toll", label: "Toll", icon: Receipt },
  { value: "challan", label: "Challan", icon: FileText },
  { value: "other", label: "Other", icon: Tag },
] as const;
const FUEL_TYPES = ["Petrol", "Diesel", "CNG", "Electric"] as const;
const PAYMENT_MODES = ["PetroCard", "Cash", "UPI", "Other"] as const;

type ExpenseEntry = {
  id: string;
  vehicle_id: string;
  expense_type: string;
  entry_date: string;
  entry_time: string | null;
  fuel_type: string;
  odometer_km: number;
  quantity: number;
  rate: number;
  amount: number;
  payment_mode: string;
  location_text: string;
  geo_lat: number | null;
  geo_lng: number | null;
  odometer_photo_url: string;
  pump_photo_url: string;
  receipt_photo_url: string;
  filling_photo_url: string;
  description: string;
  tags: string[];
  notes: string;
  created_at: string;
};


function rowToEntry(r: Record<string, unknown>): ExpenseEntry {
  return {
    id: String(r.id),
    vehicle_id: String(r.vehicle_id ?? ""),
    expense_type: String(r.expense_type ?? "fuel"),
    entry_date: String(r.entry_date ?? ""),
    entry_time: (r.entry_time as string | null) ?? null,
    fuel_type: String(r.fuel_type ?? ""),
    odometer_km: Number(r.odometer_km ?? 0),
    quantity: Number(r.quantity ?? 0),
    rate: Number(r.rate ?? 0),
    amount: Number(r.amount ?? 0),
    payment_mode: String(r.payment_mode ?? ""),
    location_text: String(r.location_text ?? ""),
    geo_lat: r.geo_lat == null ? null : Number(r.geo_lat),
    geo_lng: r.geo_lng == null ? null : Number(r.geo_lng),
    odometer_photo_url: String(r.odometer_photo_url ?? ""),
    pump_photo_url: String(r.pump_photo_url ?? ""),
    receipt_photo_url: String(r.receipt_photo_url ?? ""),
    filling_photo_url: String(r.filling_photo_url ?? ""),
    description: String(r.description ?? ""),
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    notes: String(r.notes ?? ""),
    created_at: String(r.created_at ?? ""),
  };
}

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function expenseLabel(value: string) {
  return EXPENSE_TYPES.find((e) => e.value === value)?.label ?? value;
}

function ExpenseManagerPage() {
  const qc = useQueryClient();
  const vehOptsQ = useVehicleOptions();
  const vehicles = useMemo(() => vehOptsQ.data ?? [], [vehOptsQ.data]);
  const vehMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vehicles) m.set(v.id, v.vehicle_number);
    return m;
  }, [vehicles]);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<ExpenseEntry[]> => {
      const { data, error } = await supabase
        .from(ENTITY as never)
        .select("*")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[]).map(rowToEntry);
    },
  });

  const [vehicleFilter, setVehicleFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (vehicleFilter !== "all" && e.vehicle_id !== vehicleFilter) return false;
      if (typeFilter !== "all" && e.expense_type !== typeFilter) return false;
      if (from && e.entry_date < from) return false;
      if (to && e.entry_date > to) return false;
      return true;
    });
  }, [entries, vehicleFilter, typeFilter, from, to]);

  const sort = useSort<"date" | "vehicle" | "type" | "description" | "odometer" | "qty" | "amount" | "payment" | "location">({ key: "date", dir: "desc" });
  const sortedFiltered = useMemo(() => sortRows(filtered, sort.sort, (e, k) => {
    switch (k) {
      case "date": return `${e.entry_date} ${e.entry_time ?? ""}`;
      case "vehicle": return vehMap.get(e.vehicle_id) ?? "";
      case "type": return `${expenseLabel(e.expense_type)} ${e.fuel_type ?? ""}`;
      case "description": return e.description ?? "";
      case "odometer": return Number(e.odometer_km) || 0;
      case "qty": return Number(e.quantity) || 0;
      case "amount": return Number(e.amount) || 0;
      case "payment": return e.payment_mode ?? "";
      case "location": return e.location_text ?? "";
    }
  }), [filtered, sort.sort, vehMap]);


  const stats = useMemo(() => {
    const totalSpend = filtered.reduce((s, e) => s + (e.amount || 0), 0);
    const byType: Record<string, number> = {};
    const byPayment: Record<string, number> = {};
    for (const e of filtered) {
      byType[e.expense_type] = (byType[e.expense_type] ?? 0) + (e.amount || 0);
      byPayment[e.payment_mode] = (byPayment[e.payment_mode] ?? 0) + (e.amount || 0);
    }
    return { totalSpend, entries: filtered.length, byType, byPayment };
  }, [filtered]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseEntry | null>(null);

  const delMut = useMutation({
    mutationFn: async (e: ExpenseEntry) => {
      const { error } = await supabase
        .from(ENTITY as never)
        .delete()
        .eq("id", e.id);
      if (error) throw error;
      await logActivity({
        module: MODULE,
        action: "delete",
        entityType: ENTITY,
        entityId: e.id,
        entityLabel: `${vehMap.get(e.vehicle_id) ?? "Vehicle"} • ${expenseLabel(e.expense_type)} • ${fmtDate(e.entry_date)} • ${inr(e.amount)}`,
        before: e as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      toast.success("Expense entry deleted");
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  async function handleDelete(e: ExpenseEntry) {
    const ok = await confirmAction({
      title: "Delete expense entry?",
      description: `${vehMap.get(e.vehicle_id) ?? "Vehicle"} • ${expenseLabel(e.expense_type)} • ${fmtDate(e.entry_date)} • ${inr(e.amount)}`,
      confirmText: "Delete",
      destructive: true,
    });
    if (ok) delMut.mutate(e);
  }

  const typeSegments = EXPENSE_TYPES.map((t, i) => ({
    label: t.label,
    value: stats.byType[t.value] ?? 0,
    color: `hsl(${(i * 47) % 360} 70% 55%)`,
  }));

  return (
    <div>
      <PageHeader
        title="Expense Manager"
        description="Log vehicle expenses — fuel, maintenance, washing, repairs, parking, tolls. Upload proof photos with each entry."
        crumbs={[{ label: "Vehicles", to: "/admin/vehicles" }, { label: "Expense Manager" }]}
      />

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs text-muted-foreground">Vehicle</Label>
          <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vehicles</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.vehicle_number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Type</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {EXPENSE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                "vehicle-expenses.csv",
                filtered.map((e) => ({
                  date: fmtDate(e.entry_date),
                  time: e.entry_time ?? "",
                  vehicle: vehMap.get(e.vehicle_id) ?? "",
                  expense_type: expenseLabel(e.expense_type),
                  fuel_type: e.fuel_type,
                  description: e.description,
                  odometer_km: e.odometer_km,
                  quantity: e.quantity,
                  rate: e.rate,
                  amount: e.amount,
                  payment_mode: e.payment_mode,
                  location: e.location_text,
                  geo: e.geo_lat && e.geo_lng ? `${e.geo_lat},${e.geo_lng}` : "",
                  tags: e.tags.join("|"),
                  odometer_photo: e.odometer_photo_url,
                  pump_photo: e.pump_photo_url,
                  receipt_photo: e.receipt_photo_url,
                  filling_photo: e.filling_photo_url,
                  notes: e.notes,
                })),
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Entry
          </Button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <DonutBreakdown
          title="Spend by Expense Type"
          total={stats.totalSpend}
          entries={stats.entries}
          segments={typeSegments}
        />
        <DonutBreakdown
          title="Spend by Payment"
          total={stats.totalSpend}
          entries={stats.entries}
          segments={[
            {
              label: "PetroCard",
              value: stats.byPayment["PetroCard"] ?? 0,
              color: "hsl(265 70% 60%)",
            },
            { label: "Cash", value: stats.byPayment["Cash"] ?? 0, color: "hsl(150 65% 45%)" },
            { label: "UPI", value: stats.byPayment["UPI"] ?? 0, color: "hsl(200 80% 55%)" },
            { label: "Other", value: stats.byPayment["Other"] ?? 0, color: "hsl(0 0% 60%)" },
          ]}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-clip">
          <table className="ios-table w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <SortHeader label="Date" sortKey="date" sort={sort.sort} onToggle={sort.toggle} className="px-3" />
                <SortHeader label="Vehicle" sortKey="vehicle" sort={sort.sort} onToggle={sort.toggle} className="px-3" />
                <SortHeader label="Type" sortKey="type" sort={sort.sort} onToggle={sort.toggle} className="px-3" />
                <SortHeader label="Description" sortKey="description" sort={sort.sort} onToggle={sort.toggle} className="px-3" />
                <SortHeader label="Odometer" sortKey="odometer" sort={sort.sort} onToggle={sort.toggle} align="right" className="px-3" />
                <SortHeader label="Qty" sortKey="qty" sort={sort.sort} onToggle={sort.toggle} align="right" className="px-3" />
                <SortHeader label="Amount" sortKey="amount" sort={sort.sort} onToggle={sort.toggle} align="right" className="px-3" />
                <SortHeader label="Payment" sortKey="payment" sort={sort.sort} onToggle={sort.toggle} className="px-3" />
                <SortHeader label="Location" sortKey="location" sort={sort.sort} onToggle={sort.toggle} className="px-3" />
                <th className="px-3 py-3 text-center">Proofs</th>
                <th className="px-3 py-3" />

              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">
                    <Fuel className="mx-auto mb-2 h-6 w-6 opacity-50" />
                    No expense entries in this range. Click <strong>Add Entry</strong> to log one.
                  </td>
                </tr>
              )}
              {sortedFiltered.map((e) => (
                <tr key={e.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="font-medium">{fmtDate(e.entry_date)}</div>
                    {e.entry_time && (
                      <div className="text-xs text-muted-foreground">
                        {e.entry_time.slice(0, 5)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-medium">{vehMap.get(e.vehicle_id) ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="secondary" className="font-normal">
                      {expenseLabel(e.expense_type)}
                      {e.expense_type === "fuel" && e.fuel_type ? ` · ${e.fuel_type}` : ""}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 max-w-[200px]">
                    <div className="truncate text-xs">{e.description || "—"}</div>
                    {e.tags.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {e.tags.slice(0, 3).map((t) => (
                          <span key={t} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {e.odometer_km > 0 ? e.odometer_km.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {e.quantity > 0 ? e.quantity : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    {inr(e.amount)}
                  </td>
                  <td className="px-3 py-2.5 text-xs">{e.payment_mode || "—"}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {e.geo_lat && e.geo_lng ? (
                      <a
                        className="inline-flex items-center gap-1 text-accent hover:underline"
                        href={`https://www.google.com/maps?q=${e.geo_lat},${e.geo_lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MapPin className="h-3 w-3" />
                        {e.location_text || "View map"}
                      </a>
                    ) : (
                      e.location_text || "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <ProofThumb url={e.odometer_photo_url} label="Odometer" />
                      <ProofThumb url={e.pump_photo_url} label="Pump" />
                      <ProofThumb url={e.receipt_photo_url} label="Receipt" />
                      <ProofThumb url={e.filling_photo_url} label="Filling" />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit"
                        onClick={() => {
                          setEditing(e);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(e)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddEntryDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
        vehicles={vehicles}
        editing={editing}
        lastOdoByVehicle={useMemo(() => {
          const m = new Map<string, number>();
          for (const e of entries) {
            const prev = m.get(e.vehicle_id);
            if (prev == null || (e.odometer_km ?? 0) > prev)
              m.set(e.vehicle_id, e.odometer_km ?? 0);
          }
          return m;
        }, [entries])}
        onSaved={() => qc.invalidateQueries({ queryKey: QK })}
      />
    </div>
  );
}

function ProofThumb({ url, label }: { url: string; label: string }) {
  if (!url) {
    return (
      <div
        className="flex h-9 w-9 items-center justify-center rounded border border-dashed border-border text-muted-foreground"
        title={`No ${label}`}
      >
        <ImageIcon className="h-3.5 w-3.5 opacity-40" />
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" title={label}>
      <img src={url} alt={label} className="h-9 w-9 rounded border border-border object-cover" />
    </a>
  );
}

/* ------------------------- Add Entry Dialog ------------------------- */

type Vehicle = { id: string; vehicle_number: string; name: string; fuel_type?: string };


function AddEntryDialog({
  open,
  onOpenChange,
  vehicles,
  lastOdoByVehicle,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vehicles: Vehicle[];
  lastOdoByVehicle: Map<string, number>;
  editing: ExpenseEntry | null;
  onSaved: () => void;
}) {
  const [expenseType, setExpenseType] = useState<string>("fuel");
  const [vehicleId, setVehicleId] = useState("");
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryTime, setEntryTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [fuelType, setFuelType] = useState<string>("Petrol");
  const [odometer, setOdometer] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<string>("PetroCard");
  const [locationText, setLocationText] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [notes, setNotes] = useState("");
  const [odoFile, setOdoFile] = useState<File | null>(null);
  const [pumpFile, setPumpFile] = useState<File | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [fillingFile, setFillingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  
  const [vehOpen, setVehOpen] = useState(false);

  useEffect(() => {
    if (open && editing) {
      setExpenseType(editing.expense_type || "fuel");
      setVehicleId(editing.vehicle_id);
      setEntryDate(editing.entry_date);
      setEntryTime(editing.entry_time ?? "");
      setFuelType(editing.fuel_type || "Petrol");
      setOdometer(editing.odometer_km ? String(editing.odometer_km) : "");
      setQuantity(editing.quantity ? String(editing.quantity) : "");
      setRate(editing.rate ? String(editing.rate) : "");
      setAmount(editing.amount ? String(editing.amount) : "");
      setPaymentMode(editing.payment_mode || "PetroCard");
      setLocationText(editing.location_text || "");
      setGeo(editing.geo_lat != null && editing.geo_lng != null ? { lat: editing.geo_lat, lng: editing.geo_lng } : null);
      setDescription(editing.description || "");
      setTagsInput((editing.tags || []).join(", "));
      setNotes(editing.notes || "");
      setOdoFile(null);
      setPumpFile(null);
      setReceiptFile(null);
      setFillingFile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const isFuel = expenseType === "fuel";
  const minOdo = vehicleId ? (lastOdoByVehicle.get(vehicleId) ?? 0) : 0;
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

  function pickVehicle(id: string) {
    setVehicleId(id);
    setVehOpen(false);
    const veh = vehicles.find((v) => v.id === id);
    const last = lastOdoByVehicle.get(id) ?? 0;
    if (last > 0) setOdometer(String(last));
    else setOdometer("");
    if (expenseType === "fuel" && veh?.fuel_type) {
      const matched = FUEL_TYPES.find((f) => f.toLowerCase() === veh.fuel_type!.trim().toLowerCase());
      setFuelType(matched ?? veh.fuel_type!);
    }
  }

  function recalcAmount(q: string, r: string) {
    const qn = Number(q);
    const rn = Number(r);
    if (!Number.isNaN(qn) && !Number.isNaN(rn) && qn > 0 && rn > 0) {
      setAmount((qn * rn).toFixed(2));
    }
  }

  function reset() {
    setExpenseType("fuel");
    setVehicleId("");
    setOdometer("");
    setQuantity("");
    setRate("");
    setAmount("");
    setLocationText("");
    setGeo(null);
    setNotes("");
    setDescription("");
    setTagsInput("");
    setOdoFile(null);
    setPumpFile(null);
    setReceiptFile(null);
    setFillingFile(null);
  }

  async function captureLocation() {
    try {
      const { readPosition } = await import("@/lib/geolocation");
      const pos = await readPosition();
      setGeo({ lat: +pos.lat.toFixed(6), lng: +pos.lng.toFixed(6) });
      toast.success("Location captured");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not get location — enter manually");
    }
  }




  async function uploadProof(file: File | null, label: string): Promise<string> {
    if (!file) return "";
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${vehicleId || "unknown"}/${entryDate}/${label}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    // Bucket is private — generate a long-lived signed URL (≈10 years)
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (signErr) throw signErr;
    return signed.signedUrl;
  }

  async function handleSave() {
    if (!vehicleId) {
      toast.error("Select a vehicle");
      return;
    }
    if (!amount) {
      toast.error("Enter amount");
      return;
    }
    if (isFuel) {
      if (!odometer) {
        toast.error("Enter odometer reading");
        return;
      }
      if (minOdo > 0 && Number(odometer) < minOdo) {
        toast.error(
          `Odometer must be at least ${minOdo.toLocaleString()} km (last recorded reading)`,
        );
        return;
      }
      if (!editing && (!odoFile || !pumpFile || !receiptFile)) {
        toast.error("Upload odometer, pump and receipt photos (filling photo optional)");
        return;
      }
    } else if (!description.trim()) {
      toast.error("Add a short description for this expense");
      return;
    }
    setBusy(true);
    try {
      const [odoUrl, pumpUrl, receiptUrl, fillingUrl] = await Promise.all([
        uploadProof(odoFile, "odometer"),
        uploadProof(pumpFile, "pump"),
        uploadProof(receiptFile, "receipt"),
        uploadProof(fillingFile, "filling"),
      ]);
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const payload = {
        vehicle_id: vehicleId,
        expense_type: expenseType,
        entry_date: entryDate,
        entry_time: entryTime || null,
        fuel_type: isFuel ? fuelType : "",
        odometer_km: Number(odometer) || 0,
        quantity: Number(quantity) || 0,
        rate: Number(rate) || 0,
        amount: Number(amount) || 0,
        payment_mode: paymentMode,
        location_text: locationText,
        geo_lat: geo?.lat ?? null,
        geo_lng: geo?.lng ?? null,
        odometer_photo_url: odoUrl || editing?.odometer_photo_url || "",
        pump_photo_url: pumpUrl || editing?.pump_photo_url || "",
        receipt_photo_url: receiptUrl || editing?.receipt_photo_url || "",
        filling_photo_url: fillingUrl || editing?.filling_photo_url || "",
        description,
        tags,
        notes,
      };
      let savedId: string;
      if (editing) {
        const { error } = await supabase
          .from(ENTITY as never)
          .update(payload as never)
          .eq("id", editing.id);
        if (error) throw error;
        savedId = editing.id;
      } else {
        const { data, error } = await supabase
          .from(ENTITY as never)
          .insert(payload as never)
          .select("id")
          .single();
        if (error) throw error;
        savedId = String((data as { id: string }).id);
      }
      const veh = vehicles.find((v) => v.id === vehicleId);
      await logActivity({
        module: MODULE,
        action: editing ? "update" : "create",
        entityType: ENTITY,
        entityId: savedId,
        entityLabel: `${veh?.vehicle_number ?? "Vehicle"} • ${expenseLabel(expenseType)} • ${fmtDate(entryDate)} • ${inr(Number(amount))}`,
        before: editing ? (editing as unknown as Record<string, unknown>) : undefined,
        after: payload as unknown as Record<string, unknown>,
      });
      toast.success(editing ? "Expense entry updated" : "Expense entry added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit" : "Add"} {isFuel ? "Fuel" : "Expense"} Entry
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Mode tabs: Fuel vs Other Expense */}
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1 w-full sm:w-auto">
            {([
              { value: "fuel", label: "Fuel" },
              { value: "other", label: "Other Expense" },
            ] as const).map((tab) => {
              const active = (tab.value === "fuel") === isFuel;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    if (tab.value === "fuel") setExpenseType("fuel");
                    else if (isFuel) setExpenseType("maintenance");
                  }}
                  className={cn(
                    "flex-1 sm:flex-none rounded-md px-4 py-1.5 text-sm font-medium transition",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Category select shown only for non-fuel expenses */}
          {!isFuel && (
            <div>
              <Label>Category *</Label>
              <Select value={expenseType} onValueChange={setExpenseType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_TYPES.filter((t) => t.value !== "fuel").map((t) => {
                    const Icon = t.icon;
                    return (
                      <SelectItem key={t.value} value={t.value}>
                        <span className="inline-flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" />
                          {t.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}


          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Vehicle *</Label>
              <Popover open={vehOpen} onOpenChange={setVehOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {selectedVehicle ? (
                      selectedVehicle.vehicle_number
                    ) : (
                      <span className="text-muted-foreground">Select vehicle</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search vehicle number…" />
                    <CommandList>
                      <CommandEmpty>No vehicle found.</CommandEmpty>
                      <CommandGroup>
                        {vehicles.map((v) => (
                          <CommandItem
                            key={v.id}
                            value={v.vehicle_number}
                            onSelect={() => pickVehicle(v.id)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                vehicleId === v.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            {v.vehicle_number}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {isFuel && (
              <div>
                <Label>Fuel Type</Label>
                <Select value={fuelType} onValueChange={setFuelType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FUEL_TYPES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Date</Label>
              <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" value={entryTime} onChange={(e) => setEntryTime(e.target.value)} />
            </div>
            <div>
              <Label>Odometer (km){isFuel ? " *" : ""}</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={minOdo || undefined}
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                placeholder={minOdo > 0 ? `≥ ${minOdo.toLocaleString()}` : "e.g. 43250"}
              />
              {minOdo > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Last recorded: {minOdo.toLocaleString()} km
                </p>
              )}
            </div>
            <div>
              <Label>Payment Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isFuel && (
              <>
                <div>
                  <Label>Quantity ({fuelType === "CNG" ? "kg" : "L"})</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => {
                      setQuantity(e.target.value);
                      recalcAmount(e.target.value, rate);
                    }}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label>Rate (₹ per unit)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={rate}
                    onChange={(e) => {
                      setRate(e.target.value);
                      recalcAmount(quantity, e.target.value);
                    }}
                    placeholder="0.00"
                  />
                </div>
              </>
            )}
            <div className={isFuel ? "sm:col-span-2" : ""}>
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {!isFuel && (
            <div>
              <Label>Description *</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Brake pad replacement, exterior wash"
              />
            </div>
          )}

          <div>
            <Label>
              Tags <span className="text-xs text-muted-foreground">(comma-separated)</span>
            </Label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="urgent, warranty, vendor-xyz"
            />
          </div>

          <div>
            <Label>Location</Label>
            <div className="flex gap-2">
              <Input
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder="Place / area"
              />
              <Button type="button" variant="outline" onClick={captureLocation}>
                <MapPin className="mr-2 h-4 w-4" /> Geo-tag
              </Button>
            </div>
            {geo && (
              <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {geo.lat}, {geo.lng}
                <button
                  type="button"
                  className="ml-1 text-destructive"
                  onClick={() => setGeo(null)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          {isFuel ? (
            <div className="space-y-2">
              <Label>
                Photos{" "}
                <span className="text-xs text-muted-foreground">
                  (odometer, pump, receipt required · filling optional)
                </span>
              </Label>
              <div className="grid gap-3 sm:grid-cols-4">
                <FileTile label="Odometer *" file={odoFile} onChange={setOdoFile} />
                <FileTile label="Pump / units *" file={pumpFile} onChange={setPumpFile} />
                <FileTile label="Receipt *" file={receiptFile} onChange={setReceiptFile} />
                <FileTile label="Filling (optional)" file={fillingFile} onChange={setFillingFile} />
              </div>
            </div>
          ) : (
            <div>
              <Label>Receipt photo (optional)</Label>
              <div className="mt-1">
                <FileTile label="Receipt / proof" file={receiptFile} onChange={setReceiptFile} />
              </div>
            </div>
          )}

          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional remarks"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Save Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FileTile({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-2">
      <Label className="text-xs">{label}</Label>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="mt-2 flex items-center gap-2">
          <img
            src={previewUrl}
            alt={label}
            className="h-14 w-14 rounded object-cover border border-border"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs">{file.name}</div>
            <button
              type="button"
              className="text-xs text-destructive hover:underline"
              onClick={() => onChange(null)}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className={cn(
            "mt-2 flex h-14 w-full items-center justify-center gap-2 rounded border border-border bg-card text-xs text-muted-foreground hover:bg-accent/5",
          )}
        >
          <Upload className="h-4 w-4" /> Upload / Capture
        </button>
      )}
    </div>
  );
}

type DonutSeg = { label: string; value: number; color: string };

function DonutBreakdown({
  title,
  total,
  entries,
  segments,
}: {
  title: string;
  total: number;
  entries: number;
  segments: DonutSeg[];
}) {
  const size = 140;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const denom = segments.reduce((s, x) => s + (x.value || 0), 0) || 1;
  let offset = 0;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
        <div className="text-xs text-muted-foreground">{entries} entries</div>
      </div>
      <div className="flex items-center gap-5">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={stroke}
          />
          {segments.map((s) => {
            const frac = (s.value || 0) / denom;
            const len = frac * c;
            const dash = `${len} ${c - len}`;
            const dashOffset = -offset;
            offset += len;
            if (len <= 0) return null;
            return (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={dash}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
          })}
          <text
            x={size / 2}
            y={size / 2 - 4}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px] uppercase tracking-wide"
          >
            Total
          </text>
          <text
            x={size / 2}
            y={size / 2 + 14}
            textAnchor="middle"
            className="fill-foreground text-[15px] font-bold"
          >
            ₹{Math.round(total).toLocaleString("en-IN")}
          </text>
        </svg>
        <ul className="min-w-0 flex-1 space-y-1.5">
          {segments.map((s) => {
            const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
            return (
              <li key={s.label} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  ₹{Math.round(s.value).toLocaleString("en-IN")}
                </span>
                <span className="w-10 rounded-full bg-muted px-1.5 py-0.5 text-center text-[10px] tabular-nums">
                  {pct}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
