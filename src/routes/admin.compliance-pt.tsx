import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, ReceiptText, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/csv-export";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/compliance-pt")({
  component: PtRegisterPage,
  head: () => ({
    meta: [
      { title: "Professional Tax Register — Radiant Guard" },
      {
        name: "description",
        content:
          "State-wise Professional Tax deducted this month, bifurcated by slab band and gender, searchable down to an individual employee.",
      },
      { property: "og:title", content: "Professional Tax Register" },
      {
        property: "og:description",
        content: "State-wise PT deducted, split by slab band and gender.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const inr = (n: number) =>
  "₹" + Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

type PtRow = {
  id: string;
  candidateId: string;
  name: string;
  code: string;
  gender: string;
  state: string;
  unit: string;
  amount: number;
  band: string;
  bandOrder: number;
  date: string;
};

function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
}

const normGender = (g: string | null | undefined) => {
  const s = (g ?? "").trim().toLowerCase();
  if (s.startsWith("m")) return "Male";
  if (s.startsWith("f")) return "Female";
  return "Unspecified";
};

function bandLabel(min: number, max: number | null) {
  if (!max) return `${inr(min)} & above`;
  return `${inr(min)} – ${inr(max)}`;
}

function usePtData(ym: string) {
  return useQuery({
    queryKey: ["pt-register", ym],
    staleTime: 60_000,
    queryFn: async (): Promise<PtRow[]> => {
      const { from, to } = monthRange(ym);
      const { data: deds, error } = await supabase
        .from("deductions")
        .select("id, candidate_id, amount, computed_amount, deduction_name, deduction_date, status")
        .gte("deduction_date", from)
        .lte("deduction_date", to)
        .ilike("deduction_name", "%profession%");
      if (error) throw error;
      const rows = deds ?? [];
      if (rows.length === 0) return [];

      const ids = Array.from(new Set(rows.map((r) => r.candidate_id).filter(Boolean)));
      const [{ data: cands }, { data: slabs }] = await Promise.all([
        supabase
          .from("candidates")
          .select("id, full_name, employee_code, candidate_code, gender, permanent_state, unit_id")
          .in("id", ids),
        supabase
          .from("professional_tax_slabs")
          .select("state, salary_min, salary_max, tax_per_month, gender"),
      ]);

      const unitIds = Array.from(
        new Set((cands ?? []).map((c) => c.unit_id).filter(Boolean) as string[]),
      );
      const { data: units } = unitIds.length
        ? await supabase.from("units").select("id, name, billing_state, shipping_state").in("id", unitIds)
        : { data: [] as Array<{ id: string; name: string; billing_state: string | null; shipping_state: string | null }> };

      const unitMap = new Map((units ?? []).map((u) => [u.id, u]));
      const candMap = new Map((cands ?? []).map((c) => [c.id, c]));

      return rows.map((r) => {
        const c = candMap.get(r.candidate_id);
        const u = c?.unit_id ? unitMap.get(c.unit_id) : undefined;
        const state =
          (u?.billing_state || u?.shipping_state || c?.permanent_state || "Unknown").trim();
        const gender = normGender(c?.gender);
        const amount = Number(r.computed_amount ?? r.amount ?? 0);
        // Resolve the slab band by matching the deducted amount within the state schedule.
        const stateSlabs = (slabs ?? []).filter(
          (s) => (s.state ?? "").trim().toLowerCase() === state.toLowerCase(),
        );
        const hit =
          stateSlabs.find(
            (s) =>
              Number(s.tax_per_month) === Math.round(amount) &&
              (normGender(s.gender) === gender || normGender(s.gender) === "Unspecified"),
          ) ?? stateSlabs.find((s) => Number(s.tax_per_month) === Math.round(amount));
        return {
          id: r.id,
          candidateId: r.candidate_id,
          name: c?.full_name ?? "—",
          code: c?.employee_code ?? c?.candidate_code ?? "—",
          gender,
          state: state || "Unknown",
          unit: u?.name ?? "—",
          amount,
          band: hit ? bandLabel(Number(hit.salary_min), hit.salary_max ? Number(hit.salary_max) : null) : `${inr(amount)}/month slab`,
          bandOrder: hit ? Number(hit.salary_min) : 9_999_999,
          date: r.deduction_date,
        };
      });
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

function PtRegisterPage() {
  const now = new Date();
  const [ym, setYm] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [state, setState] = useState<string>("all");
  const [gender, setGender] = useState<string>("all");
  const [q, setQ] = useState("");

  const { data: all = [], isLoading } = usePtData(ym);

  const states = useMemo(
    () => Array.from(new Set(all.map((r) => r.state))).sort(),
    [all],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((r) => {
      if (state !== "all" && r.state !== state) return false;
      if (gender !== "all" && r.gender !== gender) return false;
      if (!needle) return true;
      return `${r.name} ${r.code} ${r.unit}`.toLowerCase().includes(needle);
    });
  }, [all, state, gender, q]);

  const total = rows.reduce((s, r) => s + r.amount, 0);

  const byState = useMemo(() => {
    const m = new Map<string, { total: number; count: number }>();
    for (const r of rows) {
      const b = m.get(r.state) ?? { total: 0, count: 0 };
      b.total += r.amount;
      b.count += 1;
      m.set(r.state, b);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [rows]);

  const byBand = useMemo(() => {
    const m = new Map<string, { total: number; count: number; order: number }>();
    for (const r of rows) {
      const b = m.get(r.band) ?? { total: 0, count: 0, order: r.bandOrder };
      b.total += r.amount;
      b.count += 1;
      m.set(r.band, b);
    }
    return Array.from(m.entries()).sort((a, b) => a[1].order - b[1].order);
  }, [rows]);

  const byGender = useMemo(() => {
    const m = new Map<string, { total: number; count: number }>();
    for (const r of rows) {
      const b = m.get(r.gender) ?? { total: 0, count: 0 };
      b.total += r.amount;
      b.count += 1;
      m.set(r.gender, b);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [rows]);

  const monthLabel = new Date(ym + "-01T00:00:00").toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="page-shell">
      <PageHeader
        icon={ReceiptText}
        eyebrow="Governance"
        title="Professional Tax Register"
        description="State-wise PT deducted, bifurcated by slab band and gender — drill down to an individual employee."
        crumbs={[{ label: "Compliance", to: "/admin/compliance" }, { label: "Professional Tax" }]}
        actions={
          <div className="flex items-center gap-2">
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
                  `pt-register-${ym}`,
                  rows.map((r) => ({
                    code: r.code,
                    name: r.name,
                    gender: r.gender,
                    state: r.state,
                    unit: r.unit,
                    band: r.band,
                    amount: r.amount,
                    date: r.date,
                  })),
                  [
                    { key: "code", header: "Employee code" },
                    { key: "name", header: "Name" },
                    { key: "gender", header: "Gender" },
                    { key: "state", header: "State" },
                    { key: "unit", header: "Unit" },
                    { key: "band", header: "Slab band" },
                    { key: "amount", header: "PT deducted" },
                    { key: "date", header: "Deduction date" },
                  ],
                )
              }
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="h-9 text-xs" />
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {states.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={gender} onValueChange={setGender}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All genders</SelectItem>
            <SelectItem value="Male">Male</SelectItem>
            <SelectItem value="Female">Female</SelectItem>
            <SelectItem value="Unspecified">Unspecified</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search employee…"
            className="h-9 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Totals */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label={`PT deducted · ${monthLabel}`} value={inr(total)} sub={`${rows.length} employees`} />
        <StatCard label="States" value={String(byState.length)} />
        <StatCard label="Slab bands" value={String(byBand.length)} />
        <StatCard
          label="Male / Female"
          value={`${inr(byGender.find((g) => g[0] === "Male")?.[1].total ?? 0)} / ${inr(
            byGender.find((g) => g[0] === "Female")?.[1].total ?? 0,
          )}`}
        />
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-10 text-center text-xs text-muted-foreground">
          Loading professional tax deductions…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-10 text-center text-xs text-muted-foreground">
          No professional tax deducted for {monthLabel} with the current filters.
        </div>
      ) : (
        <div className="space-y-3">
          {/* Bifurcations */}
          <div className="grid gap-3 lg:grid-cols-3">
            <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur">
              <header className="border-b border-border/60 bg-background/40 px-3 py-2 text-[12px] font-semibold">
                By state
              </header>
              <ul className="divide-y divide-border/60">
                {byState.map(([s, v]) => (
                  <li key={s}>
                    <button
                      onClick={() => setState(state === s ? "all" : s)}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/40",
                        state === s && "bg-accent/10",
                      )}
                    >
                      <span className="truncate text-[12px] font-medium">{s}</span>
                      <span className="ml-2 shrink-0 text-[12px] font-semibold tabular-nums">
                        {inr(v.total)}{" "}
                        <span className="text-[10px] font-normal text-muted-foreground">({v.count})</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur">
              <header className="border-b border-border/60 bg-background/40 px-3 py-2 text-[12px] font-semibold">
                By slab band
              </header>
              <ul className="divide-y divide-border/60">
                {byBand.map(([b, v]) => (
                  <li key={b} className="flex items-center justify-between px-3 py-2">
                    <span className="truncate text-[12px] font-medium">{b}</span>
                    <span className="ml-2 shrink-0 text-[12px] font-semibold tabular-nums">
                      {inr(v.total)}{" "}
                      <span className="text-[10px] font-normal text-muted-foreground">({v.count})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur">
              <header className="border-b border-border/60 bg-background/40 px-3 py-2 text-[12px] font-semibold">
                By gender
              </header>
              <ul className="divide-y divide-border/60">
                {byGender.map(([g, v]) => (
                  <li key={g}>
                    <button
                      onClick={() => setGender(gender === g ? "all" : g)}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/40",
                        gender === g && "bg-accent/10",
                      )}
                    >
                      <span className="truncate text-[12px] font-medium">{g}</span>
                      <span className="ml-2 shrink-0 text-[12px] font-semibold tabular-nums">
                        {inr(v.total)}{" "}
                        <span className="text-[10px] font-normal text-muted-foreground">({v.count})</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Employee level */}
          <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur">
            <header className="flex items-center gap-2 border-b border-border/60 bg-background/40 px-3 py-2">
              <h2 className="text-[13px] font-semibold">Employee-wise PT</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {rows.length}
              </span>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 text-left font-semibold">Employee</th>
                    <th className="px-3 py-2 text-left font-semibold">State</th>
                    <th className="px-3 py-2 text-left font-semibold">Unit</th>
                    <th className="px-3 py-2 text-left font-semibold">Gender</th>
                    <th className="px-3 py-2 text-left font-semibold">Slab band</th>
                    <th className="px-3 py-2 text-right font-semibold">PT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {rows
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((r) => (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <p className="font-medium">{r.name}</p>
                          <p className="text-[10px] text-muted-foreground">{r.code}</p>
                        </td>
                        <td className="px-3 py-2">{r.state}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.unit}</td>
                        <td className="px-3 py-2">{r.gender}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.band}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{inr(r.amount)}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border/60 bg-background/40">
                    <td className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" colSpan={5}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right text-[13px] font-semibold tabular-nums">{inr(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
