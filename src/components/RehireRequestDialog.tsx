import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useFieldOfficerUnitScope } from "@/lib/use-fo-unit-scope";
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
  /** Already-on-file exit documents pulled from the previous offboarding record. */
  resignation_url?: string | null;
  id_card_url?: string | null;
};

/**
 * Shown when a Field Officer types an Aadhaar that already exists in the
 * system. Any resignation / ID card copy already captured during the previous
 * offboarding is reused — the officer only uploads what is genuinely missing.
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
  const [unitId, setUnitId] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [designationId, setDesignationId] = useState("");

  const { isFieldOfficer, unitIds } = useFieldOfficerUnitScope();

  const unitsQ = useQuery({
    queryKey: ["rehire", "units-lite"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units" as never)
        .select("id,name,code")
        .order("name");
      if (error) throw error;
      return ((data as unknown) as Array<{ id: string; name: string; code: string | null }>) ?? [];
    },
  });

  const rolesQ = useQuery({
    queryKey: ["rehire", "roles-lite"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("roles").select("key,name").order("name");
      if (error) throw error;
      return ((data as unknown) as Array<{ key: string; name: string }>) ?? [];
    },
  });

  const desigQ = useQuery({
    queryKey: ["rehire", "designations-lite"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("designations" as never)
        .select("id,name")
        .order("name");
      if (error) throw error;
      return ((data as unknown) as Array<{ id: string; name: string }>) ?? [];
    },
  });

  const unitOptions = useMemo(() => {
    const all = unitsQ.data ?? [];
    if (!isFieldOfficer) return all;
    return all.filter((u) => unitIds.has(u.id));
  }, [unitsQ.data, isFieldOfficer, unitIds]);

  const roleOptions = useMemo(() => {
    const all = rolesQ.data ?? [];
    // Field officers can only bring people back as frontline guards.
    if (!isFieldOfficer) return all;
    return all.filter((r) => r.key === "guard" || r.key === "security_guard");
  }, [rolesQ.data, isFieldOfficer]);

  const existingResignation = match?.resignation_url || "";
  const existingIdCard = match?.id_card_url || "";
  const missingCount = (existingResignation ? 0 : 1) + (existingIdCard ? 0 : 1);

  const reset = () => {
    setStage("confirm");
    setResignation(null);
    setIdCard(null);
    setNotes("");
    setUnitId("");
    setRoleKey("");
    setDesignationId("");
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  // Pre-select the unit the person previously worked at when it's in reach.
  useEffect(() => {
    if (!open || unitId) return;
    const prev = match?.unit_id ?? "";
    if (prev && unitOptions.some((u) => u.id === prev)) setUnitId(prev);
    else if (unitOptions.length === 1) setUnitId(unitOptions[0].id);
  }, [open, unitId, match?.unit_id, unitOptions]);

  const docSummary = useMemo(() => {
    if (missingCount === 0)
      return "Both the resignation copy and the ID card photo are already on file from the previous exit — just send this for approval.";
    if (missingCount === 2)
      return "No resignation copy or ID card photo is on file. Upload both to continue.";
    return existingResignation
      ? "The resignation copy is already on file. Only the ID card photo is missing — upload it to continue."
      : "The ID card photo is already on file. Only the resignation copy is missing — upload it to continue.";
  }, [missingCount, existingResignation]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!match) throw new Error("No matching employee");
      if (!unitId) throw new Error("Select the unit for this rehire");
      if (!roleKey) throw new Error("Select the role for this rehire");
      if (!existingResignation && !resignation) throw new Error("Resignation copy is required");
      if (!existingIdCard && !idCard) throw new Error("ID card copy is required");
      const aadhaar = (match.aadhaar_number ?? "").replace(/\D/g, "");
      const [resignationUrl, idCardUrl] = await Promise.all([
        resignation ? uploadRehireDocument(resignation, "resignation", aadhaar) : Promise.resolve(existingResignation),
        idCard ? uploadRehireDocument(idCard, "id-card", aadhaar) : Promise.resolve(existingIdCard),
      ]);
      return createRehireRequest({
        previousCandidateId: match.id,
        aadhaarNumber: aadhaar,
        fullName: match.full_name,
        mobile: match.mobile ?? "",
        unitId,
        roleKey,
        designationId: designationId || null,
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
      <DialogContent overlayClassName="z-[140]" className="z-[150] sm:max-w-lg">
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
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {docSummary}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>
                  Unit<span className="text-rose-500"> *</span>
                </Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent className="z-[160]">
                    {unitOptions.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                        {u.code ? ` (${u.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>
                  Role<span className="text-rose-500"> *</span>
                </Label>
                <Select value={roleKey} onValueChange={setRoleKey}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="z-[160]">
                    {roleOptions.map((r) => (
                      <SelectItem key={r.key} value={r.key}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2">
                <Label>Designation</Label>
                <Select value={designationId} onValueChange={setDesignationId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select designation (optional)" />
                  </SelectTrigger>
                  <SelectContent className="z-[160]">
                    {(desigQ.data ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>


            {existingResignation ? (
              <OnFile label="Resignation copy" url={existingResignation} />
            ) : (
              <FilePick label="Resignation copy" file={resignation} onPick={setResignation} required />
            )}

            {existingIdCard ? (
              <OnFile label="ID card copy" url={existingIdCard} />
            ) : (
              <FilePick label="ID card copy" file={idCard} onPick={setIdCard} required />
            )}

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
              {missingCount === 0 ? "Send for approval" : "Upload & send for approval"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OnFile({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        <span className="truncate text-foreground">Already on file from previous exit</span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          View <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
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
