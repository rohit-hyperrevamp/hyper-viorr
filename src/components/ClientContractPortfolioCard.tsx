import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Leadership / Super Admin dashboard: client contract portfolio at a glance.
// Mirrors the unified status vocabulary used on the Client Contracts page.
// Every tile deep-links back into that page with the filter pre-applied.
// ---------------------------------------------------------------------------

type UnifiedStatus = "active" | "inactive" | "expired" | "pending_approval" | "lost";

type Row = {
  recordType: "prospect" | "client";
  status: UnifiedStatus;
  isRenewal: boolean;
};

function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

async function fetchContractPortfolio(): Promise<Row[]> {
  const { data, error } = await supabase
    .from("client_contracts" as never)
    .select("record_type,status,approval_status,prospect_stage,expiry_date,end_date");
  if (error) throw error;

  const today = new Date().toISOString().slice(0, 10);
  const renewalTo = addMonthsISO(today, 6);

  return ((data as unknown as Record<string, unknown>[]) ?? []).map((c) => {
    const recordType = (String(c.record_type ?? "prospect") === "client" ? "client" : "prospect") as
      | "prospect"
      | "client";
    const rawStatus = String(c.status ?? "inactive");
    const approval = String(c.approval_status ?? "pending");
    const stage = String(c.prospect_stage ?? "new");

    let status: UnifiedStatus;
    if (stage === "lost") status = "lost";
    else if (recordType === "prospect" && approval === "pending") status = "pending_approval";
    else if (recordType === "prospect" && approval === "rejected") status = "inactive";
    else if (rawStatus === "expired") status = "expired";
    else if (rawStatus === "active") status = "active";
    else status = "inactive";

    const due = String(c.expiry_date ?? "") || String(c.end_date ?? "");
    const isRenewal =
      recordType === "client" && rawStatus === "active" && !!due && due >= today && due <= renewalTo;

    return { recordType, status, isRenewal };
  });
}

type Tone = "neutral" | "accent" | "warning" | "destructive";

function ContractTile({
  label,
  value,
  tone = "neutral",
  to,
  search,
}: {
  label: string;
  value: number;
  tone?: Tone;
  to: string;
  search: Record<string, unknown>;
}) {
  return (
    <Link
      to={to}
      search={search}
      className={cn(
        "block rounded-2xl border p-3 transition-colors hover:border-primary/50 hover:bg-muted/40",
        tone === "accent" && "border-primary/30 bg-primary/5",
        tone === "warning" && "border-amber-500/30 bg-amber-500/5",
        tone === "destructive" && "border-destructive/30 bg-destructive/5",
        tone === "neutral" && "border-border bg-background/60",
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "accent" && "text-primary",
          tone === "warning" && "text-amber-600",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </div>
    </Link>
  );
}

export function ClientContractPortfolioCard() {
  const { data: rows = [] } = useQuery({
    queryKey: ["admin", "contract-portfolio"],
    queryFn: fetchContractPortfolio,
  });

  const counts = useMemo(() => {
    const c = {
      prospects: 0,
      active: 0,
      renewals: 0,
      inactive: 0,
      expired: 0,
      pending_approval: 0,
      lost: 0,
    };
    for (const r of rows) {
      if (r.recordType === "prospect") c.prospects++;
      if (r.isRenewal) c.renewals++;
      if (r.status === "active") c.active++;
      else if (r.status === "inactive") c.inactive++;
      else if (r.status === "expired") c.expired++;
      else if (r.status === "pending_approval") c.pending_approval++;
      else if (r.status === "lost") c.lost++;
    }
    return c;
  }, [rows]);

  const to = "/admin/contracts/client-contracts";

  return (
    <div className="mb-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Commercial
          </div>
          <h2 className="text-base font-semibold">Client Contracts</h2>
          <p className="text-xs text-muted-foreground">
            Portfolio health across prospects and client contracts. Tap any tile to
            open the contract register pre-filtered.
          </p>
        </div>
        <Link
          to={to}
          search={{}}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          Open contracts
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <ContractTile label="Prospects" value={counts.prospects} to={to} search={{ tab: "prospect" }} />
        <ContractTile label="Active" value={counts.active} tone="accent" to={to} search={{ status: "active", tab: "client" }} />
        <ContractTile label="Renewal ≤ 6m" value={counts.renewals} tone="warning" to={to} search={{ renewals: true }} />
        <ContractTile label="Inactive" value={counts.inactive} tone="warning" to={to} search={{ status: "inactive" }} />
        <ContractTile label="Expired" value={counts.expired} tone="destructive" to={to} search={{ status: "expired" }} />
        <ContractTile label="Pending approval" value={counts.pending_approval} tone="warning" to={to} search={{ status: "pending_approval", tab: "prospect" }} />
        <ContractTile label="Lost" value={counts.lost} tone="destructive" to={to} search={{ status: "lost" }} />
      </div>
    </div>
  );
}
