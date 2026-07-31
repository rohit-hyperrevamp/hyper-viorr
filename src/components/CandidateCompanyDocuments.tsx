import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Loader2, RefreshCw, FileSignature } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentPreview } from "@/components/DocumentPreview";
import { SectionHeader } from "@/components/candidate-extra-sections";
import {
  DOC_TYPE_LABELS,
  downloadBlob,
  ensureFormViiForCandidate,
  generateDocumentPdf,
  type DocType,
} from "@/lib/company-documents";

type SignedDocRow = {
  id: string;
  doc_type: string;
  version: number;
  signed_at: string | null;
  rendered_body: string;
  employee_signature_data: string | null;
  company_signature_data: string | null;
};

export function CandidateCompanyDocuments({
  candidateId,
  employeeName,
  employeeCode,
}: {
  candidateId: string;
  employeeName?: string;
  employeeCode?: string;
}) {
  const qc = useQueryClient();
  const [previewing, setPreviewing] = useState<SignedDocRow | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const QK = ["candidate-signed-docs", candidateId] as const;

  const { data: docs = [], isLoading } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<SignedDocRow[]> => {
      const { data, error } = await supabase
        .from("employee_signed_documents")
        .select(
          "id,doc_type,version,signed_at,rendered_body,employee_signature_data,company_signature_data",
        )
        .eq("candidate_id", candidateId)
        .order("signed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SignedDocRow[];
    },
  });

  const regenMut = useMutation({
    mutationFn: async () => ensureFormViiForCandidate(candidateId, { force: true }),
    onSuccess: (res) => {
      if (res === "no-template") toast.error("No active Form VII master template found");
      else toast.success("Form VII regenerated from the current master template");
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not generate document"),
  });

  // Self-heal: employees activated before this workflow existed (or through a
  // server-side path) get their Form VII generated the first time it is opened.
  const autoTried = useRef(false);
  useEffect(() => {
    if (isLoading || autoTried.current) return;
    if (docs.some((d) => d.doc_type === "form_vii")) return;
    autoTried.current = true;
    void (async () => {
      try {
        const res = await ensureFormViiForCandidate(candidateId);
        if (res === "created") void qc.invalidateQueries({ queryKey: QK });
      } catch {
        /* surfaced via the manual Generate button */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, docs.length, candidateId]);

  async function download(row: SignedDocRow) {
    setDownloading(row.id);
    try {
      const label = DOC_TYPE_LABELS[row.doc_type as DocType] ?? row.doc_type;
      const blob = await generateDocumentPdf({
        title: label,
        body: row.rendered_body,
        employeeSignatureDataUrl: row.employee_signature_data || undefined,
        companySignatureDataUrl: row.company_signature_data || undefined,
        employeeName: employeeName ?? "",
        employeeCode: employeeCode ?? "",
        signedAt: row.signed_at,
      });
      downloadBlob(blob, `${label.replace(/\s+/g, "_")}-${employeeCode || "document"}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate PDF");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Company Documents"
        desc="Statutory documents generated for this employee, signed with their onboarding signature and the company stamp"
      />

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={regenMut.isPending}
          onClick={() => regenMut.mutate()}
        >
          {regenMut.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Generate / Refresh Form VII
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No company documents generated yet. Use “Generate / Refresh Form VII”.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <FileSignature className="h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {DOC_TYPE_LABELS[d.doc_type as DocType] ?? d.doc_type}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    v{d.version}
                    {d.signed_at
                      ? ` · Generated ${new Date(d.signed_at).toLocaleDateString()}`
                      : " · Unsigned"}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setPreviewing(d)}>
                  <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={downloading === d.id}
                  onClick={() => download(d)}
                >
                  {downloading === d.id ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Download PDF
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!previewing} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {previewing
                ? (DOC_TYPE_LABELS[previewing.doc_type as DocType] ?? previewing.doc_type)
                : ""}
            </DialogTitle>
          </DialogHeader>
          <DocumentPreview
            body={previewing?.rendered_body ?? ""}
            employeeSignatureUrl={previewing?.employee_signature_data || undefined}
            companySignatureUrl={previewing?.company_signature_data || undefined}
            className="max-h-[65vh]"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
