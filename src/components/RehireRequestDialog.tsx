import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createRehireRequest, uploadRehireDocument } from "@/lib/workflows";

export type ExistingCandidateMatch = {
  id: string;
  full_name: string;
  employee_code: string | null;
  candidate_code: string | null;
  mobile: string | null;
  status: string | null;
  aadhaar_number: string | null;
  unit_id?: string | null;
};

/**
 * Shown when a Field Officer types an Aadhaar that already exists in the
 * system. Collects the resignation + ID card copy and kicks off the
 * configurable rehire approval chain.
 */
export function RehireRequestDialog({
  open,
  match,
  onOpenChange,
  onSubmitted,
}: {
  open: boolean;
  match: ExistingCandidateMatch | null;
  onOpenChange: (v: boolean) => void;
  onSubmitted?: () => void;
}) {
  const [stage, setStage] = useState<"confirm" | "docs">("confirm");
  const [resignation, setResignation] = useState<File | null>(null);
  const [idCard, setIdCard] = useState<File | null>(null);
  const [notes, setNotes] = useState("");

  const reset = () => {
    setStage("confirm");
    setResignation(null);
    setIdCard(null);
    setNotes("");
  };

  const mut = useMutation({
    mutationFn: async () => {
      if (!match) throw new Error("No matching employee");
      if (!resignation) throw new Error("Resignation copy is required");
      if (!idCard) throw new Error("ID card copy is required");
      const aadhaar = (match.aadhaar_number ?? "").replace(/\D/g, "");
      const [resignationUrl, idCardUrl] = await Promise.all([
        uploadRehireDocument(resignation, "resignation", aadhaar),
        uploadRehireDocument(idCard, "id-card", aadhaar),
      ]);
      return createRehireRequest({
        previousCandidateId: match.id,
        aadhaarNumber: aadhaar,
        fullName: match.full_name,
        mobile: match.mobile ?? "",
        unitId: match.unit_id ?? null,
        resignationUrl,
        idCardUrl,
        notes,
      });
    },
    onSuccess: (r) => {
      toast.success(`Rehire request ${r.request_number ?? ""} sent for approval`);
      reset();
      onOpenChange(false);
      onSubmitted?.();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not raise rehire request"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            This Aadhaar already exists
          </DialogTitle>
          <DialogDescription>
            {match?.full_name || "This person"} is already in the system as{" "}
            <span className="font-medium text-foreground">
              {match?.employee_code || match?.candidate_code || "an existing record"}
            </span>
            {match?.status ? ` (${match.status})` : ""}. Would you like to re-initiate the hiring
            process?
          </DialogDescription>
        </DialogHeader>

        {stage === "docs" && (
          <div className="space-y-3">
            <FilePick
              label="Resignation copy"
              file={resignation}
              onPick={setResignation}
              required
            />
            <FilePick label="ID card copy" file={idCard} onPick={setIdCard} required />
            <div>
              <Label>Remarks for the approver</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why should this person be rehired?"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {stage === "confirm" ? (
            <Button onClick={() => setStage("docs")}>Re-initiate hiring</Button>
          ) : (
            <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send for approval
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilePick({
  label,
  file,
  onPick,
  required,
}: {
  label: string;
  file: File | null;
  onPick: (f: File | null) => void;
  required?: boolean;
}) {
  return (
    <div>
      <Label>
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </Label>
      <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/40">
        <Upload className="h-4 w-4" />
        <span className="truncate">{file ? file.name : "Choose image or PDF"}</span>
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
    </div>
  );
}
