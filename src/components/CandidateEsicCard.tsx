import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, IdCard, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionHeader } from "@/components/candidate-extra-sections";
import { useCurrentUserRole } from "@/lib/use-current-user-role";
import { logActivity } from "@/lib/activity-log";

const BUCKET = "candidate-files";
const UPLOAD_ROLES = new Set(["hr", "leadership", "admin", "super_admin"]);
const SIGN_TTL = 60 * 60; // 1 hour

type EsicRow = {
  esic_card_url: string | null;
  esic_card_uploaded_at: string | null;
};

export function CandidateEsicCard({
  candidateId,
  employeeName,
  employeeCode,
}: {
  candidateId: string;
  employeeName?: string;
  employeeCode?: string;
}) {
  const qc = useQueryClient();
  const { roleKey, isSuperAdmin } = useCurrentUserRole();
  const canUpload = isSuperAdmin || UPLOAD_ROLES.has(roleKey ?? "");

  const fileRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const QK = ["candidate-esic-card", candidateId] as const;

  const { data, isLoading } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<EsicRow> => {
      const { data, error } = await supabase
        .from("candidates")
        .select("esic_card_url,esic_card_uploaded_at")
        .eq("id", candidateId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? { esic_card_url: null, esic_card_uploaded_at: null }) as EsicRow;
    },
  });

  const path = data?.esic_card_url ?? null;
  const isPdf = !!path && path.toLowerCase().endsWith(".pdf");

  async function signedUrl(): Promise<string> {
    if (!path) throw new Error("No file");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL);
    if (error || !data?.signedUrl) throw new Error(error?.message || "Could not open the file");
    return data.signedUrl;
  }

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const key = `${candidateId}/esic-card-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(key, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("candidates")
        .update({
          esic_card_url: key,
          esic_card_uploaded_at: new Date().toISOString(),
          esic_card_uploaded_by: auth?.user?.id ?? null,
        } as never)
        .eq("id", candidateId);
      if (error) throw error;
      if (path && path !== key) await supabase.storage.from(BUCKET).remove([path]);
      return key;
    },
    onSuccess: (key) => {
      toast.success("ESIC card uploaded");
      void logActivity({
        module: "Candidate Details",
        action: "ESIC card uploaded",
        entityType: "candidate",
        entityId: candidateId,
        entityLabel: employeeName || employeeCode || candidateId,
        details: { file: key },
      });
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      if (path) await supabase.storage.from(BUCKET).remove([path]);
      const { error } = await supabase
        .from("candidates")
        .update({
          esic_card_url: null,
          esic_card_uploaded_at: null,
          esic_card_uploaded_by: null,
        } as never)
        .eq("id", candidateId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ESIC card removed");
      void logActivity({
        module: "Candidate Details",
        action: "ESIC card deleted",
        entityType: "candidate",
        entityId: candidateId,
        entityLabel: employeeName || employeeCode || candidateId,
      });
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove the card"),
  });

  async function openPreview() {
    setBusy(true);
    try {
      setPreviewUrl(await signedUrl());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the file");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setBusy(true);
    try {
      const url = await signedUrl();
      const a = document.createElement("a");
      a.href = url;
      a.download = `ESIC-Card-${employeeCode || "employee"}.${isPdf ? "pdf" : "jpg"}`;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not download the file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="ESIC Card"
        desc="Scanned copy of the employee's ESIC card, uploaded by HR, leadership or admin"
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (f.size > 10 * 1024 * 1024) {
            toast.error("File must be under 10 MB");
            return;
          }
          uploadMut.mutate(f);
        }}
      />

      {canUpload && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={uploadMut.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {uploadMut.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-3.5 w-3.5" />
            )}
            {path ? "Replace ESIC Card" : "Upload ESIC Card"}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !path ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {canUpload
            ? "No ESIC card uploaded yet. Use “Upload ESIC Card” to add a scan or PDF."
            : "No ESIC card uploaded yet."}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex min-w-0 items-center gap-3">
            <IdCard className="h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">ESIC Card</div>
              <div className="text-xs text-muted-foreground">
                {isPdf ? "PDF" : "Image"}
                {data?.esic_card_uploaded_at
                  ? ` · Uploaded ${new Date(data.esic_card_uploaded_at).toLocaleDateString()}`
                  : ""}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" disabled={busy} onClick={openPreview}>
              <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={download}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Download
            </Button>
            {canUpload && (
              <Button
                variant="outline"
                size="sm"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate()}
              >
                {deleteMut.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                Remove
              </Button>
            )}
          </div>
        </div>
      )}

      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ESIC Card</DialogTitle>
          </DialogHeader>
          {previewUrl ? (
            isPdf ? (
              <iframe src={previewUrl} title="ESIC Card" className="h-[65vh] w-full rounded-md" />
            ) : (
              <img
                src={previewUrl}
                alt={`ESIC card of ${employeeName || "employee"}`}
                className="mx-auto max-h-[65vh] w-auto rounded-md"
              />
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
