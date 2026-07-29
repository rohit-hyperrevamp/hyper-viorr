import { useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileText, Search } from "lucide-react";

export type DocExportPerson = {
  id: string;
  full_name: string | null;
  employee_code?: string | null;
  candidate_code?: string | null;
  mobile?: string | null;
  role_key?: string | null;
  designation_id?: string | null;
  unit_id?: string | null;
  reports_to?: string | null;
};

type Option = { value: string; label: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  people: DocExportPerson[];
  roles: Option[];
  designations: Option[];
  organizations: Option[];
  units: Array<Option & { customerId?: string | null }>;
  managers: Option[];
  labelFor: (p: DocExportPerson) => {
    role: string;
    designation: string;
    organization: string;
    unit: string;
    manager: string;
  };
  organizationOfUnit: (unitId: string | null | undefined) => string;
  onExported?: (count: number) => void;
};

type DocItem = { label: string; url: string };

const ALL = "__all__";

function collectDocs(row: Record<string, any>): DocItem[] {
  const out: DocItem[] = [];
  const push = (label: string, url: unknown) => {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) out.push({ label, url });
  };
  push("Photograph", row.photo_url);
  push("Aadhaar card image", row.aadhaar_image_url);
  push("PAN card image", row.pan_image_url);
  push("Signature", row.signature_url);
  const proofs = Array.isArray(row.identification_proofs) ? row.identification_proofs : [];
  for (const p of proofs) {
    const t = p?.type || "Identification proof";
    push(p?.number ? `${t} (${p.number})` : String(t), p?.url);
  }
  const docs = Array.isArray(row.documents) ? row.documents : [];
  for (const d of docs) push(d?.name || d?.type || "Document", d?.url);
  const off = row.offboarding_details && typeof row.offboarding_details === "object" ? row.offboarding_details : null;
  const exitDocs = off && Array.isArray(off.exit_documents) ? off.exit_documents : [];
  for (const d of exitDocs) push(`Exit · ${d?.label || d?.key || "Document"}`, d?.file_url);
  // de-duplicate by url
  const seen = new Set<string>();
  return out.filter((d) => (seen.has(d.url) ? false : (seen.add(d.url), true)));
}

async function fetchImage(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error("read failed"));
      fr.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 600, h: img.naturalHeight || 800 });
      img.onerror = () => resolve({ w: 600, h: 800 });
      img.src = dataUrl;
    });
    return { dataUrl, ...dims };
  } catch {
    return null;
  }
}

export function EmployeeDocumentsExportDialog({
  open,
  onOpenChange,
  people,
  roles,
  designations,
  organizations,
  units,
  managers,
  labelFor,
  organizationOfUnit,
  onExported,
}: Props) {
  const [role, setRole] = useState(ALL);
  const [designation, setDesignation] = useState(ALL);
  const [organization, setOrganization] = useState(ALL);
  const [unit, setUnit] = useState(ALL);
  const [manager, setManager] = useState(ALL);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const unitOptions = useMemo(
    () => (organization === ALL ? units : units.filter((u) => (u.customerId ?? "") === organization)),
    [units, organization],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (role !== ALL && (p.role_key ?? "") !== role) return false;
      if (designation !== ALL && (p.designation_id ?? "") !== designation) return false;
      if (unit !== ALL && (p.unit_id ?? "") !== unit) return false;
      if (organization !== ALL && organizationOfUnit(p.unit_id) !== organization) return false;
      if (manager !== ALL && (p.reports_to ?? "") !== manager) return false;
      if (q) {
        const hay = `${p.full_name ?? ""} ${p.employee_code ?? ""} ${p.candidate_code ?? ""} ${p.mobile ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [people, role, designation, unit, organization, manager, search, organizationOfUnit]);

  const selectedIds = useMemo(() => filtered.filter((p) => selected[p.id]).map((p) => p.id), [filtered, selected]);
  const allChecked = filtered.length > 0 && selectedIds.length === filtered.length;

  const toggleAll = (v: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const p of filtered) next[p.id] = v;
      return next;
    });
  };

  const resetFilters = () => {
    setRole(ALL);
    setDesignation(ALL);
    setOrganization(ALL);
    setUnit(ALL);
    setManager(ALL);
    setSearch("");
  };

  const exportPdf = async () => {
    const ids = selectedIds;
    if (ids.length === 0) {
      toast.error("Select at least one employee");
      return;
    }
    setBusy(true);
    setProgress("Loading records…");
    try {
      const rows: Record<string, any>[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase
          .from("candidates" as never)
          .select(
            "id,full_name,employee_code,candidate_code,mobile,email,aadhaar_number,pan_number,photo_url,aadhaar_image_url,pan_image_url,signature_url,identification_proofs,documents,offboarding_details,unit_id,designation_id,role_key,reports_to",
          )
          .in("id", ids.slice(i, i + 200));
        if (error) throw error;
        rows.push(...((data as unknown as Record<string, any>[]) ?? []));
      }
      const ordered = ids
        .map((id) => rows.find((r) => r.id === id))
        .filter(Boolean) as Record<string, any>[];

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const M = 40;
      let first = true;
      let totalDocs = 0;

      // Cover
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("Employee Document Pack", M, 70);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Generated ${new Date().toLocaleString("en-IN")}`, M, 90);
      doc.text(`Employees included: ${ordered.length}`, M, 106);
      first = false;

      for (let idx = 0; idx < ordered.length; idx++) {
        const row = ordered[idx];
        const person = people.find((p) => p.id === row.id);
        const meta = person
          ? labelFor(person)
          : { role: "", designation: "", organization: "", unit: "", manager: "" };
        const docs = collectDocs(row);
        totalDocs += docs.length;
        setProgress(`Employee ${idx + 1} of ${ordered.length} — ${docs.length} document(s)`);

        if (!first) doc.addPage();
        first = false;

        doc.setFillColor(241, 245, 249);
        doc.rect(M, 50, pw - M * 2, 96, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text(
          `${idx + 1}. ${row.full_name || "Unnamed"} — ${row.employee_code || row.candidate_code || "—"}`,
          M + 12,
          74,
        );
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const lines = [
          `Role: ${meta.role || "—"}    Designation: ${meta.designation || "—"}`,
          `Organization: ${meta.organization || "—"}    Unit: ${meta.unit || "—"}`,
          `Reports to: ${meta.manager || "—"}    Mobile: ${row.mobile || "—"}`,
          `Aadhaar: ${row.aadhaar_number || "—"}    PAN: ${row.pan_number || "—"}    Documents: ${docs.length}`,
        ];
        lines.forEach((l, i) => doc.text(l, M + 12, 94 + i * 13));

        let y = 168;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("Document index", M, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        y += 14;
        if (docs.length === 0) {
          doc.text("No documents on record.", M, y);
        } else {
          for (const [i, d] of docs.entries()) {
            if (y > ph - M) {
              doc.addPage();
              y = M + 10;
            }
            doc.text(`${i + 1}. ${d.label}`, M, y);
            y += 12;
          }
        }

        for (const [i, d] of docs.entries()) {
          const img = await fetchImage(d.url);
          doc.addPage();
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.text(
            `${row.full_name || "Unnamed"} (${row.employee_code || row.candidate_code || "—"}) · Doc ${i + 1}/${docs.length}`,
            M,
            50,
          );
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(d.label, M, 64);
          if (img) {
            const maxW = pw - M * 2;
            const maxH = ph - 100 - M;
            const scale = Math.min(maxW / img.w, maxH / img.h);
            const w = img.w * scale;
            const h = img.h * scale;
            try {
              doc.addImage(img.dataUrl, M + (maxW - w) / 2, 80, w, h, undefined, "FAST");
            } catch {
              doc.text("Could not render this file.", M, 100);
            }
          } else {
            doc.setTextColor(120);
            doc.text("Preview not available (non-image file). Source link:", M, 96);
            doc.setTextColor(30, 64, 175);
            doc.textWithLink("Open document", M, 112, { url: d.url });
            doc.setTextColor(0);
          }
        }
      }

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const name =
        ordered.length === 1
          ? `documents-${(ordered[0].employee_code || ordered[0].full_name || "employee").toString().replace(/\s+/g, "-")}-${stamp}.pdf`
          : `employee-documents-${ordered.length}-${stamp}.pdf`;
      doc.save(name);
      toast.success(`Exported ${totalDocs} document(s) for ${ordered.length} employee(s)`);
      onExported?.(ordered.length);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Document export failed");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,1000px)] max-w-none flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> Export documents
          </DialogTitle>
          <DialogDescription className="text-xs">
            Filter, select employees and download every document they have as one PDF, clearly separated per employee.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All roles" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">All roles</SelectItem>
              {roles.map((r) => <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={designation} onValueChange={setDesignation}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All designations" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">All designations</SelectItem>
              {designations.map((d) => <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select
            value={organization}
            onValueChange={(v) => { setOrganization(v); setUnit(ALL); }}
          >
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All organizations" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">All organizations</SelectItem>
              {organizations.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All units" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">All units</SelectItem>
              {unitOptions.map((u) => <SelectItem key={u.value} value={u.value} className="text-xs">{u.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={manager} onValueChange={setManager}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All managers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">All managers</SelectItem>
              {managers.map((m) => <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / code / mobile"
              className="h-9 pl-8 text-xs"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
          <label className="flex items-center gap-2 text-xs font-medium">
            <Checkbox checked={allChecked} onCheckedChange={(v) => toggleAll(Boolean(v))} />
            Select all ({filtered.length})
          </label>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[11px]">{selectedIds.length} selected</Badge>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetFilters}>Reset filters</Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No employees match these filters.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Organization</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">Reports to</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const meta = labelFor(p);
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={!!selected[p.id]}
                          onCheckedChange={(v) => setSelected((s) => ({ ...s, [p.id]: Boolean(v) }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{p.full_name || "—"}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {p.employee_code || p.candidate_code || "—"} · {p.mobile || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{meta.role || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{meta.organization || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{meta.unit || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{meta.manager || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{busy ? progress : "One PDF, one section per employee."}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" disabled={busy || selectedIds.length === 0} onClick={() => void exportPdf()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Export PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
