import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calculator, Download, Edit2, Plus, Search, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { downloadCsv } from "@/lib/csv-export";
import { toast } from "sonner";
import { confirmAction } from "@/components/ConfirmProvider";
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

export const Route = createFileRoute("/admin/cost-component-manager")({
  component: CostComponentManagerPage,
});

type Operator = "+" | "-";
type BaseRef = { label: string; operator: Operator };
type FixedCalcMethod = "flat" | "per_duty";
type FixedDutyBucket = "p_days" | "ot_days" | "ph_days" | "other_paid_days";
// Built-in divisor codes + "pdb:<uuid>" entries sourced from
// Payroll Days Manager (control center).
type FixedDutyDivisor = string;

const FIXED_DUTY_BUCKETS: { value: FixedDutyBucket; label: string; short: string }[] = [
  { value: "p_days", label: "P Days (present)", short: "P" },
  { value: "ot_days", label: "ED Days", short: "ED" },
  { value: "ph_days", label: "PH Days (public holiday)", short: "PH" },
  { value: "other_paid_days", label: "Other Paid Days", short: "OPL" },
];

const BUILTIN_DIVISORS: { value: FixedDutyDivisor; label: string; short: string }[] = [
  { value: "base_days",     label: "Base Days (contract — usually 26)",   short: "Base Days" },
  { value: "days_in_month", label: "Total Days in Month (calendar days)", short: "Days in Month" },
  { value: "payable_days",  label: "Payable Days (P + Other Paid)",       short: "Payable Days" },
  { value: "fixed_26",      label: "Fixed 26",                            short: "26" },
];

type PayrollDayBaseOpt = { id: string; name: string; methodLabel: string };
const METHOD_LABEL: Record<string, string> = {
  actual_days: "Calendar days",
  fixed_days: "Fixed days",
  actual_minus_weekly_off: "Calendar − weekly off",
  custom_weekdays: "Custom weekdays",
};

function usePayrollDayBaseOptions() {
  const { data = [] } = useQuery({
    queryKey: ["admin", "cost-components", "payroll-day-bases"],
    queryFn: async (): Promise<PayrollDayBaseOpt[]> => {
      const { data, error } = await supabase
        .from("payroll_day_bases" as never)
        .select("id,name,method,enabled,sort_order")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[])
        .filter((r) => r.enabled !== false)
        .map((r) => ({
          id: String(r.id),
          name: String(r.name ?? ""),
          methodLabel: METHOD_LABEL[String(r.method ?? "")] ?? "Payroll day base",
        }));
    },
  });
  return data;
}

function buildDivisorOptions(bases: PayrollDayBaseOpt[]): { value: string; label: string; short: string }[] {
  const dyn = bases.map((b) => ({
    value: `pdb:${b.id}`,
    label: `${b.name} — ${b.methodLabel}`,
    short: b.name,
  }));
  return [...BUILTIN_DIVISORS, ...dyn];
}

function divisorShort(value: FixedDutyDivisor | null | undefined, options: { value: string; short: string }[]): string {
  return options.find((d) => d.value === value)?.short ?? "Base Days";
}

export type PartyKind = "employee" | "employer" | "both";

const PARTY_LABEL: Record<PartyKind, string> = {
  employee: "Employee",
  employer: "Employer",
  both: "Both",
};

type CostComponent = {
  id: string;
  name: string;
  calc_type: "percentage" | "fixed";
  percentage: number;
  base_components: BaseRef[];
  cap_amount: number | null;
  cap_flat_amount: number | null;
  amount: number | null;
  state: string;
  party: PartyKind;
  description: string;
  notes: string;
  enabled: boolean;
  sort_order: number;
  deduction_calc_type: "earned_salary" | "fixed_amount";
  fixed_calc_method: FixedCalcMethod;
  fixed_duty_components: FixedDutyBucket[];
  fixed_duty_divisor: FixedDutyDivisor;
  formula_mode: string | null;
  formula_expression: string | null;
};


type AllowanceRow = { id: string; name: string; display_name: string; short_name: string };
type StateRow = { id: string; name: string };

const QK = ["admin", "cost-components"] as const;
const ALLOW_QK = ["admin", "cost-components", "allowance-options"] as const;
const STATES_QK = ["admin", "cost-components", "states"] as const;
const STATUTORY_ESI_BASE: BaseRef[] = [
  { label: "Gross", operator: "+" },
  { label: "Washing Allowance", operator: "-" },
  { label: "Conveyance Allowance", operator: "-" },
];

function isEsiName(name: string) {
  return /\besi(c)?\b/i.test(name);
}

function rowToItem(r: Record<string, unknown>): CostComponent {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    calc_type: (String(r.calc_type ?? "percentage") as "percentage" | "fixed"),
    percentage: Number(r.percentage ?? 0),
    base_components: Array.isArray(r.base_components) ? (r.base_components as BaseRef[]) : [],
    cap_amount: r.cap_amount == null ? null : Number(r.cap_amount),
    cap_flat_amount: r.cap_flat_amount == null ? null : Number(r.cap_flat_amount),
    amount: r.amount == null ? null : Number(r.amount),
    state: String(r.state ?? "N/A"),
    party: (["employee", "employer", "both"].includes(String(r.party))
      ? (r.party as PartyKind)
      : "both"),
    description: String(r.description ?? ""),
    notes: String(r.notes ?? ""),
    enabled: Boolean(r.enabled ?? true),
    sort_order: Number(r.sort_order ?? 0),
    deduction_calc_type:
      (String(r.deduction_calc_type ?? "earned_salary") as "earned_salary" | "fixed_amount"),
    fixed_calc_method:
      (String(r.fixed_calc_method ?? "flat") as FixedCalcMethod),
    fixed_duty_components: Array.isArray(r.fixed_duty_components)
      ? ((r.fixed_duty_components as string[]).filter((b) =>
          FIXED_DUTY_BUCKETS.some((x) => x.value === b),
        ) as FixedDutyBucket[])
      : [],
    fixed_duty_divisor: (r.fixed_duty_divisor as string) || "base_days",
    formula_mode: r.formula_mode == null ? null : String(r.formula_mode),
    formula_expression: r.formula_expression == null ? null : String(r.formula_expression),
  };
}


function buildDescription(c: Pick<CostComponent, "calc_type" | "percentage" | "base_components" | "cap_amount" | "cap_flat_amount" | "amount"> & { name?: string; fixed_calc_method?: FixedCalcMethod; fixed_duty_components?: FixedDutyBucket[]; fixed_duty_divisor?: FixedDutyDivisor }): string {
  if (c.calc_type === "fixed") {
    if (c.fixed_calc_method === "per_duty") {
      const buckets = (c.fixed_duty_components ?? [])
        .map((b) => FIXED_DUTY_BUCKETS.find((x) => x.value === b)?.short ?? b)
        .join(" + ") || "—";
      const amt = c.amount != null && c.amount > 0 ? `₹${c.amount.toLocaleString("en-IN")}` : "amount";
      const divLabel = BUILTIN_DIVISORS.find((x) => x.value === (c.fixed_duty_divisor ?? "base_days"))?.short ?? "Custom day base";
      return `${amt} ÷ ${divLabel} × (${buckets}) · per-duty`;
    }

    const isMgmt = /management\s*fee/i.test(c.name ?? "");
    if (isMgmt) {
      return c.amount != null && c.amount > 0
        ? `₹${c.amount.toLocaleString("en-IN")} · prorated by T Days in payroll`
        : "Prorated by T Days (manual entry)";
    }
    return c.amount != null && c.amount > 0 ? `Fixed ₹${c.amount.toLocaleString("en-IN")}` : "Fixed amount (manual entry)";
  }

  const name = (c.name ?? "").toLowerCase();
  void name;
  const parts = c.base_components.map((b, i) => (i === 0 ? b.label : `${b.operator === "-" ? "(-) " : "(+) "}${b.label}`));
  const base = parts.length ? parts.join(" ") : "—";
  if (c.cap_amount && c.cap_amount > 0) {
    if (c.cap_flat_amount == null) {
      const flat = Math.round(((c.percentage || 0) / 100) * c.cap_amount);
      return `${c.percentage}% of (${base}) if ≤ ₹${c.cap_amount.toLocaleString("en-IN")}, else flat ₹${flat.toLocaleString("en-IN")}`;
    }
    if (c.cap_flat_amount <= 0) {
      return `${c.percentage}% of (${base}) only if ≤ ₹${c.cap_amount.toLocaleString("en-IN")}, else ₹0`;
    }
    return `${c.percentage}% of (${base}) if ≤ ₹${c.cap_amount.toLocaleString("en-IN")}, else flat ₹${c.cap_flat_amount.toLocaleString("en-IN")}`;
  }
  return `${c.percentage}% of ${base}`;
}


/** Stored description wins; otherwise describe the configured formula. */
function displayDescription(c: CostComponent): string {
  return c.description?.trim() ? c.description.trim() : buildDescription(c);
}

function useCostComponents() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<CostComponent[]> => {
      const { data, error } = await supabase
        .from("cost_components" as never)
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToItem);
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  type Payload = Omit<CostComponent, "id">;
  const toRow = (p: Payload) => ({
    name: p.name.trim(),
    calc_type: p.calc_type,
    percentage: p.calc_type === "percentage" ? Number(p.percentage) || 0 : 0,
    base_components: p.calc_type === "percentage" ? p.base_components : [],
    cap_amount: p.calc_type === "percentage" ? p.cap_amount : null,
    cap_flat_amount: p.calc_type === "percentage" ? p.cap_flat_amount : null,
    amount: p.calc_type === "fixed" ? p.amount : null,
    state: p.state || "N/A",
    party: p.party || "both",
    description: p.description?.trim() ? p.description.trim() : null,
    notes: p.notes,
    enabled: p.enabled,
    sort_order: p.sort_order,
    deduction_calc_type: p.deduction_calc_type,
    fixed_calc_method: p.calc_type === "fixed" ? p.fixed_calc_method : "flat",
    fixed_duty_components:
      p.calc_type === "fixed" && p.fixed_calc_method === "per_duty"
        ? p.fixed_duty_components
        : [],
    fixed_duty_divisor:
      p.calc_type === "fixed" && p.fixed_calc_method === "per_duty"
        ? p.fixed_duty_divisor
        : "base_days",
    formula_mode: p.formula_mode ?? "preset",
    formula_expression: p.formula_expression,
  });


  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.name.trim()) throw new Error("Name is required");
      const { error } = await supabase.from("cost_components" as never).insert(toRow(p) as never);
      if (error) throw error;
      void logActivity({ module: "Cost Component Manager", action: "create", entityType: "cost_components", entityLabel: p.name, details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase.from("cost_components" as never).update(toRow(p) as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Cost Component Manager", action: "update", entityType: "cost_components", entityId: id, entityLabel: p.name, details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });
  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("cost_components" as never).update({ enabled } as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Cost Component Manager", action: enabled ? "enable" : "disable", entityType: "cost_components", entityId: id, details: { enabled } });
    },
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cost_components" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Cost Component Manager", action: "delete", entityType: "cost_components", entityId: id });
    },
    onSuccess: invalidate,
  });

  return { items, addMut, updateMut, toggleMut, deleteMut };
}

function useAllowanceOptions() {
  const { data = [] } = useQuery({
    queryKey: ALLOW_QK,
    queryFn: async (): Promise<AllowanceRow[]> => {
      const { data, error } = await supabase
        .from("allowance_types" as never)
        .select("id,name,display_name,short_name")
        .eq("enabled", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as unknown) as AllowanceRow[];
    },
  });
  return data;
}

function useStateOptions() {
  const { data = [] } = useQuery({
    queryKey: STATES_QK,
    queryFn: async (): Promise<StateRow[]> => {
      const { data, error } = await supabase.from("states" as never).select("id,name").order("name");
      if (error) throw error;
      return (data as unknown) as StateRow[];
    },
  });
  return data;
}

// Built-in base tokens that aren't in allowance master
const BUILTIN_BASES = ["Basic", "DA", "Gross", "CTC", "HRA"];

function CostComponentManagerPage() {
  const { items, addMut, updateMut, toggleMut, deleteMut } = useCostComponents();
  const allowances = useAllowanceOptions();
  const states = useStateOptions();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<CostComponent | null>(null);
  const [deleting, setDeleting] = useState<CostComponent | null>(null);

  const baseLabels = useMemo(() => {
    const set = new Set<string>(BUILTIN_BASES);
    for (const a of allowances) {
      if (a.display_name) set.add(a.display_name);
      else if (a.name) set.add(a.name);
    }
    return Array.from(set);
  }, [allowances]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => {
      const desc = displayDescription(i).toLowerCase();
      return (
        i.name.toLowerCase().includes(q) ||
        i.state.toLowerCase().includes(q) ||
        PARTY_LABEL[i.party].toLowerCase().includes(q) ||
        desc.includes(q)
      );
    });
  }, [items, query]);

  return (
    <div>
      <PageHeader
        title="Cost Component Manager"
        description="Configure CTC cost components like EPF, ESI, Bonus, Gratuity, LWF, Uniform charges, etc."
        crumbs={[{ label: "Control Center", to: "/admin/control-center" }, { label: "Cost Component Manager" }]}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cost component…"
            className="h-10 rounded-lg pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddOpen(true)} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="mr-1.5 h-4 w-4" /> Add Cost Component
          </Button>
          <Button
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() =>
              downloadCsv(
                "cost-components",
                filtered.map((i) => ({
                  name: i.name,
                  description: displayDescription(i),
                  calc_type: i.calc_type,
                  percentage: i.percentage,
                  party: PARTY_LABEL[i.party],
                  state: i.state,
                  enabled: i.enabled ? "Yes" : "No",
                })),
                [
                  { key: "name", header: "Name" },
                  { key: "description", header: "Description" },
                  { key: "calc_type", header: "Type" },
                  { key: "percentage", header: "%" },
                  { key: "party", header: "Employee/Employer" },
                  { key: "state", header: "State" },
                  { key: "enabled", header: "Active" },
                ],
              )
            }
            className="h-10 rounded-lg"
          >
            <Download className="mr-1.5 h-4 w-4" /> Export
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
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3">%</th>
                <th className="px-5 py-3">Party</th>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3">Active</th>
                <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((i) => (
                <tr key={i.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-medium text-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Calculator className="h-4 w-4 text-muted-foreground" />
                      {i.name}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-foreground/80">{displayDescription(i)}</td>
                  <td className="px-5 py-3 text-foreground/90">
                    {i.calc_type === "percentage" ? `${i.percentage}%` : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      i.party === "employee"
                        ? "bg-primary/10 text-primary"
                        : i.party === "employer"
                          ? "bg-accent/20 text-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}>
                      {PARTY_LABEL[i.party]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-foreground/90">{i.state || "N/A"}</td>
                  <td className="px-5 py-3">
                    <Switch
                      checked={i.enabled}
                      onCheckedChange={(v) =>
                        toggleMut.mutate(
                          { id: i.id, enabled: v },
                          {
                            onSuccess: () => toast.success(v ? "Enabled" : "Disabled"),
                            onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
                          },
                        )
                      }
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => setEditing(i)} aria-label="Edit">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleting(i)} aria-label="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    No cost components found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CostComponentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Cost Component"
        baseLabels={baseLabels}
        states={states}
        onSubmit={async (p) => {
          try {
            await addMut.mutateAsync(p);
            toast.success("Cost component added");
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not add";
          }
        }}
      />

      <CostComponentDialog
        open={!!editing}
        initial={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit Cost Component"
        baseLabels={baseLabels}
        states={states}
        onSubmit={async (p) => {
          if (!editing) return null;
          try {
            await updateMut.mutateAsync({ id: editing.id, p });
            toast.success("Cost component updated");
            setEditing(null);
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not update";
          }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this cost component?</AlertDialogTitle>
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
                  toast.success("Deleted");
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

function CostComponentDialog({
  open,
  onOpenChange,
  title,
  initial,
  baseLabels,
  states,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial?: CostComponent | null;
  baseLabels: string[];
  states: StateRow[];
  onSubmit: (p: Omit<CostComponent, "id">) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [calcType, setCalcType] = useState<"percentage" | "fixed">("percentage");
  const [amount, setAmount] = useState<string>("");
  const [state, setState] = useState<string>("N/A");
  const [party, setParty] = useState<PartyKind>("both");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [sortOrder, setSortOrder] = useState<string>("0");
  const [deductionCalcType, setDeductionCalcType] =
    useState<"earned_salary" | "fixed_amount">("earned_salary");
  const [fixedCalcMethod, setFixedCalcMethod] = useState<FixedCalcMethod>("flat");
  const [fixedDutyComponents, setFixedDutyComponents] = useState<FixedDutyBucket[]>([]);
  const [fixedDutyDivisor, setFixedDutyDivisor] = useState<FixedDutyDivisor>("base_days");
  const payrollDayBases = usePayrollDayBaseOptions();
  const divisorOptions = useMemo(() => buildDivisorOptions(payrollDayBases), [payrollDayBases]);
  const [saving, setSaving] = useState(false);
  const [formulaCfg, setFormulaCfg] = useState<FormulaConfig | null>(null);

  useResetOnOpen(open, () => {
    setName(initial?.name ?? "");
    setCalcType(initial?.calc_type ?? "percentage");
    setAmount(initial?.amount != null ? String(initial.amount) : "");
    setState(initial?.state ?? "N/A");
    setParty(initial?.party ?? "both");
    setDescription(initial?.description ?? "");
    setNotes(initial?.notes ?? "");
    setEnabled(initial?.enabled ?? true);
    setSortOrder(String(initial?.sort_order ?? 0));
    setDeductionCalcType(initial?.deduction_calc_type ?? "earned_salary");
    setFixedCalcMethod(initial?.fixed_calc_method ?? "flat");
    setFixedDutyComponents(initial?.fixed_duty_components ?? []);
    setFixedDutyDivisor(initial?.fixed_duty_divisor ?? "base_days");
    // Seed formula: explicit saved formula_expression wins; otherwise rebuild a
    // preset from legacy calc_type=percentage + base_components + percentage so
    // existing rows open with their original chips populated in the builder.
    let cfg: FormulaConfig | null = null;
    if (initial?.formula_expression && initial.formula_expression.trim()) {
      cfg = parseFormulaConfig(initial.formula_mode, initial.formula_expression);
    }
    if (!cfg && initial && initial.calc_type === "percentage") {
      const components = (initial.base_components ?? []).map((b) => ({ name: b.label, operator: b.operator }));
      cfg = {
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
    if (!cfg) cfg = { mode: "preset", preset: DEFAULT_PRESET };
    setFormulaCfg(cfg);
  });


  const stateOptions = useMemo(() => ["N/A", ...states.map((s) => s.name)], [states]);

  const preview = calcType === "fixed"
    ? buildDescription({
        calc_type: calcType,
        percentage: 0,
        base_components: [],
        cap_amount: null,
        cap_flat_amount: null,
        amount: amount ? Number(amount) : null,
        name,
        fixed_calc_method: fixedCalcMethod,
        fixed_duty_components: fixedDutyComponents,
        fixed_duty_divisor: fixedDutyDivisor,
      })
    : "";


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Define how this cost is calculated.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. EPF Employer Contribution" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Calculation Type</Label>
              <Select value={calcType} onValueChange={(v) => setCalcType(v as "percentage" | "fixed")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Formula — auto-calculated from preset or expression</SelectItem>
                  <SelectItem value="fixed">Fixed amount — manual or per-duty</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>State</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stateOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Employee / Employer</Label>
              <Select value={party} onValueChange={(v) => setParty(v as PartyKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee (EE) — shows under Deductions</SelectItem>
                  <SelectItem value="employer">Employer (ER) — shows under Employer Contribution</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Sort Order</Label>
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>
          </div>

          {calcType === "percentage" ? (
            <FormulaBuilder value={formulaCfg} onChange={setFormulaCfg} availableBases={baseLabels} />
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>Fixed Amount (₹) — optional, can be entered later</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Manual entry" />
              </div>

              <div className="rounded-lg border border-border p-3 space-y-3">
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
                    Per-Duty divides the amount by your chosen day basis (e.g. amount ÷ 26 or ÷ days-in-month), then multiplies by the sum of the duty buckets you pick below.
                  </p>
                </div>

                {fixedCalcMethod === "per_duty" && (
                  <div className="grid gap-2">
                    <Label>Divisor (day basis)</Label>
                    <Select value={fixedDutyDivisor} onValueChange={(v) => setFixedDutyDivisor(v as FixedDutyDivisor)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {divisorOptions.map((d) => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {fixedCalcMethod === "per_duty" && (
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
                      ₹{amount || "200"} ÷ {divisorShort(fixedDutyDivisor, divisorOptions)} ×{" "}
                      ({fixedDutyComponents.length > 0
                        ? fixedDutyComponents
                            .map((b) => FIXED_DUTY_BUCKETS.find((x) => x.value === b)?.short ?? b)
                            .join(" + ")
                        : "select duties"})
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}


          <div className="grid gap-2">
            <Label>Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Leave blank to auto-generate from the formula"
            />
            <p className="text-xs text-muted-foreground">
              Shown in the Description column. When empty, the system describes the formula automatically.
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal note" />
          </div>

          <div className="grid gap-2">
            <Label>Deduction Calculation Type</Label>
            <Select
              value={deductionCalcType}
              onValueChange={(v) => setDeductionCalcType(v as "earned_salary" | "fixed_amount")}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="earned_salary">Earned Salary Based — prorates with attendance</SelectItem>
                <SelectItem value="fixed_amount">Fixed Amount — deduct full amount regardless of attendance</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Applies only when this component is used as a deduction or employee/employer contribution.
            </p>
          </div>


          {preview && (
            <div className="rounded-lg border border-dashed border-border bg-secondary/30 px-3 py-2 text-sm">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Preview · </span>
              <span className="font-medium text-foreground">{preview}</span>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Active</div>
              <div className="text-xs text-muted-foreground">Available for selection</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const ser = calcType === "percentage" && formulaCfg ? serializeFormulaConfig(formulaCfg) : null;
              const err = await onSubmit({
                name,
                calc_type: calcType,
                percentage: 0,
                base_components: [],
                cap_amount: null,
                cap_flat_amount: null,
                amount: amount ? Number(amount) : null,
                state: state || "N/A",
                party,
                description,
                notes,
                enabled,
                sort_order: Number(sortOrder) || 0,
                deduction_calc_type: deductionCalcType,
                fixed_calc_method: fixedCalcMethod,
                fixed_duty_components: fixedDutyComponents,
                fixed_duty_divisor: fixedDutyDivisor,
                formula_mode: ser ? ser.mode : "preset",
                formula_expression: ser ? ser.expression : null,
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
