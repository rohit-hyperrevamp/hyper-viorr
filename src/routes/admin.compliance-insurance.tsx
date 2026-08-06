import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Download, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { MonthYearPicker } from "@/components/MonthYearPicker";
import {
  INSURANCE_HEADS,
  matchesHead,
  monthRange,
  type InsuranceHeadKey,
} from "@/components/InsuranceHeadTiles";

export const Route = createFileRoute("/admin/compliance-insurance")({
  component: InsuranceRegisterPage,
  validateSearch: (search: Record<string, unknown>): { ym?: string; head?: string } => ({
    ym: typeof search.ym === "string" ? search.ym : undefined,
    head: typeof search.head === "string" ? search.head : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Insurance Register — Radiant Guard" },
      {
        name: "description",
        content:
          "GPAIP, ESIC and Workmen's Compensation recovered this month, employee by employee, grouped by the unit that carries the cover.",
      },
      { property: "og:title", content: "Insurance Register" },
      {
        property: "og:description",
        content: "Month-wise insurance register recoveries with the employees covered.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const inr = (n: number) =>
  "₹" + Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

type Row = {
  id: string;
  candidateId: string;
  name: string;
  code: string;
  unitId: string | null;
  unit: string;
  joining: string | null;
  amount: number;
  date: string;
  note: string;
};

type Policy = {
  id: string;
  name: string;
  provider: string | null;
  policy_number: string | null;
  end_date: string | null;
  sum_assured: number | null;
  is_active: boolean | null;
};

function useInsuranceRegister(ym: string, head: InsuranceHeadKey) {
  return useQuery({
    queryKey: ["insurance-register", ym, head],
    staleTime: 60_000,
    queryFn: async (): Promise<{ rows: Row[]; policies: Policy[]; units: Array<{ id: string; name: string; enabled: boolean; amount: number }> }> => {
      const { from, to } = monthRange(ym);
      const [{ data: deds, error }, { data: contribs }, { data: pol }] = await Promise.all([
        supabase
          .from("deductions")
          .select("id, candidate_id, amount, computed_amount, deduction_name, deduction_date, status")
          .gte("deduction_date", from)
          .lte("deduction_date", to),
        supabase
          .from("employer_contributions")
          .select("id, candidate_id, amount, contribution_name, contribution_date")
          .gte("contribution_date", from)
          .lte("contribution_date", to),
        supabase.from("policies").select("*"),
      ]);
      if (error) throw error;

      const raw: Array<{ id: string; candidate_id: string; amount: number; date: string; note: string }> = [];
      for (const d of deds ?? []) {
        if (!matchesHead(d.deduction_name, head) || !d.candidate_id) continue;
        if ((d.status ?? "active") === "cancelled") continue;
        raw.push({
          id: d.id,
          candidate_id: d.candidate_id,
          amount: Number(d.computed_amount ?? d.amount ?? 0),
          date: d.deduction_date,
          note: d.deduction_name ?? "",
        });
      }
      for (const c of contribs ?? []) {
        if (!matchesHead(c.contribution_name, head) || !c.candidate_id) continue;
        raw.push({
          id: c.id,
          candidate_id: c.candidate_id,
          amount: Number(c.amount ?? 0),
          date: c.contribution_date,
          note: c.contribution_name ?? "",
        });
      }

      const policies = ((pol ?? []) as unknown as Policy[]).filter((p) => {
        const n = `${p.name ?? ""}`.toLowerCase();
        return INSURANCE_HEADS.find((h) => h.key === head)!.policyMatch.some((m) => n.includes(m));
      });

      const { data: unitRows } = await supabase
        .from("units")
        .select("id, name, gpaip_enabled, gpaip_amount");
      const units = (unitRows ?? []).map((u) => ({
        id: u.id,
        name: u.name as string,
        enabled: Boolean((u as { gpaip_enabled?: boolean }).gpaip_enabled),
        amount: Number((u as { gpaip_amount?: number }).gpaip_amount ?? 0),
      }));

      if (raw.length === 0) return { rows: [], policies, units };

      const ids = Array.from(new Set(raw.map((r) => r.candidate_id)));
      const { data: cands } = await supabase
        .from("candidates")
        .select("id, full_name, employee_code, candidate_code, unit_id, preferred_joining_date")
        .in("id", ids);
      const candMap = new Map((cands ?? []).map((c) => [c.id, c]));
      const unitMap = new Map(units.map((u) => [u.id, u]));

      const rows: Row[] = raw.map((r) => {
        const c = candMap.get(r.candidate_id);
        const u = c?.unit_id ? unitMap.get(c.unit_id) : undefined;
        return {
          id: r.id,
          candidateId: r.candidate_id,
          name: c?.full_name ?? "—",
          code: c?.employee_code ?? c?.candidate_code ?? "—",
          unitId: c?.unit_id ?? null,
          unit: u?.name ?? "Unassigned",
          joining: (c?.preferred_joining_date as string | null) ?? null,
          amount: r.amount,
          date: r.date,
          note: r.note,
        };
      });
      rows.sort((a, b) => a.unit.localeCompare(b.unit) || a.name.localeCompare(b.name));
      return { rows, policies, units };
    },
  });
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-3 backdrop-blur">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function InsuranceRegisterPage() {
  const now = new Date();
  const { ym: ymParam, head: headParam } = Route.useSearch();
  const ym = ymParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const head: InsuranceHeadKey =
    headParam === "wc" ? "wc" : headParam === "esic" ? "esic" : "gpaip";
  const meta = INSURANCE_HEADS.find((h) => h.key === head)!;
  const navigate = useNavigate({ from: "/admin/compliance-insurance" });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useInsuranceRegister(ym, head);
  const all = data?.rows ?? [];

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((r) => `${r.name} ${r.code} ${r.unit}`.toLowerCase().includes(needle));
  }, [all, q]);

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const people = new Set(rows.map((r) => r.candidateId)).size;

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const list = map.get(r.unit) ?? [];
      list.push(r);
      map.set(r.unit, list);
    }
    return Array.from(map.entries())
      .map(([unit, members]) => ({
        unit,
        members,
        total: members.reduce((s, r) => s + r.amount, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  const monthLabel = new Date(ym + "-01T00:00:00").toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const enabledUnits = (data?.units ?? []).filter((u) => u.enabled);

  return (
    <div className="page-shell">
      <PageHeader
        icon={meta.icon}
        eyebrow="Governance"
        title={`${meta.label} Register`}
        description={`${meta.full} recovered in the month, employee by employee, grouped by the unit that carries the cover.`}
        crumbs={[{ label: "Compliance", to: "/admin/compliance" }, { label: `${meta.label} Register` }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <MonthYearPicker value={ym} onChange={(next) => navigate({ search: { ym: next, head } })} />
            {head === "gpaip" ? (
              <Button size="sm" asChild>
                <Link to="/admin/compliance-gpaip-register" search={{ ym, view: "staff" }}>
                  View register
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/compliance">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Compliance
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  `${head}-register-${ym}`,
                  rows.map((r) => ({
                    code: r.code,
                    name: r.name,
                    unit: r.unit,
                    joining: r.joining ?? "",
                    amount: r.amount,
                    date: r.date,
                    note: r.note,
                  })),
                  [
                    { key: "code", header: "Employee code" },
                    { key: "name", header: "Name" },
                    { key: "unit", header: "Unit" },
                    { key: "joining", header: "Date of joining" },
                    { key: "amount", header: `${meta.label} amount` },
                    { key: "date", header: "Recovered on" },
                    { key: "note", header: "Line" },
                  ],
                )
              }
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export
            </Button>
          </div>
        }
      />

      {/* Search */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search employee or unit…"
            className="h-9 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Totals */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label={`${meta.label} recovered · ${monthLabel}`} value={inr(total)} sub={`${people} employees`} />
        <StatCard label="Units covered" value={String(groups.length)} />
        <StatCard
          label="Units with cover on"
          value={head === "gpaip" ? String(enabledUnits.length) : "—"}
          sub={head === "gpaip" ? "Unit-level GPAIP toggle" : "Employer-borne cover"}
        />
        <StatCard
          label="Average per employee"
          value={people ? inr(total / people) : "—"}
        />
      </div>

      {/* Policies backing this head */}
      {data?.policies?.length ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {data.policies.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl border border-border/60 bg-card/70 px-3 py-2 text-[11px] backdrop-blur"
            >
              <p className="font-semibold">{p.name}</p>
              <p className="text-muted-foreground">
                {[p.provider, p.policy_number, p.end_date ? `valid till ${fmtDate(p.end_date)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-10 text-center text-xs text-muted-foreground">
          Loading {meta.label} recoveries…
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-10 text-center text-xs text-muted-foreground">
          No {meta.label} recovered for {monthLabel}.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const isOpen = open[g.unit] ?? true;
            return (
              <section
                key={g.unit}
                className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur"
              >
                <header
                  onClick={() => setOpen((s) => ({ ...s, [g.unit]: !(s[g.unit] ?? true) }))}
                  className="flex cursor-pointer items-center justify-between gap-2 border-b border-border/60 bg-background/40 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight
                      className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90")}
                    />
                    <h2 className="text-[13px] font-semibold">{g.unit}</h2>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {new Set(g.members.map((m) => m.candidateId)).size} employees
                    </span>
                  </div>
                  <span className="text-[13px] font-semibold tabular-nums">{inr(g.total)}</span>
                </header>

                {isOpen ? (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2 text-left font-semibold">Employee</th>
                        <th className="px-3 py-2 text-left font-semibold">Code</th>
                        <th className="px-3 py-2 text-left font-semibold">Date of joining</th>
                        <th className="px-3 py-2 text-left font-semibold">Recovered on</th>
                        <th className="px-3 py-2 text-right font-semibold">{meta.label}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {g.members.map((m) => (
                        <Fragment key={m.id}>
                          <tr className="hover:bg-muted/30">
                            <td className="px-3 py-2 font-medium">{m.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{m.code}</td>
                            <td className="px-3 py-2 text-muted-foreground">{fmtDate(m.joining)}</td>
                            <td className="px-3 py-2 text-muted-foreground">{fmtDate(m.date)}</td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums">
                              {inr(m.amount)}
                            </td>
                          </tr>
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
