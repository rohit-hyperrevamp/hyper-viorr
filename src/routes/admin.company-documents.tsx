import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Edit2,
  Eye,
  FileSignature,
  FileText,
  History,
  Power,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { confirmAction } from "@/components/ConfirmProvider";

import { DocumentPreview } from "@/components/DocumentPreview";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DOC_TYPE_LABELS,
  DOC_TYPE_SHORT,
  PLACEHOLDERS,
  renderTemplate,
  previewPlaceholderMap,
  isHtmlBody,

  type DocType,
  type DocumentTemplate,
} from "@/lib/company-documents";

export const Route = createFileRoute("/admin/company-documents")({
  component: CompanyDocumentsPage,
});

const QK = ["admin", "company-document-templates"] as const;
const MODULE = "Company Documents";

function fmt(d: string) {
  try {
    return new Date(d).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

function useTemplates() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<DocumentTemplate[]> => {
      const { data, error } = await supabase
        .from("company_document_templates")
        .select("*")
        .order("doc_type", { ascending: true })
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DocumentTemplate[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const saveEditMut = useMutation({
    mutationFn: async (p: { id: string; title: string; body: string }) => {
      const { error } = await supabase
        .from("company_document_templates")
        .update({ title: p.title, body: p.body })
        .eq("id", p.id);
      if (error) throw error;
      void logActivity({
        module: MODULE,
        action: "update",
        entityType: "company_document_templates",
        entityId: p.id,
        entityLabel: p.title,
      });
    },
    onSuccess: invalidate,
  });

  /** Publish a brand new version. Archives the current active version of the same doc type. */
  const publishNewMut = useMutation({
    mutationFn: async (p: { docType: DocType; title: string; body: string }) => {
      // Find current max version for this doc type
      const { data: existing, error: e1 } = await supabase
        .from("company_document_templates")
        .select("id,version,is_active,is_archived")
        .eq("doc_type", p.docType)
        .order("version", { ascending: false })
        .limit(1);
      if (e1) throw e1;
      const nextVersion = ((existing?.[0]?.version as number) ?? 0) + 1;

      // Archive any currently-active non-archived row
      const { error: e2 } = await supabase
        .from("company_document_templates")
        .update({ is_active: false, is_archived: true })
        .eq("doc_type", p.docType)
        .eq("is_active", true)
        .eq("is_archived", false);
      if (e2) throw e2;

      // Insert new active version
      const { data: created, error: e3 } = await supabase
        .from("company_document_templates")
        .insert({
          doc_type: p.docType,
          version: nextVersion,
          title: p.title,
          body: p.body,
          is_active: true,
          is_archived: false,
        })
        .select("id")
        .maybeSingle();
      if (e3) throw e3;

      void logActivity({
        module: MODULE,
        action: "create",
        entityType: "company_document_templates",
        entityId: (created?.id as string) ?? "",
        entityLabel: `${DOC_TYPE_SHORT[p.docType]} v${nextVersion}`,
        details: { doc_type: p.docType, version: nextVersion },
      });
      return nextVersion;
    },
    onSuccess: invalidate,
  });

  const archiveMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("company_document_templates")
        .update({ is_archived: true, is_active: false })
        .eq("id", id);
      if (error) throw error;
      void logActivity({
        module: MODULE,
        action: "archive",
        entityType: "company_document_templates",
        entityId: id,
      });
    },
    onSuccess: invalidate,
  });

  const restoreMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("company_document_templates")
        .update({ is_archived: false })
        .eq("id", id);
      if (error) throw error;
      void logActivity({
        module: MODULE,
        action: "restore",
        entityType: "company_document_templates",
        entityId: id,
      });
    },
    onSuccess: invalidate,
  });

  /** Activate a specific version. Archives the previously active row of the same type. */
  const activateMut = useMutation({
    mutationFn: async (t: DocumentTemplate) => {
      const { error: e1 } = await supabase
        .from("company_document_templates")
        .update({ is_active: false, is_archived: true })
        .eq("doc_type", t.doc_type)
        .eq("is_active", true)
        .eq("is_archived", false)
        .neq("id", t.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("company_document_templates")
        .update({ is_active: true, is_archived: false })
        .eq("id", t.id);
      if (e2) throw e2;
      void logActivity({
        module: MODULE,
        action: "enable",
        entityType: "company_document_templates",
        entityId: t.id,
        entityLabel: `${DOC_TYPE_SHORT[t.doc_type]} v${t.version}`,
      });
    },
    onSuccess: invalidate,
  });

  return { items, isLoading, saveEditMut, publishNewMut, archiveMut, restoreMut, activateMut };
}

function CompanyDocumentsPage() {
  const { items, isLoading, saveEditMut, publishNewMut, archiveMut, restoreMut, activateMut } =
    useTemplates();

  const [docType, setDocType] = useState<DocType>("nda");
  const [view, setView] = useState<"active" | "archived">("active");
  const [editing, setEditing] = useState<DocumentTemplate | null>(null);
  const [previewing, setPreviewing] = useState<DocumentTemplate | null>(null);

  const filtered = useMemo(() => {
    return items
      .filter((t) => t.doc_type === docType)
      .filter((t) => (view === "archived" ? t.is_archived : !t.is_archived));
  }, [items, docType, view]);

  

  return (
    <div>
      <PageHeader
        title="Company Documents"
        description="Master templates for NDA and Appointment Letter. Maintain versions, activate or archive."
        crumbs={[
          { label: "Control Center", to: "/admin/control-center" },
          { label: "Company Documents" },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setDocType(t)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
              docType === t
                ? "border-amber-500/40 bg-amber-50 text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300"
                : "border-border bg-card text-muted-foreground hover:border-accent/40 hover:text-foreground",
            )}
          >
            <FileText className="h-4 w-4" />
            {DOC_TYPE_LABELS[t]}
            {items.find((x) => x.doc_type === t && x.is_active && !x.is_archived) && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Active
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(v) => setView(v as "active" | "archived")}>
          <TabsList>
            <TabsTrigger value="active">Active &amp; Past Versions</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted-foreground">
          Editing the active version automatically archives it and creates a new active version.
        </p>
      </div>

      <div className="space-y-3">
        {isLoading && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No {view === "archived" ? "archived" : "active"} versions yet for{" "}
            {DOC_TYPE_LABELS[docType]}.
          </div>
        )}
        {filtered.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-2xl border bg-card p-5 shadow-sm transition-colors",
              t.is_active && !t.is_archived
                ? "border-amber-500/40 bg-amber-50/30 dark:bg-amber-500/5"
                : "border-border",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[11px] font-bold text-muted-foreground">
                    v{t.version}
                  </span>
                  <h3 className="font-display text-base font-bold text-foreground">{t.title}</h3>
                  {t.is_active && !t.is_archived && (
                    <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Active
                    </Badge>
                  )}
                  {t.is_archived && (
                    <Badge variant="outline" className="border-border text-muted-foreground">
                      <Archive className="mr-1 h-3 w-3" /> Archived
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <History className="h-3 w-3" /> Created {fmt(t.created_at)}
                  </span>
                  <span>Updated {fmt(t.updated_at)}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setPreviewing(t)}>
                  <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
                </Button>
                {!t.is_archived && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(t)}>
                    <Edit2 className="mr-1.5 h-3.5 w-3.5" /> Edit
                  </Button>
                )}
                {!t.is_active && !t.is_archived && (
                  <Button
                    size="sm"
                    onClick={() => {
                      activateMut.mutate(t, {
                        onSuccess: () => toast.success("Version activated"),
                        onError: (e) =>
                          toast.error(e instanceof Error ? e.message : "Activate failed"),
                      });
                    }}
                  >
                    <Power className="mr-1.5 h-3.5 w-3.5" /> Make Active
                  </Button>
                )}
                {!t.is_archived && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      archiveMut.mutate(t.id, {
                        onSuccess: () => toast.success("Archived"),
                        onError: (e) =>
                          toast.error(e instanceof Error ? e.message : "Archive failed"),
                      })
                    }
                  >
                    <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive
                  </Button>
                )}
                {t.is_archived && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      restoreMut.mutate(t.id, {
                        onSuccess: () => toast.success("Restored"),
                        onError: (e) =>
                          toast.error(e instanceof Error ? e.message : "Restore failed"),
                      })
                    }
                  >
                    <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" /> Restore
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-3 max-h-32 overflow-hidden rounded-md bg-secondary/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {t.body.slice(0, 360)}
              {t.body.length > 360 && "…"}
            </div>
          </div>
        ))}
      </div>

      {/* Edit dialog (in-place edit on an existing version) */}
      {/* Edit dialog — editing the active version creates a new active version; editing past versions updates in place */}
      <TemplateEditorDialog
        open={!!editing}
        template={editing}
        mode="edit"
        onClose={() => setEditing(null)}
        onSubmit={async (title, body) => {
          if (!editing) return;
          if (editing.is_active && !editing.is_archived) {
            const v = await publishNewMut.mutateAsync({ docType: editing.doc_type, title, body });
            toast.success(`New active version v${v} saved — previous version archived`);
          } else {
            await saveEditMut.mutateAsync({ id: editing.id, title, body });
            toast.success("Template updated");
          }
          setEditing(null);
        }}
      />

      {/* Preview */}
      <Dialog open={!!previewing} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-amber-600" />
              {previewing?.title}{" "}
              <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                v{previewing?.version}
              </span>
            </DialogTitle>
            <DialogDescription>
              Placeholders like <code>$employee_name</code> will be replaced when generating per-employee
              documents.
            </DialogDescription>
          </DialogHeader>
          <DocumentPreview
            body={
              previewing
                ? renderTemplate(previewing.body, previewPlaceholderMap(isHtmlBody(previewing.body)))
                : ""
            }
            className="max-h-[65vh]"
          />

        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateEditorDialog({
  open,
  template,
  mode,
  docType,
  onClose,
  onSubmit,
}: {
  open: boolean;
  template: DocumentTemplate | null;
  mode: "edit" | "publish";
  docType?: DocType;
  onClose: () => void;
  onSubmit: (title: string, body: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset on open
  useMemo(() => {
    if (open) {
      setTitle(template?.title ?? "");
      setBody(template?.body ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id]);

  const effectiveDocType = (template?.doc_type ?? docType) as DocType | undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit"
              ? `Edit ${template ? `v${template.version}` : ""}`
              : `Publish new version${
                  effectiveDocType ? ` — ${DOC_TYPE_LABELS[effectiveDocType]}` : ""
                }`}
          </DialogTitle>
          <DialogDescription>
            {mode === "publish"
              ? "Pre-filled from the currently active version. Publishing will archive the previous active version automatically."
              : "Edit the template in place. Use $placeholders for dynamic fields."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Body</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={20}
                className="font-mono text-xs leading-relaxed"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Available Placeholders
            </Label>
            <div className="space-y-1 rounded-lg border border-border bg-secondary/30 p-2 text-xs">
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setBody((b) => `${b}$${p.key}`)}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-background"
                  title="Click to append"
                >
                  <code className="font-mono text-[11px] text-amber-700 dark:text-amber-300">
                    ${p.key}
                  </code>
                  <span className="truncate text-[10px] text-muted-foreground">{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving || !title.trim() || !body.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await onSubmit(title, body);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Save failed");
              } finally {
                setSaving(false);
              }
            }}
          >
            <Save className="mr-1.5 h-4 w-4" />
            {mode === "publish" ? "Publish" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
