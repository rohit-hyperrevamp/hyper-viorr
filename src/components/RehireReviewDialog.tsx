import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Clock, ExternalLink, FileText, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RehireEnableDialog } from "@/components/RehireEnableDialog";
import { supabase } from "@/integrations/supabase/client";
import {
  actOnRehireRequest,
  fetchRehireEvents,
  stepByOrder,
  type RehireRequest,
  type WorkflowStep,
} from "@/lib/workflows";

export function RehireReviewDialog({
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
  const [enableOpen, setEnableOpen] = useState(false);

  useEffect(() => {
    setNotes("");
    setEnableOpen(false);
  }, [request?.id]);

  const eventsQ = useQuery({
    queryKey: ["workflows", "rehire", "events", request?.id],
    enabled: !!request?.id,
    queryFn: () => {
      if (!request) throw new Error("No rehire request selected.");
      return fetchRehireEvents(request.id);
    },
  });

  const prevQ = useQuery({
    queryKey: ["workflows", "rehire", "prev-candidate", request?.previous_candidate_id],
    enabled: !!request?.previous_candidate_id,
    queryFn: async () => {
      if (!request?.previous_candidate_id) return null;
      const { data, error } = await supabase
        .from("candidates")
        .select("id,full_name,employee_code,candidate_code,mobile,status,offboarded_at")
        .eq("id", request.previous_candidate_id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        employee_code: string | null;
        candidate_code: string | null;
        status: string | null;
      } | null;
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
      if (!request) throw new Error("No rehire request selected.");
      if (action === "reject" && !notes.trim()) throw new Error("A reason is required to reject.");
      return actOnRehireRequest({ request, action, notes: notes.trim() });
    },
    onSuccess: (res) => {
      toast.success(res?.status === "completed" ? `Employee enabled with new ID ${res.employeeCode}` : "Request updated");
      onDone();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });

  return (
    <>
      <Dialog open={!!request} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Rehire {request?.request_number ?? ""} — {request?.full_name || "Employee"}
            </DialogTitle>
            <DialogDescription>
              {request?.status === "pending"
                ? `Candidate approval pending with: ${currentStep?.name ?? "—"}`
                : `Status: ${request?.status ?? ""}`}
            </DialogDescription>
          </DialogHeader>

          {request && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Aadhaar" value={request.aadhaar_number} />
                <Field label="Mobile" value={request.mobile || "—"} />
                <Field label="Previous employee ID" value={prevQ.data?.employee_code || prevQ.data?.candidate_code || "—"} />
                <Field label="New employee ID" value={request.new_employee_code || "Pending HR"} />
              </div>

              <div className="flex flex-wrap gap-2">
                {request.resignation_url && <DocumentPill href={request.resignation_url} label="Resignation" />}
                {request.id_card_url && <DocumentPill href={request.id_card_url} label="ID card" />}
              </div>

              {request.notes && (
                <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                  {request.notes}
                </div>
              )}

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Candidate approval chain
                </div>
                <div className="space-y-2">
                  {steps.map((s) => {
                    const done = request.status === "completed" || s.step_order < request.current_step_order;
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
                        <span className="text-xs text-muted-foreground">({s.approver_role_key.replace(/_/g, " ")})</span>
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
                  {(eventsQ.data ?? []).map((event) => (
                    <div key={event.id}>
                      <span className="font-medium text-foreground">{event.action}</span> · {event.step_name} ·{" "}
                      {event.actor_name || event.actor_role_key} · {new Date(event.created_at).toLocaleString("en-IN")}
                      {event.notes ? ` — ${event.notes}` : ""}
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
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Optional for approval, mandatory when rejecting"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
            {canAct && (
              <>
                <Button variant="destructive" disabled={mut.isPending} onClick={() => mut.mutate("reject")}>
                  Reject
                </Button>
                <Button
                  disabled={mut.isPending}
                  onClick={() => {
                    if (isFinalStep) setEnableOpen(true);
                    else mut.mutate("approve");
                  }}
                >
                  {isFinalStep ? currentStep?.action_label || "Enable" : currentStep?.action_label || "Approve"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RehireEnableDialog
        request={enableOpen ? request : null}
        notes={notes.trim()}
        onClose={() => setEnableOpen(false)}
        onDone={() => {
          onDone();
          onClose();
        }}
      />
    </>
  );
}

function DocumentPill({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
    >
      <FileText className="h-3.5 w-3.5" /> {label}
      <ExternalLink className="h-3 w-3" />
    </a>
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