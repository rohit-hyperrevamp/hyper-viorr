import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, HeartHandshake, HeartPulse, ShieldPlus, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ACCENT_CHIP, ACCENT_TILE_BG, type Accent } from "@/components/tile-theme";

const inr = (n: number) =>
  "₹" + Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export type InsuranceHeadKey = "gpaip" | "esic" | "wc";

export const INSURANCE_HEADS: Array<{
  key: InsuranceHeadKey;
  label: string;
  full: string;
  accent: Accent;
  icon: LucideIcon;
  /** substrings matched against deduction / contribution names */
  match: string[];
  /** substrings matched against policy names in the policy register */
  policyMatch: string[];
}> = [
  {
    key: "gpaip",
    label: "GPAIP",
    full: "Group Personal Accident Insurance Policy",
    accent: "sky",
    icon: ShieldPlus,
    match: ["gpaip", "personal accident"],
    policyMatch: ["gpaip", "personal accident"],
  },
  {
    key: "esic",
    label: "ESIC",
    full: "Employees' State Insurance",
    accent: "emerald",
    icon: HeartPulse,
    match: ["esic", "esi "],
    policyMatch: ["esic", "state insurance"],
  },
  {
    key: "wc",
    label: "WC",
    full: "Workmen's Compensation",
    accent: "amber",
    icon: HeartHandshake,
    match: ["workmen", "workman", "w.c.", "wc policy", "compensation policy"],
    policyMatch: ["workmen", "workman", "compensation"],
  },
];

export function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
}

export const matchesHead = (name: string | null | undefined, head: InsuranceHeadKey) => {
  const n = (name ?? "").toLowerCase();
  return INSURANCE_HEADS.find((h) => h.key === head)!.match.some((m) => n.includes(m));
};

function useInsuranceTotals(ym: string) {
  return useQuery({
    queryKey: ["insurance-heads", ym],
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

      const out: Record<InsuranceHeadKey, { amount: number; people: Set<string> }> = {
        gpaip: { amount: 0, people: new Set() },
        esic: { amount: 0, people: new Set() },
        wc: { amount: 0, people: new Set() },
      };

      for (const d of deds ?? []) {
        for (const h of INSURANCE_HEADS) {
          if (!matchesHead(d.deduction_name, h.key)) continue;
          out[h.key].amount += Number(d.computed_amount ?? d.amount ?? 0);
          if (d.candidate_id) out[h.key].people.add(d.candidate_id);
        }
      }
      for (const c of contribs ?? []) {
        for (const h of INSURANCE_HEADS) {
          if (!matchesHead(c.contribution_name, h.key)) continue;
          out[h.key].amount += Number(c.amount ?? 0);
          if (c.candidate_id) out[h.key].people.add(c.candidate_id);
        }
      }

      return {
        gpaip: { amount: out.gpaip.amount, people: out.gpaip.people.size },
        esic: { amount: out.esic.amount, people: out.esic.people.size },
        wc: { amount: out.wc.amount, people: out.wc.people.size },
      } as Record<InsuranceHeadKey, { amount: number; people: number }>;
    },
  });
}

export function InsuranceHeadTiles({ ym }: { ym: string }) {
  const { data, isLoading } = useInsuranceTotals(ym);
  const monthLabel = new Date(ym + "-01T00:00:00").toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <section className="mb-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-[13px] font-semibold">Insurance registers</h2>
        <p className="text-[11px] text-muted-foreground">{monthLabel}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {INSURANCE_HEADS.map((h) => {
          const t = data?.[h.key];
          const Icon = h.icon;
          return (
            <Link
              key={h.key}
              to="/admin/compliance-insurance"
              search={{ ym, head: h.key }}
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
                {isLoading ? "—" : inr(t?.amount ?? 0)}
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span className="truncate">
                  {t && t.people > 0 ? `${t.people} employees` : "No records this month"}
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
