import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, IdCard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { actOnRehireRequest, type RehireRequest } from "@/lib/workflows";
import { autoAttachFormVii } from "@/lib/company-documents";

/**
 * HR enablement prompt for a rehire: keep the previous employee ID, or issue a
 * brand new one. Shared by every Candidates entry point so the
 * decision is always explicit — never silent.
 */
export function RehireEnableDialog({
  request,
  notes,
  onClose,
  onDone,
}: {
  request: RehireRequest | null;
  notes?: string;
  onClose: () => void;
  onDone?: (employeeCode?: string) => void;
}) {
  const qc = useQueryClient();
  const [choice, setChoice] = React.useState<"new" | "same">("new");

  React.useEffect(() => {
    if (request) setChoice("new");
  }, [request?.id]);

  const candidateId = request?.new_candidate_id || request?.previous_candidate_id || null;

  const prevQ = useQuery({
    queryKey: ["rehire-enable-prev", candidateId],
    enabled: !!candidateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("id,full_name,employee_code,candidate_code")
        .eq("id", candidateId!)
        .maybeSingle();
      if (error) throw error;
      return data as { employee_code: string | null; candidate_code: string | null; full_name: string | null } | null;
    },
  });

  const previousCode = (prevQ.data?.employee_code ?? "").trim();

  const mut = useMutation({
    mutationFn: async () => {
      if (!request) throw new Error("No rehire request selected.");
      return actOnRehireRequest({
        request,
        action: "approve",
        notes,
        keepEmployeeCode: choice === "same",
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.employeeCode ? `Enabled · employee ID ${res.employeeCode}` : "Rehire enabled",
      );
      qc.invalidateQueries({ queryKey: ["rehire-pipeline"] });
      qc.invalidateQueries({ queryKey: ["candidates"] });
      onDone?.(res.employeeCode);
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not enable this rehire"),
  });

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[160] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enable {request?.full_name || "employee"}</DialogTitle>
          <DialogDescription>
            Choose how this returning employee should be identified in payroll and records.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => setChoice("new")}
            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
              choice === "new" ? "border-violet-500 bg-violet-500/5" : "border-border hover:bg-muted/40"
            }`}
          >
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                1. Create a new employee record (new employee ID)
              </span>
              <span className="block text-xs text-muted-foreground">
                A fresh EMP number is generated for this new tenure.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setChoice("same")}
            disabled={!previousCode}
            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${
              choice === "same" ? "border-violet-500 bg-violet-500/5" : "border-border hover:bg-muted/40"
            }`}
          >
            <IdCard className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                2. Reactivate the same record (keep employee ID)
              </span>
              <span className="block text-xs text-muted-foreground">
                {previousCode
                  ? `Reuse ${previousCode} — history and records stay under one ID.`
                  : "No previous employee ID on record."}
              </span>
            </span>
          </button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            {mut.isPending ? "Enabling…" : choice === "same" ? "Enable with same ID" : "Enable with new ID"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
