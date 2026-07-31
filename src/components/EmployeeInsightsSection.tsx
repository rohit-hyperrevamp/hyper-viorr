import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, UserCheck, Users, UserPlus, RefreshCw, ArrowRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { usePeopleInsights } from "@/lib/people-insights";
import { PeopleInsightsCard } from "@/components/PeopleInsightsCard";
import { useRehirePipeline, rehireHolderLabel } from "@/components/RehirePipelineCard";
import { stepByOrder } from "@/lib/workflows";

function useEmployeeCounts() {
  return useQuery({
    queryKey: ["employee-insights-counts"],
    staleTime: 60_000,
    queryFn: async () => {
      const [employees, candidates, pendingApproval, offboarded] = await Promise.all([
        supabase.from("candidates").select("id", { count: "exact", head: true })
          .eq("is_enabled", true).eq("status", "active"),
        supabase.from("candidates").select("id", { count: "exact", head: true })
          .in("status", ["draft", "submitted", "pending", "candidate", "approved"]),
        supabase.from("candidates").select("id", { count: "exact", head: true })
          .in("status", ["submitted", "pending"]),
        supabase.from("candidates").select("id", { count: "exact", head: true })
          .in("status", ["offboarded", "inactive", "exited"]),
      ]);
      return {
        employees: employees.count ?? 0,
        candidates: candidates.count ?? 0,
        pendingApproval: pendingApproval.count ?? 0,
        offboarded: offboarded.count ?? 0,
      };
    },
  });
}

function Stat({
  icon: Icon, label, value, hint, loading, tone = "neutral", active, onClick, to, search,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint?: string;
  loading?: boolean;
  tone?: "neutral" | "accent" | "amber";
  active?: boolean;
  onClick?: () => void;
  to?: string;
  search?: Record<string, unknown>;
}) {
  const toneCls =
    tone === "accent"
      ? "bg-accent/15 text-accent ring-accent/20"
      : tone === "amber"
        ? "bg-amber-500/15 text-amber-700 ring-amber-500/25 dark:text-amber-300"
        : "bg-muted text-muted-foreground ring-border";
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${toneCls}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
          <div className="font-display text-xl font-bold leading-tight text-foreground num">
            {loading ? "—" : value.toLocaleString("en-IN")}
          </div>
        </div>
      </div>
      {hint && <div className="mt-2 truncate text-[11px] text-muted-foreground">{hint}</div>}
    </>
  );
  const cls = `block w-full rounded-2xl border p-3.5 text-left backdrop-blur-xl transition sm:p-4 ${
    active ? "border-accent/50 bg-accent/5 shadow-sm" : "border-border/60 bg-card/80 hover:border-accent/40 hover:bg-accent/5"
  }`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  }
  return (
    <Link to={to ?? "/admin/employees"} search={search as never} className={cls}>
      {body}
    </Link>
  );
}

function RehireList() {
  const q = useRehirePipeline();
  const steps = q.data?.steps ?? [];
  const pending = q.data?.pending ?? [];

  if (q.isLoading) {
    return <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>;
  }
  if (pending.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-accent/10 text-accent">
          <UserCheck className="h-4 w-4" />
        </div>
        <div className="text-sm font-semibold text-foreground">No rehire in progress</div>
        <div className="text-xs text-muted-foreground">
          {q.data?.completedCount ? `${q.data.completedCount} completed so far.` : "Requests appear here once raised."}
        </div>
      </div>
    );
  }
  return (
    <ul className="max-h-[280px] divide-y divide-border/60 overflow-y-auto">
      {pending.map((r) => {
        const step = stepByOrder(steps, r.current_step_order);
        return (
          <li key={r.id}>
            <Link
              to="/admin/employees"
              search={{ tab: "candidate", rehire: r.id } as never}
              className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-accent/5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{r.full_name || "—"}</div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {r.request_number ? `${r.request_number} · ` : ""}
                  Step {r.current_step_order} of {steps.length || 1}
                  {step ? ` · ${step.name}` : ""}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300">
                {rehireHolderLabel(r, steps, q.data?.roleName ?? new Map())}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Full-width "Employees" block for leadership / super-admin dashboards:
 * clickable headcount / candidate / rehire / 60+ stats with birthdays and
 * work anniversaries always visible, and an inline rehire pipeline.
 */
export function EmployeeInsightsSection() {
  const counts = useEmployeeCounts();
  const insights = usePeopleInsights();
  const rehire = useRehirePipeline();
  const [showRehire, setShowRehire] = React.useState(false);

  return (
    <section className="w-full overflow-hidden rounded-[24px] border border-border/60 bg-card/70 p-4 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.85)_inset,0_24px_60px_-30px_rgba(15,23,42,0.22)] sm:p-5">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Workforce</div>
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Employees</h2>
        </div>
        <Link
          to="/admin/employees"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-foreground transition hover:bg-accent/10"
        >
          Open employees <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Users} label="Employees" value={counts.data?.employees ?? 0} hint="Active & enabled" loading={counts.isLoading} tone="accent" to="/admin/employees" search={{ tab: "employee" }} />
        <Stat icon={UserPlus} label="Candidates" value={counts.data?.candidates ?? 0} hint={`${counts.data?.pendingApproval ?? 0} awaiting approval`} loading={counts.isLoading} to="/admin/employees" search={{ tab: "candidate" }} />
        <Stat
          icon={RefreshCw}
          label="Rehire open"
          value={rehire.data?.pendingCount ?? 0}
          hint={showRehire ? "Hide pipeline" : `${rehire.data?.completedCount ?? 0} completed · ${rehire.data?.rejectedCount ?? 0} rejected`}
          loading={rehire.isLoading}
          tone="amber"
          active={showRehire}
          onClick={() => setShowRehire((v) => !v)}
        />
        <Stat icon={ShieldAlert} label="60+ employees" value={insights.sixtyPlus.length} hint="Retirement watchlist" loading={insights.isLoading} to="/admin/employees" search={{ tab: "employee" }} />
      </div>

      {showRehire && (
        <div className="mt-3 overflow-hidden rounded-[20px] border border-border/60 bg-card/80">
          <RehireList />
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <PeopleInsightsCard kind="sixty-plus" items={insights.sixtyPlus} isLoading={insights.isLoading} />
        <PeopleInsightsCard kind="birthdays" items={insights.birthdays} isLoading={insights.isLoading} />
        <PeopleInsightsCard kind="anniversaries" items={insights.anniversaries} isLoading={insights.isLoading} />
      </div>
    </section>
  );
}
