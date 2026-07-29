import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ShieldCheck, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUserRole } from "@/lib/use-current-user-role";
import {
  fetchRehireRequests,
  fetchWorkflowByKey,
  fetchWorkflowSteps,
  stepByOrder,
  REHIRE_WORKFLOW_KEY,
  type RehireRequest,
  type WorkflowStep,
} from "@/lib/workflows";

/**
 * Rehire pipeline snapshot — mirrors the "pending onboarding" idea:
 * shows how many rehire requests are open and, for each, which role
 * currently holds it (driven by workflow_steps, never hardcoded).
 */
export function useRehirePipeline(opts?: { mineOnly?: boolean; requestedByCandidateId?: string | null }) {
  const mineOnly = !!opts?.mineOnly;
  const candidateId = opts?.requestedByCandidateId ?? null;

  return useQuery({
    queryKey: ["rehire-pipeline", mineOnly, candidateId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const wf = await fetchWorkflowByKey(REHIRE_WORKFLOW_KEY);
      const steps: WorkflowStep[] = wf ? (await fetchWorkflowSteps(wf.id)).filter((s) => s.is_active) : [];
      const all = await fetchRehireRequests();

      const { data: roleRows } = await supabase.from("roles").select("key,name");
      const roleName = new Map<string, string>(
        ((roleRows ?? []) as Array<{ key: string; name: string }>).map((r) => [r.key, r.name]),
      );

      let rows: RehireRequest[] = all;
      if (mineOnly && candidateId) {
        rows = all.filter((r) => r.requested_by_candidate_id === candidateId);
      }
      const pending = rows.filter((r) => r.status === "pending");
      return {
        steps,
        rows,
        pending,
        pendingCount: pending.length,
        completedCount: rows.filter((r) => r.status === "completed").length,
        rejectedCount: rows.filter((r) => r.status === "rejected").length,
        roleName,
      };
    },
  });
}

export function rehireHolderLabel(
  req: RehireRequest,
  steps: WorkflowStep[],
  roleName: Map<string, string>,
): string {
  if (req.status === "completed") return "Completed";
  if (req.status === "rejected") return "Rejected";
  const step = stepByOrder(steps, req.current_step_order);
  if (!step) return "Awaiting approval";
  const role = roleName.get(step.approver_role_key) ?? step.approver_role_key.replace(/_/g, " ");
  return `With ${role}`;
}

export function RehirePipelineCard({
  mineOnly,
  requestedByCandidateId,
  title = "Rehire pipeline",
}: {
  mineOnly?: boolean;
  requestedByCandidateId?: string | null;
  title?: string;
}) {
  const q = useRehirePipeline({ mineOnly, requestedByCandidateId });
  const data = q.data;
  const steps = data?.steps ?? [];
  const pending = data?.pending ?? [];

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-sm backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5 sm:px-4 sm:py-3">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-bold text-foreground sm:text-base">{title}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {mineOnly ? "Requests you raised and where they sit right now." : "Open rehire requests and their current approver."}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {q.isLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
          {pending.length} pending
        </span>
      </div>

      <div className="divide-y divide-border/50">
        {q.isLoading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
        ) : pending.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-accent/10 text-accent">
              <UserCheck className="h-4 w-4" />
            </div>
            <div className="text-sm font-semibold text-foreground">No rehire in progress</div>
            <div className="text-xs text-muted-foreground">
              {data?.completedCount ? `${data.completedCount} completed so far.` : "Requests appear here once raised."}
            </div>
          </div>
        ) : (
          pending.map((r) => {
            const step = stepByOrder(steps, r.current_step_order);
            const total = steps.length || 1;
            return (
              <Link
                key={r.id}
                to="/admin/workflows/rehire"
                search={{ request: r.id } as never}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-accent/5 sm:px-4"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{r.full_name || "—"}</div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {r.request_number ? `${r.request_number} · ` : ""}
                    Step {r.current_step_order} of {total}
                    {step ? ` · ${step.name}` : ""}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300">
                  {rehireHolderLabel(r, steps, data?.roleName ?? new Map())}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
