import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Edit2, FileText, Plus, Search, ShieldCheck, Trash2, Upload } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { downloadCsv } from "@/lib/csv-export";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/policy-manager")({
  component: PolicyManagerPage,
});

const BUCKET = "policy-documents";

type Policy = {
  id: string;
  name: string;
  provider: string;
  description: string;
  policyNumber: string;
  startDate: string;
  endDate: string;
  documentPath: string;
  documentName: string;
  enabled: boolean;
};

type Payload = Omit<Policy, "id">;

const QK = ["admin", "policies"] as const;

function rowToPolicy(r: Record<string, unknown>): Policy {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    provider: String(r.provider ?? ""),
    description: String(r.description ?? ""),
    policyNumber: String(r.policy_number ?? ""),
    startDate: r.start_date ? String(r.start_date) : "",
    endDate: r.end_date ? String(r.end_date) : "",
    documentPath: r.document_path ? String(r.document_path) : "",
    documentName: r.document_name ? String(r.document_name) : "",
    enabled: Boolean(r.enabled ?? true),
  };
}

function toRow(p: Payload) {
  return {
    name: p.name.trim(),
    provider: p.provider.trim(),
    description: p.description.trim(),
    policy_number: p.policyNumber.trim(),
    start_date: p.startDate || null,
    end_date: p.endDate || null,
    document_path: p.documentPath || null,
    document_name: p.documentName || null,
    enabled: p.enabled,
  };
}

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}.${m}.${y}`;
}

function usePolicies() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Policy[]> => {
      const { data, error } = await supabase
        .from("policies" as never)
        .select("id,name,provider,description,policy_number,start_date,end_date,document_path,document_name,enabled")
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToPolicy);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.name.trim()) throw new Error("Policy name is required");
      const { error } = await supabase.from("policies" as never).insert(toRow(p) as never);
      if (error) throw error;
      void logActivity({ module: "Policy Manager", action: "create", entityType: "policies", entityLabel: p.name, details: toRow(p) });
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase.from("policies" as never).update(toRow(p) as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Policy Manager", action: "update", entityType: "policies", entityId: id, entityLabel: p.name, details: toRow(p) });
    },
    onSuccess: invalidate,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("policies" as never).update({ enabled } as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Policy Manager", action: enabled ? "enable" : "disable", entityType: "policies", entityId: id, details: { enabled } });
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("policies" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Policy Manager", action: "delete", entityType: "policies", entityId: id });
    },
    onSuccess: invalidate,
  });

  return { items, addMut, updateMut, toggleMut, deleteMut };
}

async function openDocument(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    toast.error(error?.message ?? "Could not open document");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

function PolicyManagerPage() {
  const { items, addMut, updateMut, toggleMut, deleteMut } = usePolicies();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [deleting, setDeleting] = useState<Policy | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.provider.toLowerCase().includes(q) ||
        i.policyNumber.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <div>
      <PageHeader
        title="Policy Manager"
        description="Maintain insurance and company policies — provider, validity, policy number and the master policy document."
        crumbs={[{ label: "Control Center", to: "/admin/control-center" }, { label: "Policy Manager" }]}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search policy, provider, number…"
            className="h-10 rounded-lg pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() =>
              downloadCsv(
                "policies",
                filtered.map((i) => ({
                  name: i.name,
                  provider: i.provider,
                  policyNumber: i.policyNumber,
                  description: i.description,
                  startDate: i.startDate,
                  endDate: i.endDate,
                  enabled: i.enabled ? "Yes" : "No",
                })),
                [
                  { key: "name", header: "Policy Name" },
                  { key: "provider", header: "Provider" },
                  { key: "policyNumber", header: "Policy Number" },
                  { key: "description", header: "Description" },
                  { key: "startDate", header: "Start Date" },
                  { key: "endDate", header: "End Date" },
                  { key: "enabled", header: "Enabled" },
                ],
              )
            }
            className="h-10 rounded-lg"
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export
          </Button>
          <Button
            onClick={() => setAddOpen(true)}
            className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Policy
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-accent/10 px-5 py-2.5 text-xs font-medium text-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{filtered.length}</span>
            <span className="uppercase tracking-[0.14em] text-muted-foreground">Total {filtered.length === 1 ? "policy" : "policies"}</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Policy</th>
                <th className="px-5 py-3">Provider</th>
                <th className="px-5 py-3">Policy Number</th>
                <th className="px-5 py-3">Start</th>
                <th className="px-5 py-3">End</th>
                <th className="px-5 py-3">Master Policy</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((i) => (
                <tr key={i.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-medium text-foreground">
                    <span className="inline-flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {i.name}
                        {i.description && (
                          <span className="block text-xs font-normal text-muted-foreground">{i.description}</span>
                        )}
                      </span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-foreground/90">{i.provider || "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs text-foreground/90">{i.policyNumber || "—"}</td>
                  <td className="px-5 py-3 text-foreground/90">{fmtDate(i.startDate)}</td>
                  <td className="px-5 py-3 text-foreground/90">{fmtDate(i.endDate)}</td>
                  <td className="px-5 py-3">
                    {i.documentPath ? (
                      <button
                        type="button"
                        onClick={() => void openDocument(i.documentPath)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {i.documentName || "View"}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not uploaded</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Switch
                      checked={i.enabled}
                      onCheckedChange={(v) =>
                        toggleMut.mutate(
                          { id: i.id, enabled: v },
                          {
                            onSuccess: () => toast.success(v ? "Enabled" : "Disabled"),
                            onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
                          },
                        )
                      }
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditing(i)}
                        aria-label="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleting(i)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    No policies found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PolicyFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Policy"
        onSubmit={async (p) => {
          try {
            await addMut.mutateAsync(p);
            toast.success("Policy added");
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not add policy";
          }
        }}
      />

      <PolicyFormDialog
        open={!!editing}
        initial={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit Policy"
        onSubmit={async (p) => {
          if (!editing) return null;
          try {
            await updateMut.mutateAsync({ id: editing.id, p });
            toast.success("Policy updated");
            setEditing(null);
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not update policy";
          }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this policy?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && <span className="font-semibold text-foreground">{deleting.name}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await deleteMut.mutateAsync(deleting.id);
                  toast.success("Policy deleted");
                  setDeleting(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Delete failed");
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PolicyFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial?: Policy | null;
  onSubmit: (p: Payload) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [description, setDescription] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [documentPath, setDocumentPath] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useResetOnOpen(open, () => {
    setName(initial?.name ?? "");
    setProvider(initial?.provider ?? "");
    setDescription(initial?.description ?? "");
    setPolicyNumber(initial?.policyNumber ?? "");
    setStartDate(initial?.startDate ?? "");
    setEndDate(initial?.endDate ?? "");
    setDocumentPath(initial?.documentPath ?? "");
    setDocumentName(initial?.documentName ?? "");
    setEnabled(initial?.enabled ?? true);
  });

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "pdf";
      const path = `${initial?.id ?? "new"}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
      if (error) throw error;
      setDocumentPath(path);
      setDocumentName(file.name);
      toast.success("Master policy uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Policy details, validity and the master policy document.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto py-2 pr-1">
          <div className="grid gap-2">
            <Label>Policy name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Policy Staff" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Provider</Label>
              <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. The New India Assurance" />
            </div>
            <div className="grid gap-2">
              <Label>Policy number</Label>
              <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="215037/51/26/000084" />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>End date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Addition / Deletion in existing Policy"
              rows={3}
            />
          </div>
          <div className="grid gap-2">
            <Label>Master policy document</Label>
            <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <input
                id="policy-doc"
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadFile(f);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => document.getElementById("policy-doc")?.click()}
              >
                <Upload className="mr-1.5 h-4 w-4" />
                {uploading ? "Uploading…" : documentPath ? "Replace" : "Upload"}
              </Button>
              {documentPath ? (
                <button
                  type="button"
                  onClick={() => void openDocument(documentPath)}
                  className="truncate text-xs font-semibold text-accent hover:underline"
                >
                  {documentName || "View document"}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">No document uploaded</span>
              )}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <AmountLakhField label="Sum assured" value={sumAssured} onChange={setSumAssured} />
            <AmountLakhField label="Additional cover" value={additionalCover} onChange={setAdditionalCover} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium">TTD enabled</div>
              <div className="text-xs text-muted-foreground">Temporary Total Disablement cover</div>
            </div>
            <Switch checked={ttdEnabled} onCheckedChange={setTtdEnabled} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Enabled</div>
              <div className="text-xs text-muted-foreground">Active policy</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving || uploading}
            onClick={async () => {
              setSaving(true);
              const err = await onSubmit({
                name,
                provider,
                description,
                policyNumber,
                startDate,
                endDate,
                documentPath,
                documentName,
                enabled,
                sumAssured,
                additionalCover,
                ttdEnabled,
              });
              setSaving(false);
              if (err) toast.error(err);
              else onOpenChange(false);
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useResetOnOpen(open: boolean, reset: () => void) {
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    if (open) reset();
  }
}
