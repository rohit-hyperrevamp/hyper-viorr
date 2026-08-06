import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Coins, Download, Edit2, Plus, Search, Trash2, ChevronLeft, ChevronsUpDown, Check, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv-export";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { PayrollTabs } from "@/components/PayrollTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { z } from "zod";
import { CHARTER_UNITS_QK, fetchCharterUnits } from "@/lib/charter-units";
import { fetchLiveContractDeductions } from "@/lib/contract-deductions-live";

const searchSchema = z.object({
  mode: z.enum(["list", "create", "edit"]).default("list"),
  id: z.string().optional(),
});

export const Route = createFileRoute("/admin/deductions")({
  validateSearch: (s) => searchSchema.parse(s),
  component: DeductionsPage,
});

type CalcType = "lumpsum" | "emi";
type Status = "active" | "paused" | "completed" | "cancelled";
type EntryMode = "lumpsum" | "days_x_per_day";
type DayBucket = "present" | "worked" | "ot" | "ph";

type Deduction = {
  id: string;
  candidate_id: string;
  deduction_type_id: string;
  deduction_date: string;
  deduction_name: string;
  calculation_type: CalcType;
  amount: number;
  installments: number;
  min_duty?: number;
  max_duty?: number;
  description: string;
  status: Status;
  source_kind?: string | null;
  entry_mode?: EntryMode;
  days?: number | null;
  per_day_amount?: number | null;
  include_in_total_days?: boolean;
  affects_days_for?: DayBucket[];
  emi_group_id?: string | null;
  emi_index?: number | null;
  emi_total?: number | null;
};

/** Split a total into n monthly instalments; the last one absorbs rounding. */
function splitEmi(total: number, n: number): number[] {
  const per = Math.round((total / n) * 100) / 100;
  const parts = Array.from({ length: n }, () => per);
  parts[n - 1] = Math.round((total - per * (n - 1)) * 100) / 100;
  return parts;
}

/** Add whole months to a yyyy-mm-dd date, clamping to the end of shorter months. */
function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

const DAY_BUCKETS: { value: DayBucket; label: string }[] = [
  { value: "present", label: "Present Duties" },
  { value: "ot", label: "ED" },
  { value: "ph", label: "PH" },
];

type DType = { id: string; name: string; code: string; is_active: boolean };
type Emp = { id: string; full_name: string; employee_code: string; mobile: string };

const QK_DED = ["admin", "deductions"] as const;

function fmtINR(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function amendmentHead(name: string): string {
  return name
    .replace(/\s+—\s+amendment\s+v\d+\s*\([^)]*\)\s*$/i, "")
    .replace(/\s+recovery\s*\(v\d+\)\s+—\s+\d{4}-\d{2}\s*$/i, "");
}

function EmployeeCombobox({
  employees,
  value,
  onChange,
  placeholder,
}: {
  employees: Emp[];
  value: string[];
  onChange: (val: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedMap = useMemo(() => new Set(value), [value]);

  const display = useMemo(() => {
    if (value.length === 0) return placeholder ?? "Select employees";
    if (value.length === 1) {
      const e = employees.find((x) => x.id === value[0]);
      return e
        ? `${e.employee_code ? e.employee_code + " - " : ""}${e.full_name}`
        : placeholder ?? "Select employees";
    }
    return `${value.length} employees selected`;
  }, [value, employees, placeholder]);

  const filtered = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.toLowerCase();
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q) ||
        (e.mobile && e.mobile.includes(q))
    );
  }, [employees, search]);

  const toggle = (id: string) => {
    const next = new Set(value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  const clearAll = () => onChange([]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{display}</span>
          <div className="flex items-center gap-1">
            {value.length > 0 && (
              <span
                className="inline-flex h-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  clearAll();
                }}
              >
                {value.length}
              </span>
            )}
            <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search employee..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No employee found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((e) => {
                const isSelected = selectedMap.has(e.id);
                return (
                  <CommandItem
                    key={e.id}
                    value={e.id}
                    onSelect={() => toggle(e.id)}
                    className="flex items-center gap-2"
                  >
                    <div className={cn("flex h-4 w-4 items-center justify-center rounded border", isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-transparent")}>
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <span className="truncate">
                      {e.employee_code ? `${e.employee_code} - ` : ""}
                      {e.full_name}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DeductionsPage() {
  const search = Route.useSearch();
  if (search.mode === "create" || search.mode === "edit") return <DeductionForm />;
  return <DeductionList />;
}

function useDeductionTypes() {
  return useQuery({
    queryKey: ["admin", "deduction-types", "active"],
    queryFn: async (): Promise<DType[]> => {
      const { data, error } = await supabase
        .from("deduction_types" as never)
        .select("id,name,code,is_active")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data as unknown) as DType[];
    },
  });
}

function useEmployees() {
  return useQuery({
    queryKey: ["admin", "employees-lite"],
    queryFn: async (): Promise<Emp[]> => {
      const { data, error } = await supabase
        .from("candidates")
        .select("id,full_name,employee_code,mobile")
        .in("status", ["approved", "active"])
        .order("full_name");
      if (error) throw error;
      return (data ?? []).map((c) => ({
        id: c.id as string,
        full_name: (c.full_name as string) ?? "",
        employee_code: (c.employee_code as string) ?? "",
        mobile: (c.mobile as string) ?? "",
      }));
    },
  });
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type LineRow = {
  key: string;
  candidateId: string;
  employee: string;
  employeeCode: string;
  unitName: string;
  designation: string;
  head: string;
  source: "recorded" | "contract";
  sourceLabel: string;
  date: string;
  amount: number;
  status: string;
  record?: Deduction;
};

/**
 * One single deductions register. Every deduction — manually recorded, auto
 * generated (uniform / GPAIP / unit fee) and the live contract + statutory
 * heads (EE EPF, EE ESI, Professional Tax, LWF…) — is listed as its OWN line
 * item so each head can be processed and reconciled separately.
 */
function DeductionList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const types = useDeductionTypes();
  const emps = useEmployees();

  const now = new Date();
  const [monthIdx, setMonthIdx] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [unitId, setUnitId] = useState<string>("");
  const [q, setQ] = useState("");
  const [headFilter, setHeadFilter] = useState<string>("all");

  const unitsQ = useQuery({ queryKey: CHARTER_UNITS_QK, queryFn: fetchCharterUnits });
  const units = unitsQ.data?.units ?? [];
  const effectiveUnitId = unitId || units[0]?.id || "";
  const unitName = units.find((u) => u.id === effectiveUnitId)?.name ?? "";

  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(monthIdx + 1)}-01`;
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  const todayIso = new Date().toISOString().slice(0, 10);
  const monthEnd = `${year}-${pad(monthIdx + 1)}-${pad(lastDay)}`;
  const end = monthEnd > todayIso && start <= todayIso ? todayIso : monthEnd;

  // Recorded / auto-generated deduction rows for this period.
  const recordedQ = useQuery({
    queryKey: [...QK_DED, start, monthEnd],
    queryFn: async (): Promise<Deduction[]> => {
      const { data, error } = await supabase
        .from("deductions" as never)
        .select("id,candidate_id,deduction_type_id,deduction_date,deduction_name,calculation_type,amount,installments,description,status,min_duty,max_duty,source_kind,created_at")
        .gte("deduction_date", start)
        .lte("deduction_date", monthEnd)
        .order("deduction_date", { ascending: false });
      if (error) throw error;
      return (data as unknown) as Deduction[];
    },
  });

  // Which employees belong to the selected unit (primary posting or mapped).
  const rosterQ = useQuery({
    queryKey: ["deductions", "unit-roster", effectiveUnitId],
    enabled: !!effectiveUnitId,
    queryFn: async (): Promise<Set<string>> => {
      const [{ data: primary }, { data: links }] = await Promise.all([
        supabase.from("candidates").select("id").eq("unit_id", effectiveUnitId),
        supabase.from("candidate_units").select("candidate_id").eq("unit_id", effectiveUnitId),
      ]);
      return new Set([
        ...((primary ?? []).map((c) => c.id as string)),
        ...((links ?? []).map((l) => l.candidate_id as string)),
      ]);
    },
  });

  // Live contract + statutory lines for the same unit & period.
  const liveQ = useQuery({
    queryKey: ["contract-deductions-live", effectiveUnitId, start, end],
    enabled: !!effectiveUnitId,
    queryFn: () => fetchLiveContractDeductions({ unitId: effectiveUnitId, unitName, start, end }),
  });

  const typeMap = useMemo(() => new Map((types.data ?? []).map((t) => [t.id, t])), [types.data]);
  const empMap = useMemo(() => new Map((emps.data ?? []).map((e) => [e.id, e])), [emps.data]);

  const rows: LineRow[] = useMemo(() => {
    const out: LineRow[] = [];
    const roster = rosterQ.data;

    // Once payroll is processed the run posts the real deduction rows into the
    // ledger. From that moment the live contract/statutory projection is a
    // duplicate (and can differ, because it recomputes on today's attendance),
    // so it is suppressed for every employee that already has posted lines.
    const postedCandidates = new Set(
      (recordedQ.data ?? [])
        .filter((d) => d.source_kind === "payroll_run" || d.source_kind === "payroll_amendment")
        .map((d) => d.candidate_id),
    );

    for (const r of liveQ.data?.rows ?? []) {
      if (postedCandidates.has(r.candidateId)) continue;
      for (const l of r.lines) {
        out.push({
          key: `live:${r.candidateId}:${l.name}`,
          candidateId: r.candidateId,
          employee: r.name,
          employeeCode: r.employeeCode,
          unitName: r.unitName,
          designation: r.designation,
          head: l.name,
          source: "contract",
          sourceLabel: "Contract / statutory (projected)",
          date: `${start} → ${end}`,
          amount: l.amount,
          status: "active",
        });
      }
    }


    for (const d of recordedQ.data ?? []) {
      if (roster && roster.size > 0 && !roster.has(d.candidate_id)) continue;
      const emp = empMap.get(d.candidate_id);
      out.push({
        key: `rec:${d.id}`,
        candidateId: d.candidate_id,
        employee: emp?.full_name ?? "—",
        employeeCode: emp?.employee_code ?? "",
        unitName,
        designation: "—",
        head: d.source_kind === "payroll_amendment"
          ? amendmentHead(d.deduction_name)
          : typeMap.get(d.deduction_type_id)?.name || d.deduction_name,
        source: "recorded",
        sourceLabel:
          d.source_kind === "issuance" ? "Auto · Uniform issued"
          : d.source_kind === "unit_fee" ? "Auto · Unit fee"
          : d.source_kind === "payroll_run" ? "Payroll processed"
          : d.source_kind === "payroll_amendment" ? "Payroll amendment"
          : "Recorded",

        date: d.deduction_date,
        amount: Number(d.amount) || 0,
        status: d.status,
        record: d,
      });
    }

    return out.sort((a, b) => a.employee.localeCompare(b.employee) || a.head.localeCompare(b.head));
  }, [liveQ.data, recordedQ.data, rosterQ.data, empMap, typeMap, unitName, start, end]);

  const heads = useMemo(
    () => Array.from(new Set(rows.map((r) => r.head))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (headFilter !== "all" && r.head !== headFilter) return false;
      if (!s) return true;
      return (
        r.employee.toLowerCase().includes(s) ||
        r.employeeCode.toLowerCase().includes(s) ||
        r.head.toLowerCase().includes(s) ||
        r.designation.toLowerCase().includes(s)
      );
    });
  }, [rows, q, headFilter]);

  const byHead = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) m.set(r.head, (m.get(r.head) ?? 0) + r.amount);
    return Array.from(m, ([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  const total = useMemo(() => filtered.reduce((s, r) => s + r.amount, 0), [filtered]);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deductions" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Deductions", action: "delete", entityType: "deductions", entityId: id });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_DED }),
  });

  const [deleting, setDeleting] = useState<Deduction | null>(null);

  return (
    <div>
      <PayrollTabs />
      <PageHeader
        title="Deductions"
        description="Every deduction head — recorded, auto-generated and contract/statutory — as its own line item, per employee."
        crumbs={[{ label: "Payroll", to: "/admin/payroll" }, { label: "Deductions" }]}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-4 lg:max-w-4xl">
          <div className="grid gap-1.5">
            <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Unit</Label>
            <Select value={effectiveUnitId} onValueChange={setUnitId}>
              <SelectTrigger className="h-10 rounded-lg"><SelectValue placeholder="Select unit" /></SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name || u.code}{u.customer_name ? ` · ${u.customer_name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Month</Label>
            <Select value={String(monthIdx)} onValueChange={(v) => setMonthIdx(Number(v))}>
              <SelectTrigger className="h-10 rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-10 rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[year - 2, year - 1, year, year + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Resource</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee…" className="h-10 rounded-lg pl-9" />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate({ to: "/admin/deductions", search: { mode: "create" } })} className="h-10 rounded-lg">
            <Plus className="mr-1.5 h-4 w-4" /> Add Deduction
          </Button>
          <Button variant="outline" disabled={filtered.length === 0} className="h-10 rounded-lg"
            onClick={() => downloadCsv(
              `deductions-${start}-to-${end}`,
              filtered.map((r) => ({
                employee_code: r.employeeCode,
                employee: r.employee,
                unit: r.unitName,
                designation: r.designation,
                head: r.head,
                source: r.sourceLabel,
                date: r.date,
                amount: r.amount,
                status: r.status,
              })),
              [
                { key: "employee_code", header: "Emp Code" },
                { key: "employee", header: "Employee" },
                { key: "unit", header: "Unit" },
                { key: "designation", header: "Designation" },
                { key: "head", header: "Deduction Head" },
                { key: "source", header: "Source" },
                { key: "date", header: "Date / Period" },
                { key: "amount", header: "Amount" },
                { key: "status", header: "Status" },
              ],
            )}
          ><Download className="mr-1.5 h-4 w-4" /> Export</Button>
        </div>
      </div>

      {heads.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setHeadFilter("all")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              headFilter === "all" ? "border-primary bg-primary text-primary-foreground" : "border-border/60 bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            All heads
          </button>
          {byHead.map((h) => (
            <button
              key={h.name}
              type="button"
              onClick={() => setHeadFilter(headFilter === h.name ? "all" : h.name)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                headFilter === h.name ? "border-primary bg-primary text-primary-foreground" : "border-border/60 bg-background hover:bg-muted",
              )}
            >
              <span className="font-medium uppercase tracking-[0.1em]">{h.name}</span>
              <span className="font-semibold tabular-nums">{fmtINR(h.amount)}</span>
            </button>
          ))}
          <span className="inline-flex items-center gap-2 rounded-full bg-foreground px-3 py-1.5 text-xs text-background">
            <span className="font-medium uppercase tracking-[0.1em]">Total</span>
            <span className="font-semibold tabular-nums">{fmtINR(total)}</span>
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border bg-accent/10 px-5 py-2.5 text-xs">
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{filtered.length}</span>
          <span className="ml-2 uppercase tracking-[0.14em] text-muted-foreground">
            Line {filtered.length === 1 ? "item" : "items"} · {start} → {end}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Designation</th>
                <th className="px-5 py-3">Deduction Head</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Date / Period</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.key} className="hover:bg-secondary/30">
                  <td className="px-5 py-3">
                    <div className="font-medium">{r.employee}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{r.employeeCode}</div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{r.designation}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                      {r.head}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn(
                      "rounded-md px-2 py-0.5 text-[11px] font-semibold",
                      r.source === "contract"
                        ? "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300"
                        : "bg-secondary text-muted-foreground",
                    )}>{r.sourceLabel}</span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{r.date}</td>
                  <td className={cn("px-5 py-3 text-right tabular-nums", r.amount < 0 && "font-semibold text-destructive")}>
                    {fmtINR(r.amount)}
                  </td>
                  <td className="px-5 py-3">
                    <span className={
                      r.status === "active" ? "rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                      : r.status === "paused" ? "rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                      : r.status === "completed" ? "rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800"
                      : "rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                    }>{r.status}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {r.record ? (
                      <div className="inline-flex gap-1">
                        <Link to="/admin/deductions" search={{ mode: "edit", id: r.record.id }}>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0"><Edit2 className="h-4 w-4" /></Button>
                        </Link>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={() => setDeleting(r.record!)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Auto</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    {liveQ.isLoading || recordedQ.isLoading ? "Computing deductions…" : "No deductions for this unit and period."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this deduction?</AlertDialogTitle>
            <AlertDialogDescription>{deleting?.deduction_name}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try { await deleteMut.mutateAsync(deleting.id); toast.success("Deleted"); setDeleting(null); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
              }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


function DeductionForm() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const isEdit = search.mode === "edit" && !!search.id;

  const types = useDeductionTypes();
  const emps = useEmployees();

  const existing = useQuery({
    queryKey: ["admin", "deduction", search.id],
    enabled: isEdit,
    queryFn: async (): Promise<Deduction | null> => {
      const { data, error } = await supabase
        .from("deductions" as never)
        .select("id,candidate_id,deduction_type_id,deduction_date,deduction_name,calculation_type,amount,installments,description,status,min_duty,max_duty,entry_mode,days,per_day_amount,include_in_total_days,affects_days_for,emi_group_id,emi_index,emi_total")
        .eq("id", search.id!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown) as Deduction | null;
    },
  });

  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const [typeId, setTypeId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [calc, setCalc] = useState<CalcType>("lumpsum");
  const [entryMode, setEntryMode] = useState<EntryMode>("lumpsum");
  const [days, setDays] = useState<string>("");
  const [perDayAmount, setPerDayAmount] = useState<string>("");
  const [includeInTotalDays, setIncludeInTotalDays] = useState(false);
  const [affectsDaysFor, setAffectsDaysFor] = useState<DayBucket[]>(["present"]);
  const [amount, setAmount] = useState<string>("");
  const [installments, setInstallments] = useState<string>("1");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("active");
  const [minDuty, setMinDuty] = useState<string>("0");
  const [maxDuty, setMaxDuty] = useState<string>("0");
  const [step, setStep] = useState<"info" | "constraints">("info");
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  if (isEdit && existing.data && !hydrated) {
    const d = existing.data;
    setCandidateIds([d.candidate_id]);
    setTypeId(d.deduction_type_id);
    setDate(d.deduction_date);
    setCalc(d.calculation_type === "emi" ? "emi" : "lumpsum");
    const emiTotal = d.calculation_type === "emi" ? Math.max(1, d.emi_total ?? 1) : 1;
    setAmount(String(d.calculation_type === "emi" ? Math.round(d.amount * emiTotal * 100) / 100 : d.amount));
    setInstallments(String(d.calculation_type === "emi" ? emiTotal : d.installments));
    setDescription(d.description ?? "");
    setStatus(d.status);
    setMinDuty(String(d.min_duty ?? 0));
    setMaxDuty(String(d.max_duty ?? 0));
    setEntryMode((d.entry_mode ?? "lumpsum") as EntryMode);
    setDays(d.days != null ? String(d.days) : "");
    setPerDayAmount(d.per_day_amount != null ? String(d.per_day_amount) : "");
    setIncludeInTotalDays(Boolean(d.include_in_total_days));
    setAffectsDaysFor(Array.isArray(d.affects_days_for) && d.affects_days_for.length > 0 ? d.affects_days_for : ["present"]);
    setHydrated(true);
  }

  const firstEmp = useMemo(() => (emps.data ?? []).find((e) => e.id === candidateIds[0]), [emps.data, candidateIds]);
  const type = useMemo(() => (types.data ?? []).find((t) => t.id === typeId), [types.data, typeId]);

  const computedAmount = useMemo(() => {
    if (entryMode === "days_x_per_day") {
      return Math.round((Number(days) || 0) * (Number(perDayAmount) || 0) * 100) / 100;
    }
    return Number(amount) || 0;
  }, [entryMode, days, perDayAmount, amount]);

  const toggleBucket = (b: DayBucket) =>
    setAffectsDaysFor((prev) => prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]);

  // Auto-generated deduction name: "{emp_code} - {type} - {date}"
  const autoName = useMemo(() => {
    if (candidateIds.length > 1) {
      const typePart = type?.name || "Deduction";
      return `Multiple employees - ${typePart} - ${date}`;
    }
    const codePart = firstEmp?.employee_code || firstEmp?.full_name || "EMP";
    const typePart = type?.name || "Deduction";
    return `${codePart} - ${typePart} - ${date}`;
  }, [firstEmp, type, date, candidateIds.length]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (candidateIds.length === 0) throw new Error("Select at least one employee");
      if (!typeId) throw new Error("Select a deduction type");
      const amt = computedAmount;
      if (!Number.isFinite(amt) || amt < 0) throw new Error("Enter a valid amount");
      const isEmi = entryMode === "lumpsum" && calc === "emi";
      const inst = Math.max(1, parseInt(installments, 10) || 1);
      const typePart = type?.name || "Deduction";
      const extras = {
        entry_mode: entryMode,
        days: entryMode === "days_x_per_day" ? (Number(days) || 0) : null,
        per_day_amount: entryMode === "days_x_per_day" ? (Number(perDayAmount) || 0) : null,
        include_in_total_days: entryMode === "days_x_per_day" ? includeInTotalDays : false,
        affects_days_for: entryMode === "days_x_per_day" && includeInTotalDays ? affectsDaysFor : [],
      };
      const base = {
        deduction_type_id: typeId,
        description: description.trim(),
        status,
        min_duty: Math.max(0, Number(minDuty) || 0),
        max_duty: Math.max(0, Number(maxDuty) || 0),
        ...extras,
      };

      if (isEdit && search.id) {
        if (isEmi && inst > 1) {
          const groupId = existing.data?.emi_group_id ?? crypto.randomUUID();
          // Remove previously generated sibling instalments (keep the row being edited)
          const { error: delErr } = await supabase
            .from("deductions" as never)
            .delete()
            .eq("emi_group_id", groupId)
            .neq("id", search.id);
          if (delErr) throw delErr;

          const parts = splitEmi(amt, inst);
          const codePart = firstEmp?.employee_code || firstEmp?.full_name || "EMP";
          const { error } = await supabase
            .from("deductions" as never)
            .update({
              ...base,
              candidate_id: candidateIds[0],
              deduction_date: date,
              deduction_name: `${codePart} - ${typePart} - ${date} (EMI 1/${inst})`,
              calculation_type: "emi",
              amount: parts[0],
              computed_amount: parts[0],
              installments: 1,
              emi_group_id: groupId,
              emi_index: 1,
              emi_total: inst,
            } as never)
            .eq("id", search.id);
          if (error) throw error;

          const rest = parts.slice(1).map((p, i) => {
            const d = addMonths(date, i + 1);
            return {
              ...base,
              candidate_id: candidateIds[0],
              deduction_date: d,
              deduction_name: `${codePart} - ${typePart} - ${d} (EMI ${i + 2}/${inst})`,
              calculation_type: "emi",
              amount: p,
              computed_amount: p,
              installments: 1,
              emi_group_id: groupId,
              emi_index: i + 2,
              emi_total: inst,
            };
          });
          if (rest.length) {
            const { error: insErr } = await supabase.from("deductions" as never).insert(rest as never);
            if (insErr) throw insErr;
          }
          void logActivity({ module: "Deductions", action: "update", entityType: "deductions", entityId: search.id, entityLabel: `${autoName} — EMI ×${inst}` });
        } else {
          const payload = {
            ...base,
            candidate_id: candidateIds[0],
            deduction_date: date,
            deduction_name: autoName,
            calculation_type: "lumpsum",
            amount: amt,
            computed_amount: amt,
            installments: 1,
            emi_group_id: null,
            emi_index: null,
            emi_total: null,
          };
          const { error } = await supabase.from("deductions" as never).update(payload as never).eq("id", search.id);
          if (error) throw error;
          void logActivity({ module: "Deductions", action: "update", entityType: "deductions", entityId: search.id, entityLabel: autoName });
        }
      } else {
        const rows: Record<string, unknown>[] = [];
        for (const cid of candidateIds) {
          const e = (emps.data ?? []).find((x) => x.id === cid);
          const codePart = e?.employee_code || e?.full_name || "EMP";
          if (isEmi && inst > 1) {
            const groupId = crypto.randomUUID();
            splitEmi(amt, inst).forEach((p, i) => {
              const d = addMonths(date, i);
              rows.push({
                ...base,
                candidate_id: cid,
                deduction_date: d,
                deduction_name: `${codePart} - ${typePart} - ${d} (EMI ${i + 1}/${inst})`,
                calculation_type: "emi",
                amount: p,
                computed_amount: p,
                installments: 1,
                emi_group_id: groupId,
                emi_index: i + 1,
                emi_total: inst,
              });
            });
          } else {
            rows.push({
              ...base,
              candidate_id: cid,
              deduction_date: date,
              deduction_name: `${codePart} - ${typePart} - ${date}`,
              calculation_type: "lumpsum",
              amount: amt,
              computed_amount: amt,
              installments: 1,
            });
          }
        }
        const { error } = await supabase.from("deductions" as never).insert(rows as never);
        if (error) throw error;
        void logActivity({ module: "Deductions", action: "create", entityType: "deductions", entityLabel: `${rows.length} deduction(s)` });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_DED });
      toast.success(isEdit ? "Deduction updated" : "Deductions created");
      navigate({ to: "/admin/deductions", search: { mode: "list" } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div>
      <PageHeader
        title={isEdit ? "Edit Deduction" : "Create Deduction"}
        description="Auto-generated deduction name follows: {Employee Code} - {Type} - {Date}."
        crumbs={[{ label: "Employees", to: "/admin/employees" }, { label: "Deductions", to: "/admin/deductions" }, { label: isEdit ? "Edit" : "Create" }]}
      />
      <div className="mb-3">
        <Link to="/admin/deductions" search={{ mode: "list" }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back
        </Link>
      </div>

      {/* Tabs */}
      <div className="mb-3 flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setStep("info")}
          className={`px-3 py-2 text-sm font-medium ${step === "info" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
        >
          Deduction Information
        </button>
        <button
          type="button"
          onClick={() => { if (candidateIds.length > 0 && typeId && amount) setStep("constraints"); }}
          className={`px-3 py-2 text-sm font-medium ${step === "constraints" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
        >
          Deduction Constraints
        </button>
      </div>

      {step === "info" && (
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Deduction Information</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label>* Employee</Label>
            <EmployeeCombobox
              employees={emps.data ?? []}
              value={candidateIds}
              onChange={setCandidateIds}
              placeholder="Select employees"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>* Deduction Type</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {(types.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>* Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>* Deduction Name</Label>
            <Input value={autoName} readOnly className="bg-muted/40" />
          </div>

          <div className="grid gap-1.5 md:col-span-2 lg:col-span-4">
            <Label>* Entry Mode</Label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEntryMode("lumpsum")}
                className={cn("rounded-lg border px-3 py-1.5 text-sm", entryMode === "lumpsum" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                Lumpsum Amount
              </button>
              <button type="button" onClick={() => setEntryMode("days_x_per_day")}
                className={cn("rounded-lg border px-3 py-1.5 text-sm", entryMode === "days_x_per_day" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                Days × Per-day Amount
              </button>
            </div>
          </div>

          {entryMode === "lumpsum" ? (
            <>
              <div className="grid gap-1.5">
                <Label>* Deduction Calculation Type</Label>
                <Select value={calc} onValueChange={(v) => setCalc(v as CalcType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lumpsum">Lumpsum Amount</SelectItem>
                    <SelectItem value="emi">EMI (split into monthly instalments)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{calc === "emi" ? "* Total Amount" : "* Deduction Amount"}</Label>
                <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>{calc === "emi" ? "* Number of EMIs (months)" : "* Installments"}</Label>
                <Input type="number" min="1" step="1" value={installments} onChange={(e) => setInstallments(e.target.value)} disabled={calc !== "emi"} />
                {calc === "emi" && (
                  <p className="text-xs text-muted-foreground">
                    {fmtINR(Number(amount) || 0)} → {Math.max(1, parseInt(installments, 10) || 1)} monthly entries of{" "}
                    <span className="font-semibold">{fmtINR(Math.round(((Number(amount) || 0) / Math.max(1, parseInt(installments, 10) || 1)) * 100) / 100)}</span>, starting {date}.
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label>* Number of Days</Label>
                <Input type="number" min="0" step="0.5" value={days} onChange={(e) => setDays(e.target.value)} placeholder="e.g. 2" />
              </div>
              <div className="grid gap-1.5">
                <Label>* Amount per Day (₹)</Label>
                <Input type="number" min="0" step="0.01" value={perDayAmount} onChange={(e) => setPerDayAmount(e.target.value)} placeholder="e.g. 500" />
              </div>
              <div className="grid gap-1.5">
                <Label>Computed Amount</Label>
                <Input value={fmtINR(computedAmount)} readOnly className="bg-muted/40 font-semibold" />
              </div>
            </>
          )}

          <div className="grid gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {entryMode === "days_x_per_day" && (
            <div className="grid gap-1.5 md:col-span-2 lg:col-span-4 rounded-xl border border-dashed border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-foreground">Deduct these days from employee's total days?</Label>
                  <p className="text-xs text-muted-foreground">When ON, the days here are subtracted from T-days in payroll (e.g. unpaid leave reduces worked days).</p>
                </div>
                <Switch checked={includeInTotalDays} onCheckedChange={setIncludeInTotalDays} />
              </div>
              {includeInTotalDays && (
                <div className="mt-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Subtract days from which buckets</Label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {DAY_BUCKETS.map((b) => (
                      <button key={b.value} type="button" onClick={() => toggleBucket(b.value)}
                        className={cn("rounded-md border px-3 py-1 text-xs font-medium",
                          affectsDaysFor.includes(b.value) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-1.5 md:col-span-2 lg:col-span-4">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/admin/deductions", search: { mode: "list" } })} disabled={saving}>Cancel</Button>
          <Button type="button" disabled={candidateIds.length === 0 || !typeId || computedAmount <= 0} onClick={() => setStep("constraints")}>Next step</Button>
        </div>

      </div>
      )}

      {step === "constraints" && (
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Deduction Constraints</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Duty Information — if the employee's payroll duty count in a month is less than <strong>Min Duty</strong>, this
          deduction will be skipped and automatically carried forward to the next month. Set <strong>Max Duty</strong> to 0 for no upper cap.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>* Min Duty</Label>
            <Input type="number" min="0" step="0.01" value={minDuty} onChange={(e) => setMinDuty(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>* Max Duty</Label>
            <Input type="number" min="0" step="0.01" value={maxDuty} onChange={(e) => setMaxDuty(e.target.value)} />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setStep("info")} disabled={saving}>Previous step</Button>
          <Button type="button" disabled={saving} onClick={async () => {
            setSaving(true);
            try { await saveMut.mutateAsync(); } finally { setSaving(false); }
          }}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
      )}
    </div>
  );
}
