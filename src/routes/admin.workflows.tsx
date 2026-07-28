import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, GitBranch, Workflow as WorkflowIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { fetchWorkflows } from "@/lib/workflows";

export const Route = createFileRoute("/admin/workflows")({
  component: WorkflowsLayout,
});

function WorkflowsLayout() {
  const location = useLocation();
  const isHub =
    location.pathname === "/admin/workflows" || location.pathname === "/admin/workflows/";
  return isHub ? <WorkflowsHub /> : <Outlet />;
}

function WorkflowsHub() {
  const q = useQuery({ queryKey: ["workflows", "definitions"], queryFn: fetchWorkflows });
  const items = q.data ?? [];

  return (
    <div>
      <PageHeader
        title="Workflow"
        description="Multi-step approval chains. Every step, role and order is configurable — nothing is hardcoded."
        crumbs={[{ label: "Control Center", to: "/admin/control-center" }, { label: "Workflow" }]}
      />

      {q.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading workflows…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No workflows configured yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((w) => (
            <Link
              key={w.id}
              to={w.route_path || "/admin/workflows"}
              className="group relative flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-accent/40 hover:bg-accent/5"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <GitBranch className="h-5 w-5" />
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    w.is_active
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-muted text-muted-foreground ring-1 ring-border"
                  }`}
                >
                  {w.is_active ? "Active" : "Disabled"}
                </span>
              </div>
              <div>
                <div className="font-display text-base font-bold tracking-tight text-foreground">
                  {w.name}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{w.description}</p>
              </div>
              <div className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-accent">
                Open
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        <WorkflowIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Workflow steps are stored in the backend. Changing a step's role, order or label instantly
          re-routes every pending and future request.
        </span>
      </div>
    </div>
  );
}
