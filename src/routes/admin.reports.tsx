import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  Download,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { MiniStat } from "@/components/MiniStat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadCsv } from "@/lib/csv-export";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/reports")({
  component: ReportsHubPage,
  head: () => ({
    meta: [
      { title: "Reports Hub — Radiant Guard" },
      {
        name: "description",
        content:
          "Leadership analytics: headcount mix, joiners versus leavers, attrition and unit-level deployment coverage with one-click exports.",
      },
      { property: "og:title", content: "Reports Hub" },
      {
        property: "og:description",
        content: "Workforce, attrition and deployment analytics for leadership in one hub.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type CandidateRow = {
  id: string;
  status: string | null;
  unit_id: string | null;
  non_billable: boolean | null;
  approved_at: string | null;
  offboarded_at: string | null;
  role_key: string | null;
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function lastMonths(n: number) {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(monthKey(x));
  }
  return out;
}

function useReportData() {
  return useQuery({
    queryKey: ["reports-hub"],
    queryFn: async () => {
      const [cands, units, customers, links, resources, contracts] = await Promise.all([
        supabase
          .from("candidates")
          .select("id, status, unit_id, non_billable, approved_at, offboarded_at, role_key"),
        supabase.from("units").select("id, name, code, customer_id, status"),
        supabase.from("customers").select("id, name, short_name"),
        supabase.from("candidate_units").select("candidate_id, unit_id"),
        supabase.from("contract_resources").select("contract_id, quantity, role_key"),
        supabase.from("client_contracts").select("id, unit_id, status, record_type"),
      ]);
      return {
        candidates: (cands.data ?? []) as CandidateRow[],
        units: units.data ?? [],
        customers: customers.data ?? [],
        links: links.data ?? [],
        resources: resources.data ?? [],
        contracts: contracts.data ?? [],
      };
    },
  });
}

type TabKey = "workforce" | "attrition" | "deployment";

const TABS: { key: TabKey; label: string }[] = [
  { key: "workforce", label: "Workforce" },
  { key: "attrition", label: "Joiners & attrition" },
  { key: "deployment", label: "Deployment coverage" },
];

function ReportsHubPage() {
  const { data, isLoading } = useReportData();
  const [tab, setTab] = useState<TabKey>("workforce");
  const [q, setQ] = useState("");

  const candidates = data?.candidates ?? [];

  const active = candidates.filter((c) => (c.status ?? "").toLowerCase() === "active");
  const billable = active.filter((c) => !c.non_billable);
  const nonBillable = active.filter((c) => c.non_billable);
  const pipeline = candidates.filter((c) =>
    ["pending", "submitted", "approved", "draft"].includes((c.status ?? "").toLowerCase()),
  );

  const months = useMemo(() => lastMonths(6), []);
  const trend = useMemo(() => {
    const joiners = new Map<string, number>();
    const leavers = new Map<string, number>();
    for (const c of candidates) {
      if (c.approved_at) {
        const k = monthKey(new Date(c.approved_at));
        joiners.set(k, (joiners.get(k) ?? 0) + 1);
      }
      if (c.offboarded_at) {
        const k = monthKey(new Date(c.offboarded_at));
        leavers.set(k, (leavers.get(k) ?? 0) + 1);
      }
    }
    return months.map((m) => ({
      month: monthLabel(m),
      Joiners: joiners.get(m) ?? 0,
      Leavers: leavers.get(m) ?? 0,
    }));
  }, [candidates, months]);

  const totalJoiners = trend.reduce((s, r) => s + r.Joiners, 0);
  const totalLeavers = trend.reduce((s, r) => s + r.Leavers, 0);
  const attritionRate = active.length ? Math.round((totalLeavers / active.length) * 1000) / 10 : 0;

  const deployment = useMemo(() => {
    if (!data) return [];
    const custById = new Map(data.customers.map((c) => [c.id, c]));
    const committedByUnit = new Map<string, number>();
    for (const ct of data.contracts) {
      if (!ct.unit_id) continue;
      if ((ct.status ?? "").toLowerCase() !== "active") continue;
      const qty = data.resources
        .filter((r) => r.contract_id === ct.id)
        .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      committedByUnit.set(ct.unit_id, (committedByUnit.get(ct.unit_id) ?? 0) + qty);
    }
    const activeIds = new Set(active.map((c) => c.id));
    const actualByUnit = new Map<string, Set<string>>();
    for (const c of active) {
      if (!c.unit_id) continue;
      if (!actualByUnit.has(c.unit_id)) actualByUnit.set(c.unit_id, new Set());
      actualByUnit.get(c.unit_id)!.add(c.id);
    }
    for (const l of data.links) {
      if (!activeIds.has(l.candidate_id)) continue;
      if (!actualByUnit.has(l.unit_id)) actualByUnit.set(l.unit_id, new Set());
      actualByUnit.get(l.unit_id)!.add(l.candidate_id);
    }
    return data.units
      .filter((u) => (u.status ?? "active").toLowerCase() === "active")
      .map((u) => {
        const committed = committedByUnit.get(u.id) ?? 0;
        const actual = actualByUnit.get(u.id)?.size ?? 0;
        return {
          id: u.id,
          unit: u.name || u.code,
          code: u.code,
          client: custById.get(u.customer_id ?? "")?.name ?? "—",
          committed,
          actual,
          variance: actual - committed,
          coverage: committed ? Math.round((actual / committed) * 100) : actual ? 100 : 0,
        };
      })
      .sort((a, b) => a.coverage - b.coverage);
  }, [data, active]);

  const filteredDeployment = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return deployment;
    return deployment.filter((d) => `${d.unit} ${d.code} ${d.client}`.toLowerCase().includes(needle));
  }, [deployment, q]);

  const underDeployed = deployment.filter((d) => d.committed > 0 && d.actual < d.committed).length;

  function exportCurrent() {
    if (tab === "deployment") {
      downloadCsv(
        "deployment-coverage",
        filteredDeployment.map((d) => ({
          client: d.client,
          unit: d.unit,
          code: d.code,
          committed: d.committed,
          actual: d.actual,
          variance: d.variance,
          coverage: `${d.coverage}%`,
        })),
      );
      return;
    }
    if (tab === "attrition") {
      downloadCsv("joiners-attrition", trend);
      return;
    }
    downloadCsv("workforce-summary", [
      { metric: "Active employees", value: active.length },
      { metric: "Billable", value: billable.length },
      { metric: "Non-billable", value: nonBillable.length },
      { metric: "In pipeline", value: pipeline.length },
      { metric: "Joiners (6 mo)", value: totalJoiners },
      { metric: "Leavers (6 mo)", value: totalLeavers },
      { metric: "Attrition %", value: attritionRate },
    ]);
  }

  return (
    <div className="page-shell">
      <PageHeader
        icon={BarChart3}
        eyebrow="Analytics"
        title="Reports Hub"
        description="One place for workforce, attrition and deployment answers — filter, read, export."
        crumbs={[{ label: "Reports" }]}
        actions={
          <Button variant="outline" size="sm" onClick={exportCurrent}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>
        }
        kpis={
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="Active employees" value={active.length} icon={Users} />
            <MiniStat label="Billable" value={billable.length} subtle={`${nonBillable.length} non-billable`} />
            <MiniStat label="Attrition (6 mo)" value={`${attritionRate}%`} tone="warning" icon={TrendingDown} />
            <MiniStat label="Under-deployed units" value={underDeployed} tone="destructive" icon={Building2} />
          </div>
        }
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors",
                tab === t.key
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-border/60 bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "deployment" && (
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search unit or client…"
            className="h-9 w-full text-xs sm:w-64"
          />
        )}
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-xs text-muted-foreground">
          Crunching numbers…
        </div>
      ) : tab === "workforce" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <p className="mb-3 text-[13px] font-semibold">Headcount mix</p>
            <ul className="space-y-2">
              {[
                { label: "Billable deployed", value: billable.length },
                { label: "Non-billable / office", value: nonBillable.length },
                { label: "Pipeline candidates", value: pipeline.length },
              ].map((r) => {
                const total = Math.max(1, billable.length + nonBillable.length + pipeline.length);
                return (
                  <li key={r.label}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className="font-semibold tabular-nums">{r.value}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.round((r.value / total) * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <p className="mb-3 text-[13px] font-semibold">Where the gaps are</p>
            <ul className="divide-y divide-border/60">
              {deployment.filter((d) => d.committed > 0 && d.variance < 0).slice(0, 6).map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2 text-[12px]">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{d.unit}</span>
                    <span className="text-muted-foreground"> · {d.client}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-destructive">{d.variance}</span>
                </li>
              ))}
              {deployment.filter((d) => d.committed > 0 && d.variance < 0).length === 0 && (
                <li className="py-3 text-[12px] text-muted-foreground">Every unit is fully deployed.</li>
              )}
            </ul>
            <Link
              to="/admin/attendance"
              className="mt-3 inline-block text-[11px] font-semibold text-accent hover:underline"
            >
              Open attendance charter →
            </Link>
          </div>
        </div>
      ) : tab === "attrition" ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <p className="text-[13px] font-semibold">Joiners vs leavers · last 6 months</p>
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
              <TrendingUp className="h-3.5 w-3.5" /> {totalJoiners} joined
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
              <TrendingDown className="h-3.5 w-3.5" /> {totalLeavers} left
            </span>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Joiners" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Leavers" fill="hsl(var(--destructive))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12px]">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Client</th>
                  <th className="px-3 py-2 text-left font-semibold">Unit</th>
                  <th className="px-3 py-2 text-right font-semibold">Committed</th>
                  <th className="px-3 py-2 text-right font-semibold">Actual</th>
                  <th className="px-3 py-2 text-right font-semibold">Variance</th>
                  <th className="px-3 py-2 text-right font-semibold">Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredDeployment.map((d) => (
                  <tr key={d.id}>
                    <td className="px-3 py-2 text-muted-foreground">{d.client}</td>
                    <td className="px-3 py-2 font-medium">{d.unit}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.committed}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.actual}</td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-semibold tabular-nums",
                        d.variance < 0 ? "text-destructive" : d.variance > 0 ? "text-emerald-600" : "",
                      )}
                    >
                      {d.variance > 0 ? `+${d.variance}` : d.variance}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{d.coverage}%</td>
                  </tr>
                ))}
                {filteredDeployment.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      No units match this search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
