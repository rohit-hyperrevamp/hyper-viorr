import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Edit2, Plus, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchWorkflows,
  fetchWorkflowSteps,
  updateWorkflow,
  upsertWorkflowStep,
  deleteWorkflowStep,
  reorderWorkflowSteps,
  type WorkflowDefinition,
  type WorkflowStep,
} from "@/lib/workflows";
import { confirmAction } from "@/components/ConfirmProvider";

export const Route = createFileRoute("/admin/workflow-manager")({
  component: WorkflowManagerPage,
});

const MODULE = "Workflow Manager";

type StepDraft = {
  id?: string;
  name: string;
  key: string;
  description: string;
  approver_role_key: string;
  action_label: string;
  is_active: boolean;
};

const emptyDraft: StepDraft = {
  name: "",
  key: "",
  description: "",
  approver_role_key: "",
  action_label: "Approve",
  is_active: true,
};

function WorkflowManagerPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StepDraft | null>(null);

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ["admin", "workflow-definitions"],
    queryFn: fetchWorkflows,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["admin", "roles", "workflow-manager"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles" as never)
        .select("key,name,enabled")
        .order("name");
      if (error) throw error;
      return ((data as unknown) as Array<{ key: string; name: string; enabled: boolean }>).filter(
        (r) => r.enabled !== false,
      );
    },
  });

  const active: WorkflowDefinition | null = useMemo(() => {
    if (workflows.length === 0) return null;
    return workflows.find((w) => w.id === selectedId) ?? workflows[0];
  }, [workflows, selectedId]);

  const { data: steps = [] } = useQuery({
    queryKey: ["admin", "workflow-steps", active?.id],
    queryFn: () => fetchWorkflowSteps(active!.id),
    enabled: !!active?.id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "workflow-definitions"] });
    qc.invalidateQueries({ queryKey: ["admin", "workflow-steps"] });
  };

  const toggleWorkflow = useMutation({
    mutationFn: async ({ wf, value }: { wf: WorkflowDefinition; value: boolean }) => {
      await updateWorkflow(wf.id, { is_active: value });
      void logActivity({
        module: MODULE,
        action: value ? "enable" : "disable",
        entityType: "workflow_definitions",
        entityId: wf.id,
        entityLabel: wf.name,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Workflow updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const saveStep = useMutation({
    mutationFn: async (d: StepDraft) => {
      if (!active) throw new Error("No workflow selected");
      if (!d.name.trim()) throw new Error("Step name is required");
      if (!d.approver_role_key) throw new Error("Approver role is required");
      const nextOrder = steps.length === 0 ? 1 : Math.max(...steps.map((s) => s.step_order)) + 1;
      await upsertWorkflowStep({
        id: d.id,
        workflow_id: active.id,
        name: d.name.trim(),
        key: (d.key || d.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        description: d.description.trim(),
        approver_role_key: d.approver_role_key,
        action_label: d.action_label.trim() || "Approve",
        is_active: d.is_active,
        ...(d.id ? {} : { step_order: nextOrder }),
      } as Partial<WorkflowStep> & { workflow_id: string });
      void logActivity({
        module: MODULE,
        action: d.id ? "update" : "create",
        entityType: "workflow_steps",
        entityId: d.id,
        entityLabel: d.name,
        details: d as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      invalidate();
      setDraft(null);
      toast.success("Step saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const removeStep = useMutation({
    mutationFn: async (step: WorkflowStep) => {
      await deleteWorkflowStep(step.id);
      const rest = steps.filter((s) => s.id !== step.id).map((s) => s.id);
      if (rest.length > 0) await reorderWorkflowSteps(rest);
      void logActivity({
        module: MODULE,
        action: "delete",
        entityType: "workflow_steps",
        entityId: step.id,
        entityLabel: step.name,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Step removed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const move = useMutation({
    mutationFn: async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      const ids = steps.map((s) => s.id);
      const target = index + dir;
      if (target < 0 || target >= ids.length) return;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      await reorderWorkflowSteps(ids);
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reorder failed"),
  });

  const roleLabel = (key: string) => roles.find((r) => r.key === key)?.name ?? key ?? "—";

  return (
    <div>
      <PageHeader
        title="Workflow Manager"
        description="Configure approval workflows and the role that owns each step."
        crumbs={[{ label: "Control Center", to: "/admin/control-center" }, { label: "Workflow Manager" }]}
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading workflows…</p>
      ) : workflows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No workflows configured yet.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-2">
            {workflows.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedId(w.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  active?.id === w.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:bg-secondary/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                    <WorkflowIcon className="h-4 w-4 text-muted-foreground" />
                    {w.name}
                  </span>
                  <Badge variant={w.is_active ? "default" : "secondary"}>
                    {w.is_active ? "Active" : "Off"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{w.description || w.key}</p>
              </button>
            ))}
          </div>

          {active && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex flex-col gap-3 border-b border-border bg-accent/10 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{active.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {steps.length} step{steps.length === 1 ? "" : "s"} · entity: {active.entity_type || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Enabled</Label>
                    <Switch
                      checked={active.is_active}
                      onCheckedChange={(v) => toggleWorkflow.mutate({ wf: active, value: v })}
                    />
                  </div>
                  <Button size="sm" className="h-9 rounded-lg" onClick={() => setDraft({ ...emptyDraft })}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add step
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="ios-table w-full text-sm">
                  <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3">#</th>
                      <th className="px-5 py-3">Step</th>
                      <th className="px-5 py-3">Approver role</th>
                      <th className="px-5 py-3">Action label</th>
                      <th className="px-5 py-3">Active</th>
                      <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {steps.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-secondary/30">
                        <td className="px-5 py-3 font-mono text-muted-foreground">{s.step_order}</td>
                        <td className="px-5 py-3">
                          <p className="font-medium text-foreground">{s.name}</p>
                          {s.description && (
                            <p className="text-xs text-muted-foreground">{s.description}</p>
                          )}
                        </td>
                        <td className="px-5 py-3 text-foreground/90">{roleLabel(s.approver_role_key)}</td>
                        <td className="px-5 py-3 text-foreground/90">{s.action_label || "Approve"}</td>
                        <td className="px-5 py-3">
                          <Switch
                            checked={s.is_active}
                            onCheckedChange={(v) =>
                              saveStep.mutate({
                                id: s.id,
                                name: s.name,
                                key: s.key,
                                description: s.description,
                                approver_role_key: s.approver_role_key,
                                action_label: s.action_label,
                                is_active: v,
                              })
                            }
                          />
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              disabled={idx === 0}
                              onClick={() => move.mutate({ index: idx, dir: -1 })}
                              aria-label="Move up"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              disabled={idx === steps.length - 1}
                              onClick={() => move.mutate({ index: idx, dir: 1 })}
                              aria-label="Move down"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() =>
                                setDraft({
                                  id: s.id,
                                  name: s.name,
                                  key: s.key,
                                  description: s.description,
                                  approver_role_key: s.approver_role_key,
                                  action_label: s.action_label,
                                  is_active: s.is_active,
                                })
                              }
                              aria-label="Edit"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              onClick={async () => {
                                const ok = await confirmAction({
                                  title: `Remove “${s.name}”?`,
                                  description: "This step will no longer be part of the approval chain.",
                                  confirmText: "Remove",
                                  destructive: true,
                                });
                                if (ok) removeStep.mutate(s);
                              }}
                              aria-label="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {steps.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">
                          No steps yet — add the first approval step.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit step" : "Add step"}</DialogTitle>
            <DialogDescription>
              Steps run in order. Only the approver role can action the step.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Step name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Operations Manager review"
                />
              </div>
              <div>
                <Label className="text-xs">Approver role</Label>
                <Select
                  value={draft.approver_role_key}
                  onValueChange={(v) => setDraft({ ...draft, approver_role_key: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.key} value={r.key}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Action label</Label>
                <Input
                  value={draft.action_label}
                  onChange={(e) => setDraft({ ...draft, action_label: e.target.value })}
                  placeholder="Approve"
                />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={draft.is_active}
                  onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
                />
                <Label className="text-xs">Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button disabled={saveStep.isPending} onClick={() => draft && saveStep.mutate(draft)}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
