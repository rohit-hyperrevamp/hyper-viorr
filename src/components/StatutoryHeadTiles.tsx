import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Landmark, PiggyBank, ReceiptText, ShieldHalf } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ACCENT_CHIP, ACCENT_TILE_BG, type Accent } from "@/components/tile-theme";

const inr = (n: number) =>
  "₹" + Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

type HeadKey = "pt" | "epf" | "lwf" | "levy";

const HEADS: Array<{
  key: HeadKey;
  label: string;
  full: string;
  accent: Accent;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  /** substrings matched against deduction / contribution names */
  match: string[];
}> = [
  {
    key: "pt",
    label: "PT",
    full: "Professional Tax",
    accent: "violet",
    icon: ReceiptText,
    to: "/admin/compliance-pt",
    match: ["profession"],
  },
  {
    key: "epf",
    label: "EPF",
    full: "Provident Fund",
    accent: "emerald",
    icon: PiggyBank,
    to: "/admin/deductions",
    match: ["epf", "provident"],
  },
  {
    key: "lwf",
    label: "LWF",
    full: "Labour Welfare Fund",
    accent: "sky",
    icon: Landmark,
    to: "/admin/compliance-lwf",
    match: ["labour welfare", "lwf"],
  },
  {
    key: "levy",
    label: "Guard Board Levy",
    full: "Security Guards Board levy",
    accent: "amber",
    icon: ShieldHalf,
    to: "/admin/deductions",
    match: ["guard board", "sgb", "levy"],
  },
];

function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
}

function useStatutoryTotals(ym: string) {
  return useQuery({
    queryKey: ["statutory-heads", ym],
    staleTime: 60_000,
    queryFn: async () => {
      const { from, to } = monthRange(ym);
      const [{ data: deds }, { data: contribs }] = await Promise.all([
        supabase
          .from("deductions")
          .select("candidate_id, amount, computed_amount, deduction_name")
          .gte("deduction_date", from)
          .lte("deduction_date", to),
        supabase
          .from("employer_contributions")
          .select("candidate_id, amount, contribution_name")
          .gte("contribution_date", from)
          .lte("contribution_date", to),
      ]);

      const totals: Record<HeadKey, { employee: number; employer: number; people: Set<string> }> = {
        pt: { employee: 0, employer: 0, people: new Set() },
        epf: { employee: 0, employer: 0, people: new Set() },
        lwf: { employee: 0, employer: 0, people: new Set() },
        levy: { employee: 0, employer: 0, people: new Set() },
      };

      const bucket = (name: string) => {
        const n = (name ?? "").toLowerCase();
        return HEADS.find((h) => h.match.some((m) => n.includes(m)))?.key ?? null;
      };

      for (const d of deds ?? []) {
        const k = bucket(d.deduction_name ?? "");
        if (!k) continue;
        totals[k].employee += Number(d.computed_amount ?? d.amount ?? 0);
        if (d.candidate_id) totals[k].people.add(d.candidate_id);
      }
      for (const c of contribs ?? []) {
        const k = bucket(c.contribution_name ?? "");
        if (!k) continue;
        totals[k].employer += Number(c.amount ?? 0);
        if (c.candidate_id) totals[k].people.add(c.candidate_id);
      }

      return Object.fromEntries(
        Object.entries(totals).map(([k, v]) => [
          k,
          { employee: v.employee, employer: v.employer, people: v.people.size },
        ]),
      ) as Record<HeadKey, { employee: number; employer: number; people: number }>;
    },
  });
}

export function StatutoryHeadTiles({ ym }: { ym: string }) {
  const { data, isLoading } = useStatutoryTotals(ym);
  const monthLabel = new Date(ym + "-01T00:00:00").toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <section className="mb-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-[13px] font-semibold">Statutory registers</h2>
        <p className="text-[11px] text-muted-foreground">{monthLabel}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {HEADS.map((h) => {
          const t = data?.[h.key];
          const total = (t?.employee ?? 0) + (t?.employer ?? 0);
          const Icon = h.icon;
          return (
            <Link
              key={h.key}
              to={h.to}
              search={h.key === "pt" ? { ym } : undefined}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-[22px] border border-border/40 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:p-4",
                ACCENT_TILE_BG[h.accent],
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-display text-[13px] font-semibold leading-tight text-foreground">
                    {h.label}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{h.full}</p>
                </div>
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-card/80 ring-1 ring-inset",
                    ACCENT_CHIP[h.accent],
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </div>

              <div className="mt-4 font-display text-[22px] font-bold leading-none tracking-tight tabular-nums text-foreground sm:text-[26px]">
                {isLoading ? "—" : inr(total)}
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span className="truncate">
                  {t && t.people > 0
                    ? t.employer > 0
                      ? `${t.people} employees · EE ${inr(t.employee)} + ER ${inr(t.employer)}`
                      : `${t.people} employees`
                    : "No records this month"}
                </span>
                <ArrowUpRight className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
