import { createFileRoute } from "@tanstack/react-router";
import { type ComponentType, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, MapPinned, Users, X } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { HeroTile } from "@/components/HeroTile";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListSkeleton } from "@/components/Skeletons";
import { FinanceCharter } from "@/components/FinanceCharter";
import { CHARTER_UNITS_QK, fetchCharterUnits } from "@/lib/charter-units";
import { useFieldOfficerUnitScope } from "@/lib/use-fo-unit-scope";

export const Route = createFileRoute("/admin/invoice/")({
  component: InvoiceUnitsPage,
});

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function InvoiceUnitsPage() {
  const now = new Date();
  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [monthIdx, setMonthIdx] = useState<number>(now.getMonth());
  const [year, setYear] = useState<number>(now.getFullYear());

  const { data, isLoading, error } = useQuery({
    queryKey: CHARTER_UNITS_QK,
    queryFn: fetchCharterUnits,
  });

  const foScope = useFieldOfficerUnitScope();
  const rawUnits = data?.units ?? [];
  const units = useMemo(
    () => (foScope.isFieldOfficer ? rawUnits.filter((u) => foScope.unitIds.has(u.id)) : rawUnits),
    [rawUnits, foScope.isFieldOfficer, foScope.unitIds],
  );
  const organizations = useMemo(() => {
    const all = data?.organizations ?? [];
    if (!foScope.isFieldOfficer) return all;
    const allowed = new Set(units.map((u) => u.customer_id));
    return all.filter((o) => allowed.has(o.id));
  }, [data?.organizations, foScope.isFieldOfficer, units]);

  const summary = {
    organizations: organizations.length,
    units: units.length,
    activeEmployees: units.reduce((s, r) => s + r.active_employee_count, 0),
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return units.filter((u) => {
      if (orgFilter !== "all" && (u.customer_id || u.customer_name) !== orgFilter) return false;
      if (unitFilter !== "all" && u.id !== unitFilter) return false;
      if (term) {
        const hay = [u.customer_name, u.customer_code, u.name, u.code, u.location, ...u.contract_codes]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [q, orgFilter, unitFilter, units]);

  const anyFilter = orgFilter !== "all" || unitFilter !== "all" || q.trim().length > 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Invoice"
        description="Contracted value against month-till-date billing, unit by unit."
        crumbs={[{ label: "Invoice" }]}
      />

      <HeroTile
        eyebrow="Invoice month"
        title={MONTH_NAMES[monthIdx]}
        subtitle={String(year)}
        description="Contracted client value, the invoice value earned till date from actual attendance, and the payroll behind it."
        right={
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border/70 bg-background/60 p-1.5 backdrop-blur">
            <Select value={String(monthIdx)} onValueChange={(v) => setMonthIdx(Number(v))}>
              <SelectTrigger className="h-8 w-[130px] rounded-xl border-0 bg-transparent shadow-none hover:bg-muted focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((m, i) => (
                  <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="h-5 w-px bg-border/70" />
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-[92px] rounded-xl border-0 bg-transparent shadow-none hover:bg-muted focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[year - 2, year - 1, year, year + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SummaryPill icon={Building2} label="Organizations" value={summary.organizations} />
        <SummaryPill icon={MapPinned} label="Units" value={summary.units} />
        <SummaryPill icon={Users} label="Active employees" value={summary.activeEmployees} />
      </div>

      <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm shadow-stone-200/40 dark:shadow-black/20">
        <div className="space-y-3 border-b border-border/60 px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-base font-bold tracking-tight text-foreground sm:text-lg">
              Invoice charter
            </h2>
            <p className="text-[12px] leading-relaxed text-muted-foreground sm:text-sm">
              Contracted value vs month-till-date invoice and payroll. Open any unit for the full invoice register.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FilterSelect
              label="Client"
              value={orgFilter}
              onChange={setOrgFilter}
              options={organizations.map((o) => ({
                value: o.id,
                label: o.code ? `${o.code} · ${o.name}` : o.name,
              }))}
              allLabel={`All clients (${organizations.length})`}
            />
            <FilterSelect
              label="Unit"
              value={unitFilter}
              onChange={setUnitFilter}
              options={units.map((u) => ({
                value: u.id,
                label: `${u.name || u.code}${u.customer_name ? ` · ${u.customer_name}` : ""}`,
              }))}
              allLabel={`All units (${units.length})`}
            />
          </div>

          {anyFilter && (
            <div className="flex items-center justify-between rounded-xl bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              <span>
                Showing <span className="font-bold text-foreground">{filtered.length}</span> of {units.length} units
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => {
                  setQ("");
                  setOrgFilter("all");
                  setUnitFilter("all");
                }}
              >
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            </div>
          )}
        </div>

        <div className="px-4 py-4 sm:px-5 sm:py-5">
          {isLoading ? (
            <ListSkeleton rows={5} />
          ) : error ? (
            <div className="px-5 py-12 text-center text-sm text-destructive">
              {error instanceof Error ? error.message : "Could not load invoice units right now."}
            </div>
          ) : (
            <FinanceCharter
              mode="invoice"
              units={filtered}
              monthIdx={monthIdx}
              year={year}
              query={q}
              onQueryChange={setQ}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 rounded-xl border-border/60 bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[320px]">
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SummaryPill({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 shadow-sm">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
    </div>
  );
}
