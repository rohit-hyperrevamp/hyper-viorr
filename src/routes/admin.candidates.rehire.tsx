import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { confirmAction } from "@/components/ConfirmProvider";
import { supabase } from "@/integrations/supabase/client";
import { fetchRoles } from "@/lib/rbac";
import { useCurrentUserRole } from "@/lib/use-current-user-role";
import {
  actOnRehireRequest,
  deleteWorkflowStep,
  fetchRehireEvents,
  fetchRehireRequests,
  fetchWorkflowByKey,
  fetchWorkflowSteps,
  REHIRE_WORKFLOW_KEY,
  reorderWorkflowSteps,
  stepByOrder,
  updateWorkflow,
  upsertWorkflowStep,
  type RehireRequest,
  type WorkflowStep,
} from "@/lib/workflows";

type Search = { request?: string };

export const Route = createFileRoute("/admin/candidates/rehire")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    request: typeof s.request === "string" ? s.request : undefined,
  }),
  component: RehireWorkflowPage,
});

const WF_QK = ["workflows", "rehire", "definition"] as const;
const REQ_QK = ["workflows", "rehire", "requests"] as const;

function statusChip(status: string) {
  const map: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 ring-amber-200",
    completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  return map[status] ?? "bg-muted text-muted-foreground ring-border";
}

function RehireWorkflowPage() {
  const search = useSearch({ from: "/admin/candidates/rehire" });
  const qc = useQueryClient();
  const { roleKey, isSuperAdmin } = useCurrentUserRole();

  const wfQ = useQuery({
    queryKey: WF_QK,
    queryFn: async () => {
      const wf = await fetchWorkflowByKey(REHIRE_WORKFLOW_KEY);
      if (!wf) return null;
      const steps = await fetchWorkflowSteps(wf.id);
      return { wf, steps };
    },
  });
  const reqQ = useQuery({ queryKey: REQ_QK, queryFn: fetchRehireRequests });
  const rolesQ = useQuery({ queryKey: ["roles"], queryFn: fetchRoles });

  const steps = wfQ.data?.steps ?? [];
  const activeSteps = useMemo(() => steps.filter((s) => s.is_active), [steps]);
  const requests = reqQ.data ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: WF_QK });
    qc.invalidateQueries({ queryKey: REQ_QK });
  };

  const [openRequest, setOpenRequest] = useState<RehireRequest | null>(null);
  useEffect(() => {
    if (!search.request) return;
    const found = requests.find((r) => r.id === search.request);
    if (found) setOpenRequest(found);
  }, [search.request, requests]);

  const pendingForMe = requests.filter((r) => {
    if (r.status !== "pending") return false;
    const step = stepByOrder(activeSteps, r.current_step_order);
    return !!step && (isSuperAdmin || step.approver_role_key === roleKey);
  });

  return (
    <div>
      <PageHeader
        title="Rehire Workflow"
        description="Field Officer raises a rehire against an existing Aadhaar; approvals travel through the configured chain before HR enables the employee with a new employee ID."
        crumbs={[
          { label: "Employees", to: "/admin/employees" },
          { label: "Rehire" },
        ]}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Total requests" value={requests.length} />
        <Stat label="In progress" value={requests.filter((r) => r.status === "pending").length} />
        <Stat label="Awaiting my action" value={pendingForMe.length} />
        <Stat label="Completed" value={requests.filter((r) => r.status === "completed").length} />
      </div>

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Request</th>
                    <th className="px-4 py-3 text-left">Employee</th>
                    <th className="px-4 py-3 text-left">Aadhaar</th>
                    <th className="px-4 py-3 text-left">Current step</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">New employee ID</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                        No rehire requests yet.
                      </td>
                    </tr>
                  ) : (
                    requests.map((r) => {
                      const step = stepByOrder(activeSteps, r.current_step_order);
                      return (
                        <tr key={r.id} className="border-t border-border/70">
                          <td className="px-4 py-3 font-medium">{r.request_number ?? "—"}</td>
                          <td className="px-4 py-3">{r.full_name || "—"}</td>
                          <td className="px-4 py-3 tabular-nums">
                            {r.aadhaar_number.replace(/(\d{4})(?=\d)/g, "$1 ")}
                          </td>
                          <td className="px-4 py-3">
                            {r.status === "pending" ? step?.name ?? "—" : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusChip(r.status)}`}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 tabular-nums">{r.new_employee_code || "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <Button size="sm" variant="outline" onClick={() => setOpenRequest(r)}>
                              Open
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <StepConfig
            steps={steps}
            workflowId={wfQ.data?.wf.id ?? ""}
            isActive={wfQ.data?.wf.is_active ?? false}
            roles={(rolesQ.data ?? []).map((r) => ({ key: r.key, name: r.name }))}
            onChanged={invalidate}
          />
        </TabsContent>
      </Tabs>

      <RequestDialog
        request={openRequest}
        steps={activeSteps}
        roleKey={roleKey}
        isSuperAdmin={isSuperAdmin}
        onClose={() => setOpenRequest(null)}
        onDone={invalidate}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// ------------------------------ configuration ------------------------------

function StepConfig({
  steps,
  workflowId,
  isActive,
  roles,
  onChanged,
}: {
  steps: WorkflowStep[];
  workflowId: string;
  isActive: boolean;
  roles: Array<{ key: string; name: string }>;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ name: string; key: string; role: string; label: string } | null>(
    null,
  );

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Workflow enabled</div>
          <div className="text-xs text-muted-foreground">
            When disabled, field officers cannot raise new rehire requests.
          </div>
        </div>
        <Switch
          checked={isActive}
          disabled={busy || !workflowId}
          onCheckedChange={(v) =>
            run(() => updateWorkflow(workflowId, { is_active: v }), "Workflow updated")
          }
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Step</th>
                <th className="px-4 py-3 text-left">Responsible role</th>
                <th className="px-4 py-3 text-left">Action label</th>
                <th className="px-4 py-3 text-left">Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {steps.map((s, idx) => (
                <tr key={s.id} className="border-t border-border/70">
                  <td className="px-4 py-3 tabular-nums">{s.step_order}</td>
                  <td className="px-4 py-3">
                    <Input
                      className="h-9"
                      defaultValue={s.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== s.name)
                          run(
                            () => upsertWorkflowStep({ id: s.id, workflow_id: workflowId, name: v }),
                            "Step renamed",
                          );
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={s.approver_role_key}
                      onChange={(e) =>
                        run(
                          () =>
                            upsertWorkflowStep({
                              id: s.id,
                              workflow_id: workflowId,
                              approver_role_key: e.target.value,
                            }),
                          "Responsible role updated",
                        )
                      }
                    >
                      {roles.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.name}
                        </option>
                      ))}
                      {!roles.some((r) => r.key === s.approver_role_key) && (
                        <option value={s.approver_role_key}>{s.approver_role_key}</option>
                      )}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      className="h-9"
                      defaultValue={s.action_label}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== s.action_label)
                          run(
                            () =>
                              upsertWorkflowStep({
                                id: s.id,
                                workflow_id: workflowId,
                                action_label: v,
                              }),
                            "Action label updated",
                          );
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={s.is_active}
                      disabled={busy}
                      onCheckedChange={(v) =>
                        run(
                          () => upsertWorkflowStep({ id: s.id, workflow_id: workflowId, is_active: v }),
                          "Step updated",
                        )
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busy || idx === 0}
                        onClick={() => {
                          const ids = steps.map((x) => x.id);
                          [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
                          run(() => reorderWorkflowSteps(ids), "Order updated");
                        }}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busy || idx === steps.length - 1}
                        onClick={() => {
                          const ids = steps.map((x) => x.id);
                          [ids[idx + 1], ids[idx]] = [ids[idx], ids[idx + 1]];
                          run(() => reorderWorkflowSteps(ids), "Order updated");
                        }}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busy}
                        onClick={async () => {
                          const ok = await confirmAction({
                            title: "Remove step?",
                            description: `“${s.name}” will be removed from the chain.`,
                          });
                          if (ok) run(() => deleteWorkflowStep(s.id), "Step removed");
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border/70 p-3">
          <Button
            size="sm"
            variant="outline"
            disabled={!workflowId}
            onClick={() =>
              setDraft({ name: "", key: "", role: roles[0]?.key ?? "", label: "Approve" })
            }
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add step
          </Button>
        </div>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add workflow step</DialogTitle>
            <DialogDescription>
              The new step is appended to the end of the chain. Reorder it afterwards if needed.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div>
                <Label>Step name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Regional Head Approval"
                />
              </div>
              <div>
                <Label>Step key</Label>
                <Input
                  value={draft.key}
                  onChange={(e) =>
                    setDraft({ ...draft, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })
                  }
                  placeholder="regional_head"
                />
              </div>
              <div>
                <Label>Responsible role</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={draft.role}
                  onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                >
                  {roles.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Action label</Label>
                <Input
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !draft?.name.trim() || !draft?.key.trim() || !draft?.role}
              onClick={() => {
                if (!draft) return;
                const nextOrder = (steps[steps.length - 1]?.step_order ?? 0) + 1;
                run(
                  () =>
                    upsertWorkflowStep({
                      workflow_id: workflowId,
                      step_order: nextOrder,
                      key: draft.key.trim(),
                      name: draft.name.trim(),
                      approver_role_key: draft.role,
                      action_label: draft.label.trim() || "Approve",
                      is_active: true,
                    }),
                  "Step added",
                ).then(() => setDraft(null));
              }}
            >
              Add step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ------------------------------ request dialog ------------------------------

function RequestDialog({
  request,
  steps,
  roleKey,
  isSuperAdmin,
  onClose,
  onDone,
}: {
  request: RehireRequest | null;
  steps: WorkflowStep[];
  roleKey: string | null;
  isSuperAdmin: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [notes, setNotes] = useState("");
  useEffect(() => setNotes(""), [request?.id]);

  const eventsQ = useQuery({
    queryKey: ["workflows", "rehire", "events", request?.id],
    enabled: !!request?.id,
    queryFn: () => fetchRehireEvents(request!.id),
  });

  const prevQ = useQuery({
    queryKey: ["workflows", "rehire", "prev-candidate", request?.previous_candidate_id],
    enabled: !!request?.previous_candidate_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("id,full_name,employee_code,candidate_code,mobile,status,offboarded_at")
        .eq("id", request!.previous_candidate_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const currentStep = request ? stepByOrder(steps, request.current_step_order) : null;
  const canAct =
    !!request &&
    request.status === "pending" &&
    !!currentStep &&
    (isSuperAdmin || currentStep.approver_role_key === roleKey);
  const isFinalStep =
    !!currentStep && steps.filter((s) => s.step_order > currentStep.step_order).length === 0;

  const mut = useMutation({
    mutationFn: async (action: "approve" | "reject") => {
      if (!request) return;
      if (action === "reject" && !notes.trim()) throw new Error("A reason is required to reject.");
      return actOnRehireRequest({ request, action, notes: notes.trim() });
    },
    onSuccess: (res) => {
      if (res?.status === "completed")
        toast.success(`Employee enabled with new ID ${res.employeeCode}`);
      else toast.success("Request updated");
      onDone();
      onClose();
    },
    onError: (e) => {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String((e as { message?: unknown }).message)
            : "Action failed";
      toast.error(msg || "Action failed");
    },
  });

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Rehire {request?.request_number ?? ""} — {request?.full_name || "Employee"}
          </DialogTitle>
          <DialogDescription>
            {request?.status === "pending"
              ? `Awaiting: ${currentStep?.name ?? "—"}`
              : `Status: ${request?.status ?? ""}`}
          </DialogDescription>
        </DialogHeader>

        {request && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Aadhaar" value={request.aadhaar_number} />
              <Field label="Mobile" value={request.mobile || "—"} />
              <Field
                label="Previous employee ID"
                value={prevQ.data?.employee_code || prevQ.data?.candidate_code || "—"}
              />
              <Field label="New employee ID" value={request.new_employee_code || "Pending HR"} />
            </div>

            <div className="flex flex-wrap gap-2">
              {request.resignation_url && (
                <a
                  href={request.resignation_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <FileText className="h-3.5 w-3.5" /> Resignation
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {request.id_card_url && (
                <a
                  href={request.id_card_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <FileText className="h-3.5 w-3.5" /> ID card
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {request.notes && (
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                {request.notes}
              </div>
            )}

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Approval chain
              </div>
              <div className="space-y-2">
                {steps.map((s) => {
                  const done =
                    request.status === "completed" || s.step_order < request.current_step_order;
                  const active = request.status === "pending" && s.step_order === request.current_step_order;
                  return (
                    <div key={s.id} className="flex items-center gap-2 text-sm">
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : active ? (
                        <Clock className="h-4 w-4 text-amber-600" />
                      ) : request.status === "rejected" ? (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground/50" />
                      )}
                      <span className={active ? "font-semibold" : ""}>{s.name}</span>
                      <span className="text-xs text-muted-foreground">({s.approver_role_key})</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                History
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {(eventsQ.data ?? []).map((e) => (
                  <div key={e.id}>
                    <span className="font-medium text-foreground">{e.action}</span> · {e.step_name} ·{" "}
                    {e.actor_name || e.actor_role_key} ·{" "}
                    {new Date(e.created_at).toLocaleString("en-IN")}
                    {e.notes ? ` — ${e.notes}` : ""}
                  </div>
                ))}
                {(eventsQ.data ?? []).length === 0 && <div>No activity yet.</div>}
              </div>
            </div>

            {canAct && (
              <div>
                <Label>Remarks</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional for approval, mandatory when rejecting"
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {canAct && (
            <>
              <Button
                variant="destructive"
                disabled={mut.isPending}
                onClick={() => mut.mutate("reject")}
              >
                Reject
              </Button>
              <Button disabled={mut.isPending} onClick={() => mut.mutate("approve")}>
                {isFinalStep ? currentStep?.action_label || "Enable" : currentStep?.action_label || "Approve"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
