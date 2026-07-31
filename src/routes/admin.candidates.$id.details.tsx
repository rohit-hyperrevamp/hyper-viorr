import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { toast } from "sonner";
import { confirmAction } from "@/components/ConfirmProvider";
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Loader2,
  Activity,
  ShieldCheck,
  GraduationCap,
  Heart,
  Phone,
  FileBadge,
  Gavel,
  AlertTriangle,
  UserCheck,
  Building2,
  Star,
  Plus,
  Trash2,
  Briefcase,
  Undo2,
  FileText,
  FileSignature,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  emptyProof,
  emptyContact,
  SectionHeader,
  Field,
  PhysicalSection,
  ComplianceSection,
  KnowledgeSection,
  CriminalSection,
  ListSection,
  IdentificationSection,
  NomineeSection,
} from "@/components/candidate-extra-sections";
import { useCurrentPermissions } from "@/lib/rbac";
import { OffboardingRecordsSection } from "@/components/offboarding-records-section";
import { CandidateCompanyDocuments } from "@/components/CandidateCompanyDocuments";
import { CandidateEsicCard } from "@/components/CandidateEsicCard";
import { ensureFormViiForCandidate, ensureIdCardForCandidate } from "@/lib/company-documents";


const MODULE = "Candidate Details";

const SECTIONS = [
  { id: "basic", label: "Basic Info", icon: Activity },
  { id: "units", label: "Unit Mapping", icon: Building2 },
  { id: "compliance", label: "Compliance", icon: ShieldCheck },
  { id: "knowledge", label: "Knowledge & Experience", icon: GraduationCap },
  { id: "physical", label: "Physical & Health", icon: Heart },
  { id: "contacts", label: "Contacts", icon: Phone },
  { id: "identification", label: "Identification Proofs", icon: FileBadge },
  { id: "criminal", label: "Criminal History", icon: Gavel },
  { id: "nominee", label: "Nominee", icon: UserCheck },
  { id: "office_assets", label: "Office Assets", icon: Briefcase },
  { id: "company_docs", label: "Company Documents", icon: FileSignature },
  { id: "esic_card", label: "ESIC Card", icon: FileBadge },
  { id: "offboarding", label: "Offboarding Docs", icon: FileText },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function normalizeCandidate(data: any) {
  return {
    ...data,
    physical_health: data.physical_health ?? {},
    compliance: data.compliance ?? {},
    identification_proofs: Array.isArray(data.identification_proofs)
      ? data.identification_proofs
      : [],
    criminal_history:
      data.criminal_history && typeof data.criminal_history === "object"
        ? data.criminal_history
        : { has_history: false, incidents: [] },
    extra_curricular: Array.isArray(data.extra_curricular) ? data.extra_curricular : [],
    other_info: data.other_info ?? {},
    documents: Array.isArray(data.documents) ? data.documents : [],
    nominations: Array.isArray(data.nominations) ? data.nominations : [],
    contacts: Array.isArray(data.contacts) ? data.contacts : [],
  };
}

function buildCandidatePayload(form: any) {
  return {
    physical_health: form.physical_health,
    compliance: form.compliance,
    identification_proofs: form.identification_proofs,
    criminal_history: form.criminal_history,
    extra_curricular: form.extra_curricular,
    other_info: form.other_info,
    documents: form.documents,
    nominations: form.nominations,
    contacts: form.contacts,
    kyc_completed: form.kyc_completed ?? false,
    status: form.status,
    non_billable: form.non_billable ?? false,
    is_disabled: form.is_disabled ?? false,
    rejection_reason: form.rejection_reason ?? "",
  };
}

export const Route = createFileRoute("/admin/candidates/$id/details")({
  validateSearch: (search: Record<string, unknown>) => ({
    section: typeof search.section === "string" ? search.section : undefined,
  }),
  component: CandidateDetailsPage,
});

function CandidateDetailsPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const initialSection = SECTIONS.some((s) => s.id === search.section) ? (search.section as SectionId) : "basic";
  const [active, setActive] = useState<SectionId>(initialSection);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [baselinePayload, setBaselinePayload] = useState<string>("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["candidate-details", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: esicBranchesData } = useQuery({
    queryKey: ["esic-branches-lite"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("esic_branches" as never)
        .select("id,location,esic_code,enabled")
        .eq("enabled", true)
        .order("location", { ascending: true });
      if (error) throw error;
      return (data as unknown) as Array<{ id: string; location: string; esic_code: string }>;
    },
  });
  const esicBranches = esicBranchesData ?? [];

  useEffect(() => {
    if (!data) return;
    const normalized = normalizeCandidate(data);
    setForm(normalized);
    setBaselinePayload(JSON.stringify(buildCandidatePayload(normalized)));
  }, [data]);

  const set = (path: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [path]: value }));
  };
  const setSection = (key: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [key]: { ...(prev?.[key] ?? {}), ...value } }));
  };

  const dirty = useMemo(() => {
    if (!form || !baselinePayload) return false;
    return JSON.stringify(buildCandidatePayload(form)) !== baselinePayload;
  }, [form, baselinePayload]);

  const { roleKey, isSuperAdmin } = useCurrentPermissions();
  const canEditInactiveProfile = isSuperAdmin || roleKey === "leadership" || roleKey === "super_admin";
  const editLocked = form?.status === "inactive" && !canEditInactiveProfile;

  const handleSave = async (closeAfter = false) => {
    if (!form) return;
    if (editLocked) {
      toast.error("Only leadership or super admin can edit an inactive employee's profile.");
      return;
    }
    setSaving(true);
    try {
      const payload = buildCandidatePayload(form);
      const { data: updated, error } = await supabase.from("candidates").update(payload).eq("id", id).select("id");
      if (error) throw error;
      if (!updated || updated.length === 0) {
        throw new Error("You do not have permission to edit this employee.");
      }
      await logActivity({
        module: MODULE,
        action: "update",
        entityType: "candidate",
        entityId: id,
        entityLabel: form.full_name || id,
      });
      const [formResult, cardResult] = await Promise.all([
        ensureFormViiForCandidate(id, { force: true }),
        ensureIdCardForCandidate(id, { force: true }),
      ]);
      if (formResult === "no-template" || cardResult === "no-template") {
        toast.warning("Profile saved, but an active company-document template is missing");
      } else {
        toast.success("Saved — company documents updated automatically");
      }
      setBaselinePayload(JSON.stringify(payload));
      if (closeAfter) navigate({ to: "/admin/employees" });
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };


  // markKyc removed per product decision

  const changeStatus = async (
    next: "approved" | "rejected" | "pending",
    reason = "",
  ) => {
    setStatusBusy(true);
    try {
      // Approval immediately promotes the candidate to an "active" employee
      // so they appear in attendance rosters and the Active stat tile.
      const dbStatus = next === "approved" ? "active" : next;
      const { error } = await supabase
        .from("candidates")
        .update({ status: dbStatus, rejection_reason: reason })
        .eq("id", id);
      if (error) throw error;
      setForm((p: any) => {
        const updated = { ...p, status: dbStatus, rejection_reason: reason };
        setBaselinePayload(JSON.stringify(buildCandidatePayload(updated)));
        return updated;
      });
      await logActivity({
        module: MODULE,
        action: next === "approved" ? "approve" : next === "rejected" ? "reject" : "resubmit",
        entityType: "candidate",
        entityId: id,
        entityLabel: form?.full_name || id,
        details: reason ? { reason } : undefined,
      });
      toast.success(
        next === "approved" ? "Candidate approved" :
        next === "rejected" ? "Candidate rejected" :
        "Candidate resubmitted for review",
      );
    } catch (e: any) {
      toast.error(e.message || "Failed to update status");
    } finally {
      setStatusBusy(false);
    }
  };

  const submitReject = async () => {
    if (!rejectReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    await changeStatus("rejected", rejectReason.trim());
    setRejectOpen(false);
    setRejectReason("");
  };

  if (isLoading || !form) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">Edit Candidate</h1>
              {form.candidate_code && (
                <Badge variant="outline" className="font-mono text-xs">
                  {form.candidate_code}
                </Badge>
              )}
              <StatusPill status={form.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {form.full_name || "—"} · {form.mobile || "no mobile"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {form.status === "pending" && (
            <Button
              size="sm"
              onClick={() => changeStatus("approved")}
              disabled={statusBusy}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {statusBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Approve
            </Button>
          )}
          {form.status === "pending" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setRejectOpen(true)}
              disabled={statusBusy}
            >
              <XCircle className="mr-2 h-4 w-4" /> Reject
            </Button>
          )}
          {form.status === "rejected" && (
            <Button
              size="sm"
              onClick={() => changeStatus("pending", "")}
              disabled={statusBusy}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {statusBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Resubmit for Review
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={() => router.history.back()}>
            Cancel
          </Button>
          {dirty && (
            <>
              <Button size="sm" onClick={() => handleSave(false)} disabled={saving || editLocked} title={editLocked ? "Only leadership or super admin can edit an inactive profile." : undefined}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
              <Button size="sm" onClick={() => handleSave(true)} disabled={saving || editLocked} title={editLocked ? "Only leadership or super admin can edit an inactive profile." : undefined}>
                Save & Close
              </Button>
            </>
          )}

        </div>
      </div>

      {form.status === "rejected" && form.rejection_reason && (
        <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm dark:border-rose-900/40 dark:bg-rose-950/30">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div>
            <div className="font-semibold text-rose-700 dark:text-rose-300">Rejected</div>
            <div className="text-rose-700/90 dark:text-rose-200/90">{form.rejection_reason}</div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Section tabs (horizontal) */}
        <nav className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
          {SECTIONS.filter(
            (s) =>
              s.id !== "esic_card" ||
              ["approved", "active"].includes(String(form.status ?? "").toLowerCase()),
          ).map((s) => {
            const Icon = s.icon;
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <section className="rounded-lg border bg-card p-6">
          {active === "basic" && <BasicSection form={form} />}
          {active === "units" && <UnitMappingSection candidateId={id} primaryUnitId={form.unit_id ?? null} />}
          {active === "physical" && (
            <PhysicalSection form={form} setSection={setSection} set={set} />
          )}
          {active === "compliance" && (
            <ComplianceSection form={form} setSection={setSection} esicBranches={esicBranches} />
          )}
          {active === "knowledge" && (
            <KnowledgeSection form={form} set={set} />
          )}
          {active === "contacts" && (
            <ListSection
              title="Contacts"
              description="Additional contact persons for this candidate"
              items={form.contacts}
              onChange={(v) => set("contacts", v)}
              empty={emptyContact}
              fields={[
                { key: "name", label: "Name" },
                { key: "relation", label: "Relation" },
                { key: "phone", label: "Phone" },
                { key: "email", label: "Email" },
              ]}
            />
          )}
          {active === "identification" && (
            <IdentificationSection form={form} set={set} setSection={setSection} />
          )}
          {active === "criminal" && (
            <CriminalSection form={form} set={set} />
          )}
          {active === "nominee" && (
            <NomineeSection form={form} setSection={setSection} set={set} />
          )}
          {active === "office_assets" && (
            <OfficeAssetsSection candidateId={id} candidate={form} onToggleNonBillable={(v: boolean) => set("non_billable", v)} />
          )}
          {active === "company_docs" && (
            <CandidateCompanyDocuments
              candidateId={id}
              employeeName={form.full_name || ""}
              employeeCode={form.employee_code || form.candidate_code || ""}
            />
          )}
          {active === "esic_card" &&
            ["approved", "active"].includes(String(form.status ?? "").toLowerCase()) && (
              <CandidateEsicCard
                candidateId={id}
                employeeName={form.full_name || ""}
                employeeCode={form.employee_code || form.candidate_code || ""}
              />
            )}
          {active === "offboarding" && (
            <OffboardingRecordsSection details={form.offboarding_details} />
          )}
        </section>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject candidate</DialogTitle>
            <DialogDescription>
              Provide a reason. The candidate can be resubmitted for review after edits.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection…"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={statusBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submitReject} disabled={statusBusy}>
              {statusBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-slate-500/15 text-slate-600",
    pending: "bg-amber-500/15 text-amber-600",
    approved: "bg-emerald-500/15 text-emerald-600",
    active: "bg-emerald-500/15 text-emerald-600",
    inactive: "bg-slate-500/15 text-slate-600",
    rejected: "bg-rose-500/15 text-rose-600",
  };
  const label = status === "approved" ? "active" : status;
  return (
    <Badge className={`border-0 font-semibold capitalize ${map[status] ?? "bg-secondary text-foreground"}`}>
      {label || "—"}
    </Badge>
  );
}

/* ---------- Section components ---------- */

function BasicSection({ form }: { form: any }) {
  return (
    <div>
      <SectionHeader title="Basic Info" desc="Read-only. Edit via the candidate wizard." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Candidate Code"><Input value={form.candidate_code || "—"} readOnly className="font-mono" /></Field>
        <Field label="Full Name"><Input value={form.full_name || ""} readOnly /></Field>
        <Field label="Mobile"><Input value={form.mobile || ""} readOnly /></Field>
        <Field label="Email"><Input value={form.email || ""} readOnly /></Field>
        <Field label="DOB"><Input value={form.date_of_birth || ""} readOnly /></Field>
        <Field label="Gender"><Input value={form.gender || ""} readOnly /></Field>
        <Field label="Aadhaar"><Input value={form.aadhaar_number || ""} readOnly /></Field>
      </div>
    </div>
  );
}

/* ---------- Unit Mapping ---------- */

type UnitRow = { id: string; code: string; name: string; location: string; customer_id: string | null };
type CandidateUnitRow = { id: string; unit_id: string; is_primary: boolean; sort_order: number };

function UnitMappingSection({ candidateId, primaryUnitId }: { candidateId: string; primaryUnitId: string | null }) {
  const [busy, setBusy] = useState(false);
  const [addUnitId, setAddUnitId] = useState<string>("");

  const unitsQ = useQuery({
    queryKey: ["units-for-mapping"],
    staleTime: 60_000,
    queryFn: async (): Promise<UnitRow[]> => {
      const { data, error } = await supabase
        .from("units" as never)
        .select("id,code,name,location,customer_id")
        .order("code", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as UnitRow[]) ?? [];
    },
  });

  const mappingsQ = useQuery({
    queryKey: ["candidate-units", candidateId],
    queryFn: async (): Promise<CandidateUnitRow[]> => {
      const { data, error } = await supabase
        .from("candidate_units" as never)
        .select("id,unit_id,is_primary,sort_order")
        .eq("candidate_id", candidateId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as CandidateUnitRow[]) ?? [];
    },
  });

  const units = unitsQ.data ?? [];
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const mappings = mappingsQ.data ?? [];
  const mappedIds = new Set(mappings.map((m) => m.unit_id));
  const available = units.filter((u) => !mappedIds.has(u.id));

  const refresh = () => mappingsQ.refetch();

  const addMapping = async () => {
    if (!addUnitId) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("candidate_units" as never)
        .insert({
          candidate_id: candidateId,
          unit_id: addUnitId,
          is_primary: mappings.length === 0,
          sort_order: mappings.length,
        } as never);
      if (error) throw error;
      await logActivity({
        module: MODULE,
        action: "add_unit_mapping",
        entityType: "candidate",
        entityId: candidateId,
        details: { unit_id: addUnitId },
      });
      toast.success("Unit mapped");
      setAddUnitId("");
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to map unit");
    } finally {
      setBusy(false);
    }
  };

  const removeMapping = async (row: CandidateUnitRow) => {
    if (!(await confirmAction({ title: "Remove unit mapping?", description: "This will unmap the employee from this unit.", confirmText: "Remove" }))) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("candidate_units" as never).delete().eq("id", row.id);
      if (error) throw error;
      await logActivity({
        module: MODULE,
        action: "remove_unit_mapping",
        entityType: "candidate",
        entityId: candidateId,
        details: { unit_id: row.unit_id },
      });
      toast.success("Mapping removed");
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to remove");
    } finally {
      setBusy(false);
    }
  };

  const setPrimary = async (row: CandidateUnitRow) => {
    setBusy(true);
    try {
      // Unset previous primary
      const { error: e1 } = await supabase
        .from("candidate_units" as never)
        .update({ is_primary: false } as never)
        .eq("candidate_id", candidateId);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("candidate_units" as never)
        .update({ is_primary: true } as never)
        .eq("id", row.id);
      if (e2) throw e2;
      // Mirror into candidates.unit_id for compatibility
      await supabase.from("candidates").update({ unit_id: row.unit_id }).eq("id", candidateId);
      await logActivity({
        module: MODULE,
        action: "set_primary_unit",
        entityType: "candidate",
        entityId: candidateId,
        details: { unit_id: row.unit_id },
      });
      toast.success("Primary unit updated");
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to update primary");
    } finally {
      setBusy(false);
    }
  };

  const loading = unitsQ.isLoading || mappingsQ.isLoading;

  return (
    <div>
      <SectionHeader
        title="Unit Mapping"
        desc="Map this employee to one or more units. Mark one as primary — it mirrors to the employee's main unit."
      />

      {primaryUnitId && !mappings.some((m) => m.unit_id === primaryUnitId) && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
          <div>
            <div className="font-medium text-amber-700 dark:text-amber-300">
              Current primary unit: {unitMap.get(primaryUnitId)?.code ?? "—"} {unitMap.get(primaryUnitId)?.name ?? ""}
            </div>
            <div className="text-amber-700/80 dark:text-amber-200/80">
              Not present in mappings yet. Add it below to manage from here.
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[260px]">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Add unit</label>
          <select
            value={addUnitId}
            onChange={(e) => setAddUnitId(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            disabled={busy || loading}
          >
            <option value="">Select a unit…</option>
            {available.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} — {u.name} {u.location ? `(${u.location})` : ""}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" onClick={addMapping} disabled={!addUnitId || busy}>
          <Plus className="mr-2 h-4 w-4" /> Add mapping
        </Button>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : mappings.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No units mapped yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="ios-table w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Unit</th>
                <th className="px-3 py-2 text-left">Location</th>
                <th className="px-3 py-2 text-left">Primary</th>
                <th className="px-3 py-2 text-right" data-col="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => {
                const u = unitMap.get(m.unit_id);
                return (
                  <tr key={m.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{u?.code ?? "—"}</td>
                    <td className="px-3 py-2">{u?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{u?.location ?? "—"}</td>
                    <td className="px-3 py-2">
                      {m.is_primary ? (
                        <Badge className="border-0 bg-amber-500/15 font-semibold text-amber-600">
                          <Star className="mr-1 h-3 w-3 fill-current" /> Primary
                        </Badge>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setPrimary(m)} disabled={busy}>
                          <Star className="mr-1 h-3 w-3" /> Set primary
                        </Button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => removeMapping(m)} disabled={busy}>
                        <Trash2 className="h-4 w-4 text-rose-600" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OfficeAssetsSection({ candidateId, candidate, onToggleNonBillable }: { candidateId: string; candidate: any; onToggleNonBillable: (v: boolean) => void }) {
  const isNonBillable = candidate?.non_billable === true;

  const allocsQ = useQuery({
    queryKey: ["candidate-office-allocs", candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("office_asset_allocations" as never)
        .select("id,unit_id,allocated_at,returned_at,condition_out,condition_in,notes")
        .eq("candidate_id", candidateId)
        .order("allocated_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Array<{ id: string; unit_id: string; allocated_at: string; returned_at: string | null; condition_out: string; condition_in: string; notes: string }>;
    },
  });
  const unitIds = (allocsQ.data ?? []).map((a) => a.unit_id);
  const unitsQ = useQuery({
    queryKey: ["candidate-office-units", unitIds.sort().join(",")],
    enabled: unitIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("office_asset_units" as never).select("id,tag,asset_id,branch_id").in("id", unitIds);
      if (error) throw error;
      return data as unknown as Array<{ id: string; tag: string; asset_id: string; branch_id: string | null }>;
    },
  });
  const assetIds = (unitsQ.data ?? []).map((u) => u.asset_id);
  const assetsQ = useQuery({
    queryKey: ["candidate-office-assets", assetIds.sort().join(",")],
    enabled: assetIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("office_assets" as never).select("id,name").in("id", assetIds);
      if (error) throw error;
      return data as unknown as Array<{ id: string; name: string }>;
    },
  });

  async function toggle(v: boolean) {
    onToggleNonBillable(v);
    const { error } = await supabase.from("candidates").update({ non_billable: v } as never).eq("id", candidateId);
    if (error) toast.error(error.message); else toast.success(v ? "Marked non-billable" : "Removed non-billable flag");
  }

  async function returnIt(allocId: string, unitId: string) {
    const ok = await confirmAction({ title: "Return asset?", description: "Mark this office asset as returned to stock.", confirmText: "Return" });
    if (!ok) return;
    const { error: e1 } = await supabase.from("office_asset_allocations" as never).update({ returned_at: new Date().toISOString(), condition_in: "good" } as never).eq("id", allocId);
    if (e1) { toast.error(e1.message); return; }
    const { error: e2 } = await supabase.from("office_asset_units" as never).update({ status: "in_stock" } as never).eq("id", unitId);
    if (e2) { toast.error(e2.message); return; }
    toast.success("Returned");
    allocsQ.refetch();
  }

  const active = (allocsQ.data ?? []).filter((a) => !a.returned_at);
  const history = (allocsQ.data ?? []).filter((a) => a.returned_at);
  const unitMap = new Map((unitsQ.data ?? []).map((u) => [u.id, u]));
  const assetMap = new Map((assetsQ.data ?? []).map((a) => [a.id, a]));

  return (
    <div className="space-y-5">
      <SectionHeader title="Office Assets" desc="Company-owned equipment allocated to this resource. Only non-billable resources are eligible." />

      <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
        <div>
          <div className="font-semibold text-sm">Non-Billable Resource</div>
          <div className="text-xs text-muted-foreground">Enable to make this person eligible for office-asset allocation (finance, HR, IT, etc.).</div>
        </div>
        <button
          type="button"
          onClick={() => toggle(!isNonBillable)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${isNonBillable ? "bg-emerald-500" : "bg-muted"}`}
          aria-label="Toggle non-billable"
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${isNonBillable ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      {!isNonBillable && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Mark this resource as non-billable above to allocate office assets.
        </div>
      )}

      {isNonBillable && (
        <>
          <div>
            <div className="mb-2 text-sm font-semibold">Currently Allocated ({active.length})</div>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-4 py-2">Tag</th><th className="px-4 py-2">Asset</th><th className="px-4 py-2">Allocated</th><th className="px-4 py-2">Condition</th><th></th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {active.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No assets allocated yet. Use the Office Assets &gt; Allocations page to assign one.</td></tr>}
                  {active.map((a) => {
                    const u = unitMap.get(a.unit_id);
                    const asset = u ? assetMap.get(u.asset_id) : undefined;
                    return (
                      <tr key={a.id}>
                        <td className="px-4 py-2 font-mono font-semibold">{u?.tag ?? "—"}</td>
                        <td className="px-4 py-2">{asset?.name ?? "—"}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(a.allocated_at).toLocaleDateString("en-IN")}</td>
                        <td className="px-4 py-2 capitalize">{a.condition_out}</td>
                        <td className="px-4 py-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => returnIt(a.id, a.unit_id)}><Undo2 className="mr-1 h-4 w-4" /> Return</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {history.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-semibold">History ({history.length})</div>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-4 py-2">Tag</th><th className="px-4 py-2">Asset</th><th className="px-4 py-2">Allocated</th><th className="px-4 py-2">Returned</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map((a) => {
                      const u = unitMap.get(a.unit_id);
                      const asset = u ? assetMap.get(u.asset_id) : undefined;
                      return (
                        <tr key={a.id}>
                          <td className="px-4 py-2 font-mono">{u?.tag ?? "—"}</td>
                          <td className="px-4 py-2">{asset?.name ?? "—"}</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(a.allocated_at).toLocaleDateString("en-IN")}</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">{a.returned_at ? new Date(a.returned_at).toLocaleDateString("en-IN") : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}



