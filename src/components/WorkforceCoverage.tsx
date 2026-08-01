import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Search,
  Users,
  UserCheck,
  TrendingDown,
  Gauge,
  Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadCsv } from "@/lib/csv-export";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Committed workforce (client contract resources) vs actual deployed workforce
// (employees mapped to the unit). Only ACTIVE client contracts are considered.
// ---------------------------------------------------------------------------

type RoleLine = { role: string; committed: number; actual: number };

export type UnitCoverage = {
  contractId: string;
  contractCode: string;
  unitId: string;
  unitName: string;
  orgName: string;
  committed: number;
  actual: number;
  lines: RoleLine[];
};

const QK_COVERAGE = ["admin", "workforce-coverage"] as const;

/** Roles that never count as deployed site staff. */
const EXCLUDED_ROLE_KEYS = new Set([
  "field_officer",
  "hr",
  "leadership",
  "operations_manager",
  "vp_operations",
  "branch_manager",
  "inventory",
  "transport",
  "admin",
  "super_admin",
]);

async function fetchCoverage(): Promise<UnitCoverage[]> {
  const [contractsRes, desigRes, unitsRes, customersRes, candidatesRes, mapRes] =
    await Promise.all([
      supabase
        .from("client_contracts" as never)
        .select("id,contract_code,unit_id,status,record_type,approval_status")
        .eq("record_type", "client")
        .eq("status", "active"),
      supabase.from("designations" as never).select("id,name"),
      supabase.from("units" as never).select("id,name,customer_id"),
      supabase.from("customers" as never).select("id,name"),
      supabase
        .from("candidates" as never)
        .select("id,full_name,designation_id,role_key,status,non_billable,unit_id")
        .eq("status", "active"),
      supabase.from("candidate_units" as never).select("candidate_id,unit_id"),
    ]);

  const contracts = (contractsRes.data as unknown as Record<string, unknown>[]) ?? [];
  if (contracts.length === 0) return [];

  const resourcesRes = await supabase
    .from("contract_resources" as never)
    .select("contract_id,designation_id,role_key,quantity")
    .in("contract_id", contracts.map((c) => String(c.id)));

  const desigName = new Map(
    ((desigRes.data as unknown as Record<string, unknown>[]) ?? []).map((d) => [
      String(d.id),
      String(d.name ?? "—"),
    ]),
  );
  const unitById = new Map(
    ((unitsRes.data as unknown as Record<string, unknown>[]) ?? []).map((u) => [
      String(u.id),
      u,
    ]),
  );
  const custName = new Map(
    ((customersRes.data as unknown as Record<string, unknown>[]) ?? []).map((c) => [
      String(c.id),
      String(c.name ?? "—"),
    ]),
  );

  // Deployable candidates only (site staff, billable, active).
  const candidates = ((candidatesRes.data as unknown as Record<string, unknown>[]) ?? []).filter(
    (c) => !c.non_billable && !EXCLUDED_ROLE_KEYS.has(String(c.role_key ?? "")),
  );
  const candById = new Map(candidates.map((c) => [String(c.id), c]));

  // unit -> set of candidate ids (mapping table + primary unit on the record)
  const unitMembers = new Map<string, Set<string>>();
  const push = (unitId: string, candId: string) => {
    if (!unitId || !candById.has(candId)) return;
    if (!unitMembers.has(unitId)) unitMembers.set(unitId, new Set());
    unitMembers.get(unitId)!.add(candId);
  };
  for (const m of (mapRes.data as unknown as Record<string, unknown>[]) ?? []) {
    push(String(m.unit_id ?? ""), String(m.candidate_id ?? ""));
  }
  for (const c of candidates) push(String(c.unit_id ?? ""), String(c.id));

  const resourcesByContract = new Map<string, Record<string, unknown>[]>();
  for (const r of (resourcesRes.data as unknown as Record<string, unknown>[]) ?? []) {
    const key = String(r.contract_id);
    if (!resourcesByContract.has(key)) resourcesByContract.set(key, []);
    resourcesByContract.get(key)!.push(r);
  }

  return contracts
    .map((c) => {
      const unitId = String(c.unit_id ?? "");
      const unit = unitById.get(unitId);
      const orgId = unit ? String(unit.customer_id ?? "") : "";

      // Committed per role
      const committedByRole = new Map<string, number>();
      for (const r of resourcesByContract.get(String(c.id)) ?? []) {
        const label = r.designation_id
          ? (desigName.get(String(r.designation_id)) ?? "Unspecified")
          : String(r.role_key ?? "Unspecified");
        const qty = Number(r.quantity ?? 0) || 0;
        committedByRole.set(label, (committedByRole.get(label) ?? 0) + qty);
      }

      // Actual per role (designation of each mapped employee)
      const actualByRole = new Map<string, number>();
      for (const candId of unitMembers.get(unitId) ?? []) {
        const cand = candById.get(candId)!;
        const label = cand.designation_id
          ? (desigName.get(String(cand.designation_id)) ?? "Unspecified")
          : "Unspecified";
        actualByRole.set(label, (actualByRole.get(label) ?? 0) + 1);
      }

      const roles = Array.from(
        new Set([...committedByRole.keys(), ...actualByRole.keys()]),
      ).sort((a, b) => a.localeCompare(b));

      const lines: RoleLine[] = roles.map((role) => ({
        role,
        committed: committedByRole.get(role) ?? 0,
        actual: actualByRole.get(role) ?? 0,
      }));

      return {
        contractId: String(c.id),
        contractCode: String(c.contract_code ?? "—"),
        unitId,
        unitName: unit ? String(unit.name ?? "—") : "—",
        orgName: custName.get(orgId) ?? "—",
        committed: lines.reduce((s, l) => s + l.committed, 0),
        actual: lines.reduce((s, l) => s + l.actual, 0),
        lines,
      };
    })
    .sort((a, b) => a.unitName.localeCompare(b.unitName));
}

export function useWorkforceCoverage() {
  return useQuery({ queryKey: QK_COVERAGE, queryFn: fetchCoverage });
}

/**
 * Deployment shortfall tone rule (shared by dashboard + client contracts):
 *  - fully covered            → neutral / emerald
 *  - shortfall up to 5%       → orange (amber)
 *  - shortfall greater than 5% → red (destructive)
 */
export function shortfallTone(
  committed: number,
  actual: number,
): "ok" | "warning" | "destructive" {
  if (committed <= 0) return "ok";
  if (actual >= committed) return "ok";
  const deltaPct = ((committed - actual) / committed) * 100;
  return deltaPct > 5 ? "destructive" : "warning";
}

function VarianceChip({ committed, actual }: { committed: number; actual: number }) {
  const diff = actual - committed;
  const t = shortfallTone(committed, actual);
  const tone =
    diff > 0
      ? "bg-amber-500/10 text-amber-600 border-amber-500/25"
      : t === "destructive"
        ? "bg-destructive/10 text-destructive border-destructive/25"
        : t === "warning"
          ? "bg-amber-500/10 text-amber-600 border-amber-500/25"
          : "bg-emerald-500/10 text-emerald-600 border-emerald-500/25";
  return (
    <span
      className={cn(
        "inline-flex min-w-[52px] items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        tone,
      )}
    >
      {diff > 0 ? `+${diff}` : diff}
    </span>
  );
}

function Tile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  tone?: "accent" | "warning" | "destructive";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3",
        tone === "warning"
          ? "border-amber-500/40 bg-amber-500/10"
          : tone === "destructive"
            ? "border-destructive/40 bg-destructive/10"
            : "border-border bg-background/60",
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            tone === "accent" && "text-primary",
            tone === "warning" && "text-amber-500",
            tone === "destructive" && "text-destructive",
          )}
        />
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "warning" && "text-amber-600",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}


export function WorkforceCoverageCard() {
  const { data: rows = [], isLoading } = useWorkforceCoverage();
  const [open, setOpen] = useState(false);

  const totals = useMemo(() => {
    const committed = rows.reduce((s, r) => s + r.committed, 0);
    const actual = rows.reduce((s, r) => s + r.actual, 0);
    const shortUnits = rows.filter((r) => r.actual < r.committed).length;
    return {
      committed,
      actual,
      gap: actual - committed,
      shortUnits,
      coverage: committed > 0 ? Math.round((actual / committed) * 100) : 0,
      tone: shortfallTone(committed, actual),
    };
  }, [rows]);


  return (
    <div className="mb-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Deployment
          </div>
          <h2 className="text-base font-semibold">Committed vs Actual Workforce</h2>
          <p className="text-xs text-muted-foreground">
            Contracted headcount across active client contracts against employees
            actually mapped to those units.
          </p>
        </div>
        <Button
          variant="outline"
          className="h-9 rounded-lg"
          onClick={() => setOpen(true)}
          disabled={isLoading}
        >
          View full deployment charter
        </Button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Committed" value={totals.committed} icon={Users} tone="accent" />
        <Tile
          label="Actual deployed"
          value={totals.actual}
          icon={UserCheck}
          tone={totals.tone === "ok" ? undefined : totals.tone}
        />
        <Tile
          label="Variance"
          value={totals.gap > 0 ? `+${totals.gap}` : totals.gap}
          icon={TrendingDown}
          tone={totals.gap > 0 ? "warning" : totals.tone === "ok" ? undefined : totals.tone}
        />
        <Tile
          label="Coverage"
          value={`${totals.coverage}%`}
          icon={Gauge}
          tone={totals.tone === "ok" ? undefined : totals.tone}
        />
      </div>

      {totals.shortUnits > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-semibold text-destructive">{totals.shortUnits}</span>{" "}
          unit(s) currently under-deployed against contract.
        </p>
      )}

      <DeploymentCharterDialog open={open} onOpenChange={setOpen} rows={rows} />
    </div>
  );
}

function DeploymentCharterDialog({
  open,
  onOpenChange,
  rows,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rows: UnitCoverage[];
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.unitName, r.orgName, r.contractCode].some((v) => v.toLowerCase().includes(q)),
    );
  }, [query, rows]);

  const totals = useMemo(
    () => ({
      committed: filtered.reduce((s, r) => s + r.committed, 0),
      actual: filtered.reduce((s, r) => s + r.actual, 0),
    }),
    [filtered],
  );

  const exportCsv = () => {
    const data = filtered.flatMap((r) =>
      r.lines.map((l) => ({
        Contract: r.contractCode,
        Status: "Active",
        Organisation: r.orgName,
        Unit: r.unitName,
        Role: l.role,
        Committed: l.committed,
        Actual: l.actual,
        Variance: l.actual - l.committed,
      })),
    );
    downloadCsv("deployment-charter", data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>Deployment charter</DialogTitle>
          <DialogDescription>
            Active client contracts only — committed staff per contract against
            employees mapped to the unit.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by unit, organisation or contract ID…"
              className="h-9 rounded-lg pl-9"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">
              {totals.committed}
            </span>{" "}
            committed ·{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {totals.actual}
            </span>{" "}
            deployed
          </div>
          <Button variant="outline" className="h-9 rounded-lg" onClick={exportCsv}>
            <Download className="mr-1.5 h-4 w-4" />
            Export
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 pb-5 pt-3">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No active contracts match this search.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => {
                const isOpen = !!expanded[r.contractId];
                return (
                  <div
                    key={r.contractId}
                    className="overflow-hidden rounded-xl border border-border bg-background/50"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((p) => ({ ...p, [r.contractId]: !p[r.contractId] }))
                      }
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          isOpen && "rotate-180",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold">
                            {r.unitName}
                          </span>
                          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                            Active
                          </span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {r.orgName} · {r.contractCode}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-sm tabular-nums">
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Committed
                          </div>
                          <div className="font-semibold">{r.committed}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Actual
                          </div>
                          <div
                            className={cn(
                              "font-semibold",
                              shortfallTone(r.committed, r.actual) === "destructive" && "text-destructive",
                              shortfallTone(r.committed, r.actual) === "warning" && "text-amber-600",
                            )}
                          >
                            {r.actual}
                          </div>

                        </div>
                        <VarianceChip committed={r.committed} actual={r.actual} />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-border bg-muted/30 px-3 py-2">
                        {r.lines.length === 0 ? (
                          <p className="py-2 text-xs text-muted-foreground">
                            No staffing lines on this contract.
                          </p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                <th className="py-1 text-left font-medium">Role</th>
                                <th className="py-1 text-right font-medium">Committed</th>
                                <th className="py-1 text-right font-medium">Actual</th>
                                <th className="py-1 text-right font-medium">Variance</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.lines.map((l) => (
                                <tr key={l.role} className="border-t border-border/60">
                                  <td className="py-1.5 pr-2">{l.role}</td>
                                  <td className="py-1.5 text-right tabular-nums">
                                    {l.committed}
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums">
                                    {l.actual}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    <VarianceChip
                                      committed={l.committed}
                                      actual={l.actual}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
