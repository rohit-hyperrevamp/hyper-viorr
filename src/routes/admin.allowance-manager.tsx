import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Coins, Download, Edit2, Plus, Search, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { downloadCsv } from "@/lib/csv-export";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormulaBuilder } from "@/components/FormulaBuilder";
import { parseFormulaConfig, serializeFormulaConfig, type FormulaConfig, DEFAULT_PRESET } from "@/lib/formula-engine";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/allowance-manager")({
  component: AllowanceManagerPage,
});

type Operator = "+" | "-";
type BaseRef = { label: string; operator: Operator };
type FixedCalcMethod = "flat" | "per_duty";
type FixedDutyBucket = "p_days" | "ot_days" | "ph_days" | "other_paid_days";
type FixedDutyDivisor = "base_days" | "days_in_month" | "payable_days" | "fixed_26";

const FIXED_DUTY_BUCKETS: { value: FixedDutyBucket; label: string; short: string }[] = [
  { value: "p_days", label: "P Days (present)", short: "P" },
  { value: "ot_days", label: "ED Days", short: "ED" },
  { value: "ph_days", label: "PH Days (public holiday)", short: "PH" },
  { value: "other_paid_days", label: "Other Paid Days", short: "OPL" },
];

const FIXED_DUTY_DIVISORS: { value: FixedDutyDivisor; label: string; short: string }[] = [
  { value: "base_days",     label: "Base Days (contract — usually 26)",   short: "Base Days" },
  { value: "days_in_month", label: "Total Days in Month (calendar days)", short: "Days in Month" },
  { value: "payable_days",  label: "Payable Days (P + Other Paid)",       short: "Payable Days" },
  { value: "fixed_26",      label: "Fixed 26",                            short: "26" },
];

type Allowance = {
  id: string;
  name: string;
  earning_type: string;
  display_name: string;
  short_name: string;
  is_default: boolean;
  enabled: boolean;
  calc_type: "fixed" | "percentage";
  percentage: number;
  base_components: BaseRef[];
  cap_amount: number | null;
  include_in_ot: boolean;
  formula_mode: string | null;
  formula_expression: string | null;
  fixed_calc_method: FixedCalcMethod;
  fixed_duty_components: FixedDutyBucket[];
  fixed_duty_divisor: FixedDutyDivisor;
};

const QK = ["admin", "allowance-types"] as const;

// Built-in base tokens that always make sense as formula references.
const BUILTIN_BASES = ["Basic", "DA", "Gross", "CTC"];

function rowToItem(r: Record<string, unknown>): Allowance {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    earning_type: String(r.earning_type ?? ""),
    display_name: String(r.display_name ?? ""),
    short_name: String(r.short_name ?? ""),
    is_default: Boolean(r.is_default ?? false),
    enabled: Boolean(r.enabled ?? true),
    calc_type: (String(r.calc_type ?? "fixed") as "fixed" | "percentage"),
    percentage: Number(r.percentage ?? 0),
    base_components: Array.isArray(r.base_components) ? (r.base_components as BaseRef[]) : [],
    cap_amount: r.cap_amount == null ? null : Number(r.cap_amount),
    include_in_ot: r.include_in_ot == null ? true : Boolean(r.include_in_ot),
    formula_mode: r.formula_mode == null ? null : String(r.formula_mode),
    formula_expression: r.formula_expression == null ? null : String(r.formula_expression),
    fixed_calc_method: (String(r.fixed_calc_method ?? "flat") as FixedCalcMethod),
    fixed_duty_components: Array.isArray(r.fixed_duty_components)
      ? ((r.fixed_duty_components as string[]).filter((b) =>
          FIXED_DUTY_BUCKETS.some((x) => x.value === b),
        ) as FixedDutyBucket[])
      : [],
    fixed_duty_divisor: (FIXED_DUTY_DIVISORS.some((x) => x.value === r.fixed_duty_divisor)
      ? (r.fixed_duty_divisor as FixedDutyDivisor)
      : "base_days"),
  };
}

function buildFormulaPreview(a: Pick<Allowance, "calc_type" | "percentage" | "base_components" | "cap_amount">): string {
  if (a.calc_type === "fixed") return "Manual amount entered per contract";
  const parts = a.base_components.map((b, i) => (i === 0 ? b.label : `${b.operator === "-" ? "− " : "+ "}${b.label}`));
  const base = parts.length ? parts.join(" ") : "—";
  const tail = a.cap_amount && a.cap_amount > 0 ? ` (capped at ₹${a.cap_amount.toLocaleString("en-IN")})` : "";
  return `${a.percentage || 0}% of ${base}${tail}`;
}

function useAllowances() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Allowance[]> => {
      const { data, error } = await supabase
        .from("allowance_types" as never)
        .select("id,name,earning_type,display_name,short_name,is_default,enabled,calc_type,percentage,base_components,cap_amount,include_in_ot,formula_mode,formula_expression,fixed_calc_method,fixed_duty_components,fixed_duty_divisor")
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToItem);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  type Payload = Omit<Allowance, "id">;
  const toRow = (p: Payload) => ({
    name: p.name.trim(),
    earning_type: p.earning_type.trim(),
    display_name: p.display_name.trim(),
    short_name: p.short_name.trim(),
    is_default: p.is_default,
    enabled: p.enabled,
    calc_type: p.calc_type,
    percentage: p.calc_type === "percentage" ? Number(p.percentage) || 0 : 0,
    base_components: p.calc_type === "percentage" ? p.base_components : [],
    cap_amount: p.calc_type === "percentage" ? p.cap_amount : null,
    include_in_ot: p.include_in_ot,
    formula_mode: p.formula_mode ?? "preset",
    formula_expression: p.formula_expression,
    fixed_calc_method: p.calc_type === "fixed" ? p.fixed_calc_method : "flat",
    fixed_duty_components:
      p.calc_type === "fixed" && p.fixed_calc_method === "per_duty"
        ? p.fixed_duty_components
        : [],
    fixed_duty_divisor:
      p.calc_type === "fixed" && p.fixed_calc_method === "per_duty"
        ? p.fixed_duty_divisor
        : "base_days",
  });

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.name.trim()) throw new Error("Name is required");
      const { error } = await supabase.from("allowance_types" as never).insert(toRow(p) as never);
      if (error) throw error;
      void logActivity({ module: "Allowance Manager", action: "create", entityType: "allowance_types", entityLabel: String((p as Record<string, unknown>).display_name ?? ""), details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase.from("allowance_types" as never).update(toRow(p) as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Allowance Manager", action: "update", entityType: "allowance_types", entityId: id, entityLabel: String((p as Record<string, unknown>).display_name ?? ""), details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("allowance_types" as never).update({ enabled } as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Allowance Manager", action: enabled ? "enable" : "disable", entityType: "allowance_types", entityId: id, details: { enabled } });
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("allowance_types" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Allowance Manager", action: "delete", entityType: "allowance_types", entityId: id });
    },
    onSuccess: invalidate,
  });

  return { items, addMut, updateMut, toggleMut, deleteMut };
}

function AllowanceManagerPage() {
  const { items, addMut, updateMut, toggleMut, deleteMut } = useAllowances();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Allowance | null>(null);
  const [deleting, setDeleting] = useState<Allowance | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.earning_type.toLowerCase().includes(q) ||
        i.display_name.toLowerCase().includes(q) ||
        i.short_name.toLowerCase().includes(q),
    );
  }, [items, query]);

  // Labels usable as formula bases: built-ins + every other allowance's short/display name.
  const labelsFor = (current: Allowance | null): string[] => {
    const set = new Set<string>(BUILTIN_BASES);
    for (const a of items) {
      if (current && a.id === current.id) continue;
      const lbl = a.short_name || a.display_name || a.name;
      if (lbl) set.add(lbl);
    }
    return Array.from(set);
  };

  return (
    <div>
      <PageHeader
        title="Allowance Manager"
        description="Define allowance / earning components. Each one can be a fixed amount or a formula like 5% of Basic + Special Allowance."
        crumbs={[{ label: "Control Center", to: "/admin/control-center" }, { label: "Allowance Manager" }]}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search allowance…"
            className="h-10 rounded-lg pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setAddOpen(true)}
            className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add New Allowance Type
          </Button>
          <Button
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() =>
              downloadCsv(
                "allowance-types",
                filtered.map((i) => ({
                  name: i.name,
                  earning_type: i.earning_type,
                  display_name: i.display_name,
                  short_name: i.short_name,
                  formula: buildFormulaPreview(i),
                  is_default: i.is_default ? "Yes" : "No",
                  enabled: i.enabled ? "Yes" : "No",
                })),
                [
                  { key: "name", header: "Name" },
                  { key: "earning_type", header: "Earning Type" },
                  { key: "display_name", header: "Display Name" },
                  { key: "short_name", header: "Short Name" },
                  { key: "formula", header: "Formula" },
                  { key: "is_default", header: "Default" },
                  { key: "enabled", header: "Enabled" },
                ],
              )
            }
            className="h-10 rounded-lg"
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-accent/10 px-5 py-2.5 text-xs font-medium text-foreground">
          <span className="inline-flex items-center gap-2"><span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{filtered.length}</span><span className="uppercase tracking-[0.14em] text-muted-foreground">Total {filtered.length === 1 ? "row" : "rows"}</span></span>
        </div>
        <div className="overflow-x-clip">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Earning Type</th>
                <th className="px-5 py-3">Short</th>
                <th className="px-5 py-3">Formula</th>
                <th className="px-5 py-3">Default</th>
                <th className="px-5 py-3">In ED</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">

              {filtered.map((i) => (
                <tr key={i.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-medium text-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Coins className="h-4 w-4 text-muted-foreground" />
                      {i.name}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-foreground/90">{i.earning_type || "—"}</td>
                  <td className="px-5 py-3 text-foreground/90">{i.short_name || "—"}</td>
                  <td className="px-5 py-3 text-foreground/80">
                    {i.formula_mode && i.formula_mode !== "preset" && i.formula_expression ? (
                      <span className="inline-flex items-center gap-2" title={i.formula_expression}>
                        <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">Custom</span>
                        <span className="max-w-[280px] truncate font-mono text-[11px]">{i.formula_expression}</span>
                      </span>
                    ) : i.calc_type === "percentage" ? (
                      <span className="inline-flex items-center gap-2" title={buildFormulaPreview(i)}>
                        <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-accent">Formula</span>
                        {buildFormulaPreview(i)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Manual</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={
                        i.is_default
                          ? "inline-flex rounded-md bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {i.is_default ? "YES" : "NO"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={
                        i.include_in_ot
                          ? "inline-flex rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                          : "inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
                      }
                    >
                      {i.include_in_ot ? "YES" : "NO"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Switch
                      checked={i.enabled}
                      onCheckedChange={(v) =>
                        toggleMut.mutate(
                          { id: i.id, enabled: v },
                          {
                            onSuccess: () => toast.success(v ? "Enabled" : "Disabled"),
                            onError: (e) =>
                              toast.error(e instanceof Error ? e.message : "Update failed"),
                          },
                        )
                      }
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditing(i)}
                        aria-label="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleting(i)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    No allowance types found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AllowanceFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add New Allowance Type"
        baseLabels={labelsFor(null)}
        onSubmit={async (p) => {
          try {
            await addMut.mutateAsync(p);
            toast.success("Allowance added");
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not add allowance";
          }
        }}
      />

      <AllowanceFormDialog
        open={!!editing}
        initial={editing}
        baseLabels={labelsFor(editing)}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit Allowance Type"
        onSubmit={async (p) => {
          if (!editing) return null;
          try {
            await updateMut.mutateAsync({ id: editing.id, p });
            toast.success("Allowance updated");
            setEditing(null);
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not update allowance";
          }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this allowance type?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && <span className="font-semibold text-foreground">{deleting.name}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await deleteMut.mutateAsync(deleting.id);
                  toast.success("Allowance deleted");
                  setDeleting(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Delete failed");
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function legacyToFormulaConfig(initial: Allowance | null | undefined): FormulaConfig | null {
  if (!initial) return null;
  // Prefer a saved formula payload when present.
  if (initial.formula_expression && initial.formula_expression.trim()) {
    const existing = parseFormulaConfig(initial.formula_mode, initial.formula_expression);
    if (existing) return existing;
  }
  // Otherwise rebuild a preset from the legacy percentage/components fields so
  // the FormulaBuilder shows the same chips the user originally configured.
  if (initial.calc_type === "percentage") {
    const components = initial.base_components.map((b) => ({ name: b.label, operator: b.operator }));
    return {
      mode: "preset",
      preset: {
        base: components.length > 0 ? { kind: "composite", components } : { kind: "basic" },
        operator: "percent",
        percent: initial.percentage || 0,
        capAmount: initial.cap_amount ?? null,
        floorAmount: null,
        multipliers: [],
      },
    };
  }
  return parseFormulaConfig(initial.formula_mode, initial.formula_expression);
}

function AllowanceFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  baseLabels,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial?: Allowance | null;
  baseLabels?: string[];
  onSubmit: (p: Omit<Allowance, "id">) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [earningType, setEarningType] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [shortName, setShortName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState<"manual" | "formula">("manual");
  const [includeInOt, setIncludeInOt] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formulaCfg, setFormulaCfg] = useState<FormulaConfig | null>(null);
  const [fixedCalcMethod, setFixedCalcMethod] = useState<FixedCalcMethod>("flat");
  const [fixedDutyComponents, setFixedDutyComponents] = useState<FixedDutyBucket[]>([]);
  const [fixedDutyDivisor, setFixedDutyDivisor] = useState<FixedDutyDivisor>("base_days");
  const [defaultAmount, setDefaultAmount] = useState<string>("");

  useResetOnOpen(open, () => {
    setName(initial?.name ?? "");
    setEarningType(initial?.earning_type ?? "");
    setDisplayName(initial?.display_name ?? "");
    setShortName(initial?.short_name ?? "");
    setIsDefault(initial?.is_default ?? false);
    setEnabled(initial?.enabled ?? true);
    setIncludeInOt(initial?.include_in_ot ?? true);
    const cfg = legacyToFormulaConfig(initial);
    const hasFormulaSemantics =
      (initial?.calc_type === "percentage") ||
      !!initial?.formula_expression;
    setMode(hasFormulaSemantics ? "formula" : "manual");
    setFormulaCfg(cfg ?? { mode: "preset", preset: DEFAULT_PRESET });
    setFixedCalcMethod(initial?.fixed_calc_method ?? "flat");
    setFixedDutyComponents(initial?.fixed_duty_components ?? []);
    setFixedDutyDivisor(initial?.fixed_duty_divisor ?? "base_days");
    setDefaultAmount("");
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Used as an earning component in payroll.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HRA" />
          </div>
          <div className="grid gap-2">
            <Label>Earning Type</Label>
            <Input
              value={earningType}
              onChange={(e) => setEarningType(e.target.value)}
              placeholder="e.g. House Rent Allowance"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Display Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="HRA"
              />
            </div>
            <div className="grid gap-2">
              <Label>Short Name</Label>
              <Input
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="HRA"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>How is this amount calculated?</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "manual" | "formula")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual amount — entered on each contract</SelectItem>
                <SelectItem value="formula">Formula — auto-calculated from a preset or expression</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Pick &quot;Formula&quot; to compute this allowance from Basic, DA, Gross, or any custom expression — works for things like HRA = (Basic + DA) × 12%.
            </p>
          </div>

          {mode === "formula" && (
            <FormulaBuilder value={formulaCfg} onChange={setFormulaCfg} availableBases={baseLabels} />
          )}

          {mode === "manual" && (
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="grid gap-2">
                <Label>Default Amount (₹) — optional</Label>
                <Input type="number" value={defaultAmount} onChange={(e) => setDefaultAmount(e.target.value)} placeholder="e.g. 12.50" />
                <p className="text-[11px] text-muted-foreground">Used only as a preview baseline below. The actual amount is entered per contract.</p>
              </div>

              <div className="grid gap-2">
                <Label>Fixed Amount Formula</Label>
                <Select value={fixedCalcMethod} onValueChange={(v) => setFixedCalcMethod(v as FixedCalcMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">Flat — use the amount as entered</SelectItem>
                    <SelectItem value="per_duty">Per-Duty Proration — amount ÷ divisor × selected duties</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Per-Duty divides the amount by your chosen day basis (e.g. amount ÷ 26 or ÷ days-in-month), then multiplies by the sum of the duty buckets you pick below. Use this for LWF, bonus, ex-gratia and similar items that prorate by attendance.
                </p>
              </div>

              {fixedCalcMethod === "per_duty" && (
                <>
                  <div className="grid gap-2">
                    <Label>Divisor (day basis)</Label>
                    <Select value={fixedDutyDivisor} onValueChange={(v) => setFixedDutyDivisor(v as FixedDutyDivisor)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FIXED_DUTY_DIVISORS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Duty Buckets in &quot;Total Duties&quot;</Label>
                    <div className="flex flex-wrap gap-2">
                      {FIXED_DUTY_BUCKETS.map((b) => {
                        const active = fixedDutyComponents.includes(b.value);
                        return (
                          <button
                            key={b.value}
                            type="button"
                            onClick={() =>
                              setFixedDutyComponents((prev) =>
                                active ? prev.filter((x) => x !== b.value) : [...prev, b.value],
                              )
                            }
                            className={
                              "rounded-md border px-2.5 py-1 text-xs transition-colors " +
                              (active
                                ? "border-accent bg-accent/15 text-accent font-medium"
                                : "border-border bg-card hover:bg-accent/10")
                            }
                          >
                            {active ? "✓ " : "+ "}{b.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="rounded-md bg-secondary/40 px-3 py-2 text-[12px] text-foreground/80">
                      <span className="font-medium">Example:</span>{" "}
                      ₹{defaultAmount || "12.50"} ÷ {FIXED_DUTY_DIVISORS.find((d) => d.value === fixedDutyDivisor)?.short ?? "Base Days"} ×{" "}
                      ({fixedDutyComponents.length > 0
                        ? fixedDutyComponents
                            .map((b) => FIXED_DUTY_BUCKETS.find((x) => x.value === b)?.short ?? b)
                            .join(" + ")
                        : "select duties"})
                    </div>
                  </div>
                </>
              )}
            </div>
          )}


          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Default</div>
              <div className="text-xs text-muted-foreground">Auto-included for new employees</div>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Enabled</div>
              <div className="text-xs text-muted-foreground">Show in dropdowns</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Include in Extra Duty Calculation</div>
              <div className="text-xs text-muted-foreground">If off, this allowance is excluded from the extra duty base amount</div>
            </div>
            <Switch checked={includeInOt} onCheckedChange={setIncludeInOt} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const ser = mode === "formula" && formulaCfg ? serializeFormulaConfig(formulaCfg) : null;
              const err = await onSubmit({
                name,
                earning_type: earningType,
                display_name: displayName,
                short_name: shortName,
                is_default: isDefault,
                enabled,
                calc_type: mode === "formula" ? "percentage" : "fixed",
                percentage: 0,
                base_components: [],
                cap_amount: null,
                include_in_ot: includeInOt,
                formula_mode: ser ? ser.mode : "preset",
                formula_expression: ser ? ser.expression : null,
                fixed_calc_method: fixedCalcMethod,
                fixed_duty_components: fixedDutyComponents,
                fixed_duty_divisor: fixedDutyDivisor,
              });
              setSaving(false);
              if (err) toast.error(err);
              else onOpenChange(false);
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useResetOnOpen(open: boolean, reset: () => void) {
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    if (open) reset();
  }
}
