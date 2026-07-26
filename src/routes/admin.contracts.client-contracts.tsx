import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Copy,
  Download,
  Edit2,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Flag,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
  Upload,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { ContractApprovalDialog, type ApprovalMode } from "@/components/ContractApprovalDialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { hydrateFormulasFromMaster } from "@/lib/contract-hydrate";
import { useCurrentPermissions, fetchRoles, type RoleRow } from "@/lib/rbac";
import { notifyApprovers } from "@/lib/notifications";
import { csvDate, downloadCsv } from "@/lib/csv-export";
import {
  evaluateFormula,
  parseFormulaConfig,
  slugifyVar,
  type FormulaContext,
} from "@/lib/formula-engine";
import { DeleteGuardButton } from "@/components/DeleteGuardButton";
import { toast } from "sonner";
import { confirmAction } from "@/components/ConfirmProvider";
import { PageHeader, PageStat } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useCustomers, useUnits } from "@/lib/admin-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/contracts/client-contracts")({
  component: ClientContractsPage,
});

type GstOption = "csgst" | "igst" | "none";
type ContractStatus = "active" | "inactive" | "expired";
type ApprovalStatus = "pending" | "approved" | "rejected";
type RecordType = "prospect" | "client";
type ProspectStage =
  | "new"
  | "qualified"
  | "contract_sent"
  | "negotiation"
  | "closed"
  | "lost";
const PROSPECT_STAGES: { value: ProspectStage; label: string }[] = [
  { value: "new", label: "New" },
  { value: "qualified", label: "Qualified" },
  { value: "contract_sent", label: "Contract Sent" },
  { value: "negotiation", label: "Negotiation" },
  { value: "closed", label: "Closed" },
  { value: "lost", label: "Lost" },
];
const PROSPECT_STAGE_LABEL: Record<ProspectStage, string> = Object.fromEntries(
  PROSPECT_STAGES.map((s) => [s.value, s.label]),
) as Record<ProspectStage, string>;

type ClientContract = {
  id: string;
  contractCode: string;
  prospectCode: string;
  recordType: RecordType;
  unitId: string;
  startDate: string;
  endDate: string;
  expiryDate: string;
  originalStartDate: string;
  renewalCount: number;
  description: string;
  serviceTypeId: string | null;
  payrollWindowId: string | null;
  billingTypeId: string | null;
  esicBranchId: string | null;
  gstOption: GstOption;
  status: ContractStatus;
  approvalStatus: ApprovalStatus;
  prospectStage: ProspectStage;
  rejectionReason: string;
  createdBy: string | null;
  promotedAt: string | null;
};

// Add N months to an ISO yyyy-mm-dd date string. Returns "" on empty input.
function addMonthsISO(iso: string, months: number): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return "";
  const base = new Date(Date.UTC(y, m - 1, d));
  const targetMonth = base.getUTCMonth() + months;
  const target = new Date(Date.UTC(base.getUTCFullYear(), targetMonth, 1));
  // Clamp day to the last day of the target month
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

// Number of whole months between two ISO dates (end - start). Negative if invalid.
function monthsBetweenISO(startIso: string, endIso: string): number {
  if (!startIso || !endIso) return 0;
  const [sy, sm, sd] = startIso.split("-").map((n) => parseInt(n, 10));
  const [ey, em, ed] = endIso.split("-").map((n) => parseInt(n, 10));
  if (!sy || !ey) return 0;
  let months = (ey - sy) * 12 + (em - sm);
  if (ed < sd) months -= 1;
  return months;
}

type ApprovalPickerValue = "approved" | "rejected" | "lost" | null;

type ServiceType = { id: string; name: string };
type PayrollWindow = {
  id: string;
  label: string;
  windowStartDay: number;
  windowEndDay: number;
  processingDay: number;
};
type BillingType = { id: string; name: string };
type EsicBranch = { id: string; esicCode: string; location: string };
type Designation = { id: string; name: string; code: string };
type AllowanceType = {
  id: string;
  name: string;
  displayName: string;
  shortName: string;
  isDefault: boolean;
  calcType: "fixed" | "percentage";
  percentage: number;
  baseComponents: { label: string; operator: "+" | "-" }[];
  capAmount: number | null;
  includeInOt: boolean;
  formulaMode?: string | null;
  formulaExpression?: string | null;
  formulaVersion?: number | null;
  fixedCalcMethod?: "flat" | "per_duty";
  fixedDutyComponents?: ("p_days" | "ot_days" | "ph_days" | "other_paid_days")[];
  fixedDutyDivisor?: "base_days" | "days_in_month" | "payable_days" | "fixed_26";
};

type ResourceComponent = {
  allowanceId: string;
  name: string;
  amount: number;
  includeInOt?: boolean;
  formulaMode?: string | null;
  formulaExpression?: string | null;
  formulaVersion?: number | null;
  fixedCalcMethod?: "flat" | "per_duty";
  fixedDutyComponents?: ("p_days" | "ot_days" | "ph_days" | "other_paid_days")[];
  fixedDutyDivisor?: "base_days" | "days_in_month" | "payable_days" | "fixed_26";
};

type FixedCalcMethod = "flat" | "per_duty";
type FixedDutyBucket = "p_days" | "ot_days" | "ph_days" | "other_paid_days";
type FixedDutyDivisor = "base_days" | "days_in_month" | "payable_days" | "fixed_26";

type BenefitItem = {
  costComponentId: string;
  name: string;
  calcType: "percentage" | "fixed";
  percentage: number;
  baseComponents: { label: string; operator: "+" | "-" }[];
  capAmount: number | null;
  capFlatAmount: number | null;
  amount: number; // computed (percentage) or manual (fixed)
  state: string;
  deductionCalcType?: "earned_salary" | "fixed_amount";
  fixedCalcMethod?: FixedCalcMethod;
  fixedDutyComponents?: FixedDutyBucket[];
  fixedDutyDivisor?: FixedDutyDivisor;
  formulaMode?: string | null;
  formulaExpression?: string | null;
  formulaVersion?: number | null;
};


type ContractResource = {
  id?: string;
  designationId: string;
  roleKey?: string | null;
  serviceTypeId: string;
  quantity: number;
  components: ResourceComponent[];
  payrollDayBaseId: string | null;
  benefits: BenefitItem[];
  deductions: BenefitItem[];
  employerContributions: BenefitItem[];
};

function cloneBenefitItem(item: BenefitItem): BenefitItem {
  return {
    ...item,
    percentage: Number(item.percentage) || 0,
    amount: Number(item.amount) || 0,
    baseComponents: (item.baseComponents ?? []).map((b) => ({ ...b })),
    capAmount: item.capAmount == null ? null : Number(item.capAmount),
    capFlatAmount: item.capFlatAmount == null ? null : Number(item.capFlatAmount),
  };
}

function cloneContractResource(resource: ContractResource): ContractResource {
  return {
    id: resource.id,
    designationId: resource.designationId,
    roleKey: resource.roleKey ?? null,
    serviceTypeId: resource.serviceTypeId,
    quantity: Number(resource.quantity) || 1,
    components: (resource.components ?? []).map((c) => ({
      ...c,
      amount: Number(c.amount) || 0,
    })),
    payrollDayBaseId: resource.payrollDayBaseId ?? null,
    benefits: (resource.benefits ?? []).map(cloneBenefitItem),
    deductions: (resource.deductions ?? []).map(cloneBenefitItem),
    employerContributions: (resource.employerContributions ?? []).map(cloneBenefitItem),
  };
}

function serializeContractResources(resources: ContractResource[]): string {
  return JSON.stringify(resources.map(cloneContractResource));
}

type PayrollDayBase = {
  id: string;
  name: string;
  code: string;
  method: "actual_days" | "fixed_days" | "actual_minus_weekly_off" | "custom_weekdays";
  fixedDays: number | null;
  weeklyOffDay: number | null;
  includedWeekdays: number[] | null;
};

type CostComponentOption = {
  id: string;
  name: string;
  calcType: "percentage" | "fixed";
  percentage: number;
  baseComponents: { label: string; operator: "+" | "-" }[];
  capAmount: number | null;
  capFlatAmount: number | null;
  amount: number | null;
  state: string;
  deductionCalcType: "earned_salary" | "fixed_amount";
  fixedCalcMethod: FixedCalcMethod;
  fixedDutyComponents: FixedDutyBucket[];
  fixedDutyDivisor: FixedDutyDivisor;
  formulaMode?: string | null;
  formulaExpression?: string | null;
  formulaVersion?: number | null;
};


const QK = ["admin", "client-contracts"] as const;
const QK_SVC = ["admin", "service-types", "enabled"] as const;
const QK_PAY = ["admin", "payroll-windows", "enabled"] as const;
const QK_BIL = ["admin", "billing-types", "enabled"] as const;
const QK_DSG = ["admin", "designations", "enabled"] as const;
const QK_ALW = ["admin", "allowance-types", "enabled"] as const;
const QK_PDB = ["admin", "payroll-day-bases", "enabled"] as const;
const QK_CC = ["admin", "cost-components", "enabled"] as const;
const QK_ESIC = ["admin", "esic-branches", "enabled"] as const;


function rowToContract(r: Record<string, unknown>): ClientContract {
  return {
    id: String(r.id),
    contractCode: String(r.contract_code ?? ""),
    prospectCode: String(r.prospect_code ?? ""),
    recordType: (r.record_type as RecordType) ?? "prospect",
    unitId: String(r.unit_id ?? ""),
    startDate: r.start_date ? String(r.start_date) : "",
    endDate: r.end_date ? String(r.end_date) : "",
    expiryDate: r.expiry_date ? String(r.expiry_date) : "",
    originalStartDate: r.original_start_date ? String(r.original_start_date) : (r.start_date ? String(r.start_date) : ""),
    renewalCount: typeof r.renewal_count === "number" ? r.renewal_count : parseInt(String(r.renewal_count ?? "0"), 10) || 0,
    description: String(r.description ?? ""),
    serviceTypeId: r.service_type_id ? String(r.service_type_id) : null,
    payrollWindowId: r.payroll_window_id ? String(r.payroll_window_id) : null,
    billingTypeId: r.billing_type_id ? String(r.billing_type_id) : null,
    esicBranchId: r.esic_branch_id ? String(r.esic_branch_id) : null,
    gstOption: (r.gst_option as GstOption) ?? "csgst",
    status: (r.status as ContractStatus) ?? "inactive",
    approvalStatus: (r.approval_status as ApprovalStatus) ?? "pending",
    prospectStage: (r.prospect_stage as ProspectStage) ?? "new",
    rejectionReason: String(r.rejection_reason ?? ""),
    createdBy: r.created_by ? String(r.created_by) : null,
    promotedAt: r.promoted_at ? String(r.promoted_at) : null,
  };
}

function getApprovalPickerValue(contract: ClientContract | null): ApprovalPickerValue {
  if (!contract) return null;
  if (contract.prospectStage === "lost") return "lost";
  if (contract.approvalStatus === "approved") return "approved";
  if (contract.approvalStatus === "rejected") return "rejected";
  return null;
}

function applyApprovalPickerToPayload(
  payload: Omit<ClientContract, "id">,
  approvalValue: ApprovalPickerValue,
  current: ClientContract | null,
): Omit<ClientContract, "id"> {
  if (approvalValue === "approved") {
    return {
      ...payload,
      approvalStatus: "approved",
      status: "active",
      recordType: "client",
      prospectStage: "closed",
      rejectionReason: "",
    };
  }

  if (approvalValue === "rejected") {
    return {
      ...payload,
      approvalStatus: "rejected",
      status: "inactive",
      recordType: "prospect",
      prospectStage: current?.prospectStage === "lost" ? "new" : (current?.prospectStage ?? "new"),
    };
  }

  if (approvalValue === "lost") {
    return {
      ...payload,
      approvalStatus: "pending",
      status: "inactive",
      recordType: "prospect",
      prospectStage: "lost",
      rejectionReason: "",
    };
  }

  return payload;
}

function nextContractCode(existing: string[]): string {
  let max = 0;
  for (const code of existing) {
    const m = code.match(/CON(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `CON${String(max + 1).padStart(5, "0")}`;
}

function nextProspectCode(existing: string[]): string {
  let max = 0;
  for (const code of existing) {
    const m = code?.match(/PROS-(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `PROS-${String(max + 1).padStart(4, "0")}`;
}

function useContracts() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<ClientContract[]> => {
      const { data, error } = await supabase
        .from("client_contracts" as never)
        .select(
          "id,contract_code,prospect_code,record_type,prospect_stage,promoted_at,unit_id,start_date,end_date,expiry_date,original_start_date,renewal_count,description,service_type_id,payroll_window_id,billing_type_id,esic_branch_id,gst_option,status,approval_status,rejection_reason,created_by",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data as unknown as Record<string, unknown>[];
      // Auto-expire: any approved+active client contract whose end_date has passed → expired
      const today = new Date().toISOString().slice(0, 10);
      const toExpire = rows.filter(
        (r) =>
          (r.record_type ?? "prospect") === "client" &&
          (r.status ?? "inactive") === "active" &&
          (r.approval_status ?? "pending") === "approved" &&
          r.end_date &&
          String(r.end_date) < today,
      );
      if (toExpire.length > 0) {
        const ids = toExpire.map((r) => String(r.id));
        await supabase
          .from("client_contracts" as never)
          .update({ status: "expired" } as never)
          .in("id", ids);
        for (const r of toExpire) {
          r.status = "expired";
          void logActivity({
            module: "Client Contracts",
            action: "auto-expire",
            entityType: "client_contracts",
            entityId: String(r.id),
            entityLabel: String(r.contract_code ?? ""),
          });
        }
      }
      return rows.map(rowToContract);
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: QK });
    qc.invalidateQueries({ queryKey: ["admin", "units"] });
  };

  const syncUnitDates = async (unitId: string, startDate: string, endDate: string) => {
    if (!unitId) return;
    const patch: Record<string, unknown> = {
      contract_start_date: startDate || null,
      contract_end_date: endDate || null,
    };
    const { error } = await supabase
      .from("units" as never)
      .update(patch as never)
      .eq("id", unitId);
    if (error) console.warn("Failed to sync unit contract dates:", error.message);
  };

  type Payload = Omit<ClientContract, "id">;
  const toRow = (p: Payload, opts: { isNew: boolean }) => {
    const base: Record<string, unknown> = {
      unit_id: p.unitId,
      start_date: p.startDate || null,
      end_date: p.endDate || null,
      expiry_date: p.expiryDate || null,
      original_start_date: p.originalStartDate || p.startDate || null,
      renewal_count: p.renewalCount ?? 0,
      description: p.description.trim(),
      service_type_id: p.serviceTypeId,
      payroll_window_id: p.payrollWindowId,
      billing_type_id: p.billingTypeId,
      esic_branch_id: p.esicBranchId,
      gst_option: p.gstOption,
    };
    if (opts.isNew) {
      // New entries are always prospects, inactive, pending approval.
      base.record_type = "prospect";
      base.prospect_code = p.prospectCode;
      base.status = "inactive";
      base.approval_status = "pending";
      base.prospect_stage = "new";
      // contract_code is intentionally null until promoted.
    }
    return base;
  };

  const addMut = useMutation({
    mutationFn: async (p: Payload): Promise<string> => {
      if (!p.unitId) throw new Error("Unit is required");
      const uidRes = await supabase.auth.getUser();
      const insertRow = { ...toRow(p, { isNew: true }), created_by: uidRes.data.user?.id ?? null };
      const { data, error } = await supabase
        .from("client_contracts" as never)
        .insert(insertRow as never)
        .select("id")
        .single();
      if (error) throw error;
      const id = String((data as Record<string, unknown>).id);
      await syncUnitDates(p.unitId, p.startDate, p.endDate);
      void logActivity({ module: "Client Contracts", action: "create", entityType: "client_contracts", entityId: id, entityLabel: p.prospectCode, details: p as unknown as Record<string, unknown> });
      // Notify everyone with approve rights on contracts (fully RBAC-driven).
      void notifyApprovers({
        moduleKey: "contracts",
        type: "contract_pending_approval",
        title: `Prospect ${p.prospectCode} awaiting approval`,
        message: "A new prospect contract has been submitted and needs your sign-off.",
        link: "/admin/contracts/client-contracts",
        entityType: "client_contracts",
        entityId: id,
      });
      return id;
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({
      id,
      p,
      canApproveApproval,
    }: {
      id: string;
      p: Payload;
      canApproveApproval: boolean;
    }) => {
      const beforeRes = await supabase
        .from("client_contracts" as never)
        .select(
          "contract_code,prospect_code,unit_id,start_date,end_date,expiry_date,description,service_type_id,payroll_window_id,billing_type_id,esic_branch_id,gst_option,status,record_type,approval_status,prospect_stage,rejection_reason,promoted_at",
        )
        .eq("id", id)
        .single();
      const before = (beforeRes.data ?? null) as Record<string, unknown> | null;
      const after = toRow(p, { isNew: false });

      const approvalChanged =
        String(before?.approval_status ?? "pending") !== p.approvalStatus ||
        String(before?.prospect_stage ?? "new") !== p.prospectStage ||
        String(before?.record_type ?? "prospect") !== p.recordType ||
        String(before?.status ?? "inactive") !== p.status;

      if (approvalChanged && !canApproveApproval) {
        throw new Error("You do not have permission to change approval.");
      }

      if (p.approvalStatus === "approved") {
        const unitId = p.unitId || String(before?.unit_id ?? "");
        if (unitId) {
          const { data: dupRows, error: dupErr } = await supabase
            .from("client_contracts" as never)
            .select("contract_code")
            .eq("unit_id", unitId)
            .eq("record_type", "client")
            .eq("status", "active")
            .eq("approval_status", "approved")
            .neq("id", id);
          if (dupErr) throw dupErr;
          const dup = ((dupRows as unknown as Record<string, unknown>[]) ?? [])[0];
          if (dup) {
            throw new Error(
              `Unit already has an active contract (${String(dup.contract_code ?? "—")}). Expire or end it before approving a new one.`,
            );
          }
        }

        let nextCode = p.contractCode || String(before?.contract_code ?? "");
        if (!nextCode) {
          const { data: codeRows, error: codeErr } = await supabase
            .from("client_contracts" as never)
            .select("contract_code")
            .not("contract_code", "is", null);
          if (codeErr) throw codeErr;
          const existing = ((codeRows as unknown as Record<string, unknown>[]) ?? [])
            .map((r) => String(r.contract_code ?? ""))
            .filter(Boolean);
          nextCode = nextContractCode(existing);
        }

        const uidRes = await supabase.auth.getUser();
        const uid = uidRes.data.user?.id ?? null;
        const nowIso = new Date().toISOString();

        Object.assign(after, {
          approval_status: "approved",
          approved_by: uid,
          approved_at: nowIso,
          status: "active",
          rejection_reason: "",
          rejected_by: null,
          rejected_at: null,
          record_type: "client",
          promoted_at: String(before?.promoted_at ?? "") || nowIso,
          contract_code: nextCode,
          prospect_stage: "closed",
        });
      } else {
        Object.assign(after, {
          approval_status: p.approvalStatus,
          status: p.status,
          record_type: p.recordType,
          prospect_stage: p.prospectStage,
        });

        if (p.approvalStatus === "rejected") {
          const uidRes = await supabase.auth.getUser();
          const uid = uidRes.data.user?.id ?? null;
          Object.assign(after, {
            rejected_by: uid,
            rejected_at: new Date().toISOString(),
          });
        } else {
          Object.assign(after, {
            rejected_by: null,
            rejected_at: null,
          });
        }
      }

      const { error } = await supabase
        .from("client_contracts" as never)
        .update(after as never)
        .eq("id", id);
      if (error) throw error;
      await syncUnitDates(p.unitId || String(before?.unit_id ?? ""), p.startDate, p.endDate);
      void logActivity({
        module: "Client Contracts",
        action: "update",
        entityType: "client_contracts",
        entityId: id,
        entityLabel: p.contractCode || p.prospectCode,
        before,
        after: after as unknown as Record<string, unknown>,
      });
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("client_contracts" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Client Contracts", action: "delete", entityType: "client_contracts", entityId: id });
    },
    onSuccess: invalidate,
  });

  const updateStageMut = useMutation({
    mutationFn: async ({ id, stage, label }: { id: string; stage: ProspectStage; label: string }) => {
      const { error } = await supabase
        .from("client_contracts" as never)
        .update({ prospect_stage: stage } as never)
        .eq("id", id);
      if (error) throw error;
      void logActivity({
        module: "Client Contracts",
        action: "stage-change",
        entityType: "client_contracts",
        entityId: id,
        entityLabel: label,
        details: { stage },
      });
    },
    onSuccess: invalidate,
  });

  const resubmitMut = useMutation({
    mutationFn: async ({ id, prospectCode }: { id: string; prospectCode: string }) => {
      const { error } = await supabase
        .from("client_contracts" as never)
        .update({
          approval_status: "pending",
          rejection_reason: "",
          rejected_by: null,
          rejected_at: null,
          status: "inactive",
        } as never)
        .eq("id", id);
      if (error) throw error;
      void logActivity({
        module: "Client Contracts",
        action: "resubmit",
        entityType: "client_contracts",
        entityId: id,
        entityLabel: prospectCode,
      });
      void notifyApprovers({
        moduleKey: "contracts",
        type: "contract_pending_approval",
        title: `Prospect ${prospectCode} resubmitted for approval`,
        message: "A previously rejected prospect contract has been updated and resubmitted.",
        link: "/admin/contracts/client-contracts",
        entityType: "client_contracts",
        entityId: id,
      });
    },
    onSuccess: invalidate,
  });

  return { items, addMut, updateMut, deleteMut, updateStageMut, resubmitMut };
}

function useServiceTypes() {
  const { data = [] } = useQuery({
    queryKey: QK_SVC,
    queryFn: async (): Promise<ServiceType[]> => {
      const { data, error } = await supabase
        .from("service_types" as never)
        .select("id,name,enabled")
        .order("name");
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[])
        .filter((r) => r.enabled !== false)
        .map((r) => ({ id: String(r.id), name: String(r.name) }));
    },
  });
  return data;
}

function usePayrollWindows() {
  const { data = [] } = useQuery({
    queryKey: QK_PAY,
    queryFn: async (): Promise<PayrollWindow[]> => {
      const { data, error } = await supabase
        .from("payroll_windows" as never)
        .select("id,label,window_start_day,window_end_day,processing_day,enabled")
        .order("window_start_day");
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[])
        .filter((r) => r.enabled !== false)
        .map((r) => ({
          id: String(r.id),
          label: String(r.label),
          windowStartDay: Number(r.window_start_day),
          windowEndDay: Number(r.window_end_day),
          processingDay: Number(r.processing_day),
        }));
    },
  });
  return data;
}

function useBillingTypes() {
  const { data = [] } = useQuery({
    queryKey: QK_BIL,
    queryFn: async (): Promise<BillingType[]> => {
      const { data, error } = await supabase
        .from("billing_types" as never)
        .select("id,name,enabled")
        .order("name");
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[])
        .filter((r) => r.enabled !== false)
        .map((r) => ({ id: String(r.id), name: String(r.name) }));
    },
  });
  return data;
}

function useEsicBranches() {
  const { data = [] } = useQuery({
    queryKey: QK_ESIC,
    queryFn: async (): Promise<EsicBranch[]> => {
      const { data, error } = await supabase
        .from("esic_branches" as never)
        .select("id,esic_code,location,enabled")
        .order("esic_code");
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[])
        .filter((r) => r.enabled !== false)
        .map((r) => ({
          id: String(r.id),
          esicCode: String(r.esic_code ?? ""),
          location: String(r.location ?? ""),
        }));
    },
  });
  return data;
}


function useDesignations() {
  const { data = [] } = useQuery({
    queryKey: QK_DSG,
    queryFn: async (): Promise<Designation[]> => {
      const { data, error } = await supabase
        .from("designations" as never)
        .select("id,name,code,enabled")
        .order("name");
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[])
        .filter((r) => r.enabled !== false)
        .map((r) => ({
          id: String(r.id),
          name: String(r.name),
          code: String(r.code ?? ""),
        }));
    },
  });
  return data;
}

function useRolesList() {
  const { data = [] } = useQuery({
    queryKey: ["admin", "roles-list"],
    queryFn: async (): Promise<RoleRow[]> => fetchRoles(),
  });
  return data;
}


function useAllowanceTypes() {
  const { data = [] } = useQuery({
    queryKey: QK_ALW,
    queryFn: async (): Promise<AllowanceType[]> => {
      const { data, error } = await supabase
        .from("allowance_types" as never)
        .select("id,name,display_name,short_name,is_default,enabled,calc_type,percentage,base_components,cap_amount,include_in_ot,formula_mode,formula_expression,formula_version,fixed_calc_method,fixed_duty_components,fixed_duty_divisor,created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[])
        .filter((r) => r.enabled !== false)
        .map((r) => ({
          id: String(r.id),
          name: String(r.name),
          displayName: String(r.display_name ?? r.name),
          shortName: String(r.short_name ?? ""),
          isDefault: Boolean(r.is_default),
          calcType: (String(r.calc_type ?? "fixed") as "fixed" | "percentage"),
          percentage: Number(r.percentage ?? 0),
          baseComponents: Array.isArray(r.base_components)
            ? (r.base_components as { label: string; operator: "+" | "-" }[])
            : [],
          capAmount: r.cap_amount == null ? null : Number(r.cap_amount),
          includeInOt: r.include_in_ot == null ? true : Boolean(r.include_in_ot),
          formulaMode: r.formula_mode == null ? null : String(r.formula_mode),
          formulaExpression: r.formula_expression == null ? null : String(r.formula_expression),
          formulaVersion: r.formula_version == null ? null : Number(r.formula_version),
          fixedCalcMethod: (String(r.fixed_calc_method ?? "flat") as "flat" | "per_duty"),
          fixedDutyComponents: Array.isArray(r.fixed_duty_components)
            ? ((r.fixed_duty_components as string[]).filter((b) =>
                ["p_days","ot_days","ph_days","other_paid_days"].includes(b),
              ) as ("p_days"|"ot_days"|"ph_days"|"other_paid_days")[])
            : [],
          fixedDutyDivisor: (["base_days","days_in_month","payable_days","fixed_26"].includes(String(r.fixed_duty_divisor))
            ? (r.fixed_duty_divisor as "base_days"|"days_in_month"|"payable_days"|"fixed_26")
            : "base_days"),
        }));
    },
  });
  return data;
}

function useContractResources(contractId: string | null) {
  const { data = [] } = useQuery({
    queryKey: ["admin", "contract-resources", contractId ?? "none"],
    enabled: !!contractId,
    queryFn: async (): Promise<ContractResource[]> => {
      if (!contractId) return [];
      const { data, error } = await supabase
        .from("contract_resources" as never)
        .select(
          "id,designation_id,role_key,service_type_id,quantity,components,sort_order,payroll_day_base_id,benefits,deductions,employer_contributions",
        )
        .eq("contract_id", contractId)
        .order("sort_order");
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        designationId: r.designation_id ? String(r.designation_id) : "",
        roleKey: r.role_key ? String(r.role_key) : null,
        serviceTypeId: r.service_type_id ? String(r.service_type_id) : "",
        quantity: Number(r.quantity ?? 1),
        components: Array.isArray(r.components)
          ? (r.components as ResourceComponent[])
          : [],
        payrollDayBaseId: r.payroll_day_base_id ? String(r.payroll_day_base_id) : null,
        benefits: Array.isArray(r.benefits) ? (r.benefits as BenefitItem[]) : [],
        deductions: Array.isArray(r.deductions) ? (r.deductions as BenefitItem[]) : [],
        employerContributions: Array.isArray(r.employer_contributions) ? (r.employer_contributions as BenefitItem[]) : [],
      }));
    },
  });
  return data;
}

function usePayrollDayBases() {
  const { data = [] } = useQuery({
    queryKey: QK_PDB,
    queryFn: async (): Promise<PayrollDayBase[]> => {
      const { data, error } = await supabase
        .from("payroll_day_bases" as never)
        .select("id,name,code,method,fixed_days,weekly_off_day,included_weekdays,enabled,sort_order")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[])
        .filter((r) => r.enabled !== false)
        .map((r) => ({
          id: String(r.id),
          name: String(r.name),
          code: String(r.code),
          method: r.method as PayrollDayBase["method"],
          fixedDays: r.fixed_days == null ? null : Number(r.fixed_days),
          weeklyOffDay: r.weekly_off_day == null ? null : Number(r.weekly_off_day),
          includedWeekdays: Array.isArray(r.included_weekdays)
            ? (r.included_weekdays as unknown[]).map((n) => Number(n)).filter((n) => n >= 0 && n <= 6)
            : null,
        }));
    },
  });
  return data;
}

function useCostComponentOptions() {
  const { data = [] } = useQuery({
    queryKey: QK_CC,
    queryFn: async (): Promise<CostComponentOption[]> => {
      const { data, error } = await supabase
        .from("cost_components" as never)
        .select("id,name,calc_type,percentage,base_components,cap_amount,cap_flat_amount,amount,state,enabled,sort_order,deduction_calc_type,fixed_calc_method,fixed_duty_components,fixed_duty_divisor,formula_mode,formula_expression,formula_version")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[])
        .filter((r) => r.enabled !== false)
        .map((r) => ({
          id: String(r.id),
          name: String(r.name),
          calcType: (r.calc_type as "percentage" | "fixed") ?? "percentage",
          percentage: Number(r.percentage ?? 0),
          baseComponents: Array.isArray(r.base_components)
            ? (r.base_components as { label: string; operator: "+" | "-" }[])
            : [],
          capAmount: r.cap_amount == null ? null : Number(r.cap_amount),
          capFlatAmount: r.cap_flat_amount == null ? null : Number(r.cap_flat_amount),
          amount: r.amount == null ? null : Number(r.amount),
          state: String(r.state ?? "N/A"),
          deductionCalcType:
            (String(r.deduction_calc_type ?? "earned_salary") as "earned_salary" | "fixed_amount"),
          fixedCalcMethod:
            (String(r.fixed_calc_method ?? "flat") as FixedCalcMethod),
          fixedDutyComponents: Array.isArray(r.fixed_duty_components)
            ? ((r.fixed_duty_components as string[]).filter((b) =>
                ["p_days","ot_days","ph_days","other_paid_days"].includes(b),
              ) as FixedDutyBucket[])
            : [],
          fixedDutyDivisor: (["base_days","days_in_month","payable_days","fixed_26"].includes(String(r.fixed_duty_divisor))
            ? (r.fixed_duty_divisor as FixedDutyDivisor)
            : "base_days"),
          formulaMode: r.formula_mode == null ? null : String(r.formula_mode),
          formulaExpression: r.formula_expression == null ? null : String(r.formula_expression),
          formulaVersion: r.formula_version == null ? null : Number(r.formula_version),
        }));
    },

  });
  return data;
}

/** Compute total payable days for a resource in the current month, based on the payroll-day base rule. */
function computePayableDays(base: PayrollDayBase | undefined, ref: Date = new Date()): number {
  if (!base) return 0;
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (base.method === "fixed_days") return Number(base.fixedDays) || 0;
  if (base.method === "actual_days") return daysInMonth;
  if (base.method === "actual_minus_weekly_off") {
    const off = base.weeklyOffDay == null ? 0 : Number(base.weeklyOffDay); // 0=Sun..6=Sat
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(year, month, d).getDay() === off) count++;
    }
    return daysInMonth - count;
  }
  if (base.method === "custom_weekdays") {
    const allowed = base.includedWeekdays ?? [];
    if (allowed.length === 0) return 0;
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      if (allowed.includes(new Date(year, month, d).getDay())) count++;
    }
    return count;
  }
  return daysInMonth;
}

const ESI_CONTRACT_NOTE = "Calculated in payroll from earned gross minus washing/conveyance";
const ESI_COMPONENT_RE = /\b(?:e[er]\s*)?e?si(c)?\b/i;

function isEsiItem(item: { name?: unknown } | null | undefined): boolean {
  return ESI_COMPONENT_RE.test(String(item?.name ?? ""));
}

function hasConfiguredFormula(item: { formulaExpression?: string | null }): boolean {
  return !!item.formulaExpression?.trim();
}

// ESI rows fall back to the statutory calc only when no custom formula is set
// in Cost Component Manager. When a formula IS configured the row uses its own
// evaluated amount instead of the statutory 0.75% / 3.25% override.
function isStatutoryEsi(item: { name?: unknown; formulaExpression?: string | null } | null | undefined): boolean {
  return isEsiItem(item) && !hasConfiguredFormula(item ?? {});
}

function contractTotalAmount(item: { name?: unknown; amount?: unknown; formulaExpression?: string | null }): number {
  if (isStatutoryEsi(item)) return 0;
  return Number(item.amount) || 0;
}

function addFormulaAliases(ctx: FormulaContext, amount: number, labels: Array<string | null | undefined>) {
  const keys = new Set<string>();
  const compact = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string[]> = {
    splallow: ["spl_allow", "specialallowance", "special_allowance"],
    splallowance: ["spl_allowance", "specialallowance", "special_allowance"],
    specialallowance: ["special_allowance", "splallow", "spl_allow", "splallowance", "spl_allowance"],
    convallow: ["conv_allow", "conveyanceallowance", "conveyance_allowance"],
    conveyanceallowance: ["conveyance_allowance", "convallow", "conv_allow"],
    wa: ["washingallowance", "washing_allowance"],
    washingallowance: ["washing_allowance", "wa"],
    hra: ["houserentallowance", "house_rent_allowance"],
    houserentallowance: ["house_rent_allowance", "hra"],
  };
  for (const label of labels) {
    const raw = String(label ?? "").trim();
    if (!raw) continue;
    keys.add(slugifyVar(raw));
    keys.add(compact(raw));
    const canonical = raw
      .replace(/[\s\-_]*[\(\[]?\s*\d+(?:\.\d+)?\s*%\s*[\)\]]?\s*$/gi, "")
      .replace(/[\s\-_]+\d+(?:\.\d+)?\s*$/g, "")
      .trim();
    if (canonical) {
      keys.add(slugifyVar(canonical));
      keys.add(compact(canonical));
      for (const alias of aliases[compact(canonical)] ?? []) keys.add(alias);
    }
  }
  for (const key of keys) {
    if (!key) continue;
    ctx[key] = Math.round(((ctx[key] ?? 0) + amount) * 100) / 100;
  }
}

function allowanceLabelKey(label: string | null | undefined): string {
  return String(label ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findAllowanceForResourceComponent(
  component: Pick<ResourceComponent, "allowanceId" | "name">,
  allowanceTypes: AllowanceType[],
): AllowanceType | undefined {
  const byId = allowanceTypes.find((a) => a.id === component.allowanceId);
  if (byId) return byId;

  const componentKey = allowanceLabelKey(component.name);
  if (!componentKey) return undefined;
  const exact = allowanceTypes.find((a) =>
    [a.name, a.displayName, a.shortName].some((label) => allowanceLabelKey(label) === componentKey),
  );
  if (exact) return exact;

  const stripSuffix = (label: string) =>
    allowanceLabelKey(
      label
        .replace(/[\s\-_]*[\(\[]?\s*\d+(?:\.\d+)?\s*%\s*[\)\]]?\s*$/gi, "")
        .replace(/[\s\-_]+\d+(?:\.\d+)?\s*$/g, ""),
    );
  const canonicalKey = stripSuffix(component.name);
  if (!canonicalKey) return undefined;
  const candidates = allowanceTypes.filter((a) =>
    [a.name, a.displayName, a.shortName].some((label) => stripSuffix(label) === canonicalKey),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

function syncResourceComponentMasterFields(
  component: ResourceComponent,
  allowanceTypes: AllowanceType[],
): ResourceComponent {
  const at = findAllowanceForResourceComponent(component, allowanceTypes);
  if (!at) return { ...component };
  return {
    ...component,
    allowanceId: at.id,
    name: at.shortName || at.displayName || at.name,
    includeInOt: at.includeInOt,
    formulaMode: at.formulaMode ?? null,
    formulaExpression: at.formulaExpression ?? null,
    formulaVersion: at.formulaVersion ?? null,
  };
}

/** Compute benefit amount from a percentage component using the resource's wage components. */
function computeBenefitAmount(
  benefit: Pick<BenefitItem, "calcType" | "percentage" | "baseComponents" | "capAmount" | "capFlatAmount" | "amount"> & {
    formulaMode?: string | null;
    formulaExpression?: string | null;
    name?: string;
  },
  wageComponents: ResourceComponent[],
  benefitItems: BenefitItem[] = [],
  allowanceTypes: AllowanceType[] = [],
  employerItems: BenefitItem[] = [],
): number {
  // Formula-first: if the master record (allowance / cost component) has a
  // formula expression configured, evaluate it against a slugified context
  // built from the current wage components.
  const cfg = hasConfiguredFormula(benefit)
    ? parseFormulaConfig(benefit.formulaMode ?? null, benefit.formulaExpression ?? null)
    : null;
  if (cfg && !(cfg.mode === "advanced" && !cfg.expression?.trim())) {
    const componentsTotal = wageComponents.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const benefitsTotal = benefitItems.reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const employerTotal = employerItems.reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const ctx: FormulaContext = {
      basic: 0,
      da: 0,
      gross: componentsTotal + benefitsTotal,
      ctc: componentsTotal + benefitsTotal + employerTotal,
      fixed_amount: Number(benefit.amount) || 0,
      days_in_month: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(),
      working_days: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(),
    };
    for (const c of wageComponents) {
      const amt = Number(c.amount) || 0;
      const at = allowanceTypes.find((a) => a.id === c.allowanceId);
      addFormulaAliases(ctx, amt, [c.name, at?.name, at?.displayName, at?.shortName]);
    }
    for (const b of benefitItems) {
      addFormulaAliases(ctx, Number(b.amount) || 0, [b.name]);
    }
    for (const b of employerItems) {
      addFormulaAliases(ctx, Number(b.amount) || 0, [b.name]);
    }
    const r = evaluateFormula(cfg, ctx);
    if (!r.error) return r.amount;
  }
  if (benefit.calcType === "fixed") return Number(benefit.amount) || 0;
  const componentsTotal = wageComponents.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const benefitsTotal = benefitItems.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const employerTotal = employerItems.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  if (isEsiItem(benefit as { name?: unknown })) return 0;
  const norm = (s: string) => s.trim().toLowerCase();
  const compactNorm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const grossOf = (label: string): number => {
    const l = norm(label);
    if (l === "gross") {
      return componentsTotal + benefitsTotal;
    }
    if (l === "ctc" || l === "total ctc") {
      return componentsTotal + benefitsTotal + employerTotal;
    }
    // Direct match on the wage component's stored name (often the short name)
    let match = wageComponents.find((c) => norm(c.name) === l);
    if (!match) match = wageComponents.find((c) => compactNorm(c.name) === compactNorm(label));
    if (match) return Number(match.amount) || 0;
    // Resolve via allowance type aliases: name / displayName / shortName -> allowanceId
    const at = allowanceTypes.find(
      (a) => norm(a.name) === l || norm(a.displayName) === l || norm(a.shortName) === l,
    );
    if (at) {
      match = wageComponents.find((c) => c.allowanceId === at.id);
      if (match) return Number(match.amount) || 0;
    }
    // Resolve against benefit / employer item names
    const benefitMatch = benefitItems.find((b) => norm(b.name) === l);
    if (benefitMatch) return Number(benefitMatch.amount) || 0;
    const employerMatch = employerItems.find((b) => norm(b.name) === l);
    if (employerMatch) return Number(employerMatch.amount) || 0;
    return 0;
  };
  const base = benefit.baseComponents.reduce((sum, b) => {
    const v = grossOf(b.label);
    return b.operator === "-" ? sum - v : sum + v;
  }, 0);
  let amt = (Number(benefit.percentage) || 0) * base / 100;
  if (benefit.capAmount != null && benefit.capAmount > 0 && base > benefit.capAmount) {
    amt =
      benefit.capFlatAmount != null && benefit.capFlatAmount > 0
        ? Number(benefit.capFlatAmount)
        : (Number(benefit.percentage) || 0) * benefit.capAmount / 100;
  }
  return Math.round(amt * 100) / 100;
}

async function persistResources(contractId: string, resources: ContractResource[]) {
  const normalizedResources = resources.map(cloneContractResource);
  const prev = await supabase
    .from("contract_resources" as never)
    .select("designation_id,service_type_id,quantity,components,benefits,deductions,employer_contributions,payroll_day_base_id,sort_order")
    .eq("contract_id", contractId)
    .order("sort_order");
  const beforeRows = (prev.data ?? []) as Record<string, unknown>[];
  const del = await supabase
    .from("contract_resources" as never)
    .delete()
    .eq("contract_id", contractId);
  if (del.error) throw del.error;
  if (normalizedResources.length === 0) {
    void logActivity({
      module: "Contract Resources",
      action: "update",
      entityType: "contract_resources",
      entityId: contractId,
      before: { count: beforeRows.length, resources: beforeRows },
      after: { count: 0, resources: [] },
    });
    return;
  }
  const rows = normalizedResources.map((r, idx) => ({
    contract_id: contractId,
    designation_id: r.designationId || null,
    role_key: r.roleKey || null,
    service_type_id: r.serviceTypeId || null,
    quantity: r.quantity,
    components: r.components,
    gross: r.components.reduce((s, c) => s + (Number(c.amount) || 0), 0),
    sort_order: idx,
    payroll_day_base_id: r.payrollDayBaseId || null,
    benefits: r.benefits,
    deductions: r.deductions,
    employer_contributions: r.employerContributions,
  }));
  const ins = await supabase
    .from("contract_resources" as never)
    .insert(rows as never)
    .select("designation_id,service_type_id,quantity,components,benefits,deductions,employer_contributions,payroll_day_base_id,sort_order");
  if (ins.error) throw ins.error;
  const savedRows = ((ins.data ?? []) as Record<string, unknown>[]).sort(
    (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
  );
  if (savedRows.length !== rows.length) {
    throw new Error("Could not verify saved resources. Please try again.");
  }
  const normalizeForCompare = (arr: unknown): string => {
    const list = Array.isArray(arr) ? arr : [];
    return JSON.stringify(
      list.map((it) => {
        const o = (it ?? {}) as Record<string, unknown>;
        return Object.keys(o)
          .sort()
          .reduce<Record<string, unknown>>((acc, k) => {
            const v = o[k];
            acc[k] = typeof v === "number" ? Number(v) : v;
            return acc;
          }, {});
      }),
    );
  };
  rows.forEach((row, idx) => {
    const saved = savedRows[idx];
    if (normalizeForCompare(row.deductions) !== normalizeForCompare(saved?.deductions)) {
      throw new Error("Resource deductions were not saved correctly. Please try again.");
    }
  });
  void logActivity({
    module: "Contract Resources",
    action: "update",
    entityType: "contract_resources",
    entityId: contractId,
    before: { count: beforeRows.length, resources: beforeRows },
    after: { count: rows.length, resources: rows },
  });
}

// ============= Excel export / import =============

const CONTRACT_FIELDS = [
  "contract_code",
  "unit_id",
  "start_date",
  "end_date",
  "expiry_date",
  "description",
  "service_type_id",
  "payroll_window_id",
  "billing_type_id",
  "esic_branch_id",
  "gst_option",
  "status",
] as const;

async function exportContractToXlsx(contract: ClientContract): Promise<void> {
  const { data: resData, error } = await supabase
    .from("contract_resources" as never)
    .select(
      "designation_id,service_type_id,quantity,payroll_day_base_id,components,benefits,deductions,employer_contributions,sort_order",
    )
    .eq("contract_id", contract.id)
    .order("sort_order");
  if (error) throw error;
  const resources = (resData as unknown as Record<string, unknown>[]) ?? [];

  // Resolve lookup labels in parallel
  const [unitsRes, desigRes, svcRes, pwRes, btRes, pdbRes, esicRes] = await Promise.all([
    supabase.from("units" as never).select("id,code,name").eq("id", contract.unitId).maybeSingle(),
    supabase.from("designations" as never).select("id,name,code"),
    supabase.from("service_types" as never).select("id,name"),
    supabase.from("payroll_windows" as never).select("id,label"),
    supabase.from("billing_types" as never).select("id,name"),
    supabase.from("payroll_day_bases" as never).select("id,name,code"),
    supabase.from("esic_branches" as never).select("id,esic_code,location"),
  ]);
  const unitRow = unitsRes.data as Record<string, unknown> | null;
  const nameMap = (rows: unknown, key = "name"): Map<string, string> => {
    const m = new Map<string, string>();
    ((rows as Record<string, unknown>[]) ?? []).forEach((r) =>
      m.set(String(r.id), String(r[key] ?? "")),
    );
    return m;
  };
  const desigMap = nameMap(desigRes.data);
  const svcMap = nameMap(svcRes.data);
  const pwMap = nameMap(pwRes.data, "label");
  const btMap = nameMap(btRes.data);
  const pdbMap = nameMap(pdbRes.data);
  const esicMap = new Map<string, string>();
  ((esicRes.data as Record<string, unknown>[]) ?? []).forEach((r) =>
    esicMap.set(String(r.id), `${String(r.esic_code ?? "")} — ${String(r.location ?? "")}`),
  );

  const sumArr = (arr: unknown): number =>
    Array.isArray(arr)
      ? (arr as { name?: unknown; amount?: unknown }[]).reduce((s, x) => s + contractTotalAmount(x), 0)
      : 0;

  // ---- Sheet 1: Summary
  const summaryRows: Array<[string, string | number]> = [];
  summaryRows.push(["Contract Code", contract.contractCode]);
  summaryRows.push([
    "Unit",
    unitRow ? `${String(unitRow.code ?? "")} — ${String(unitRow.name ?? "")}` : contract.unitId,
  ]);
  summaryRows.push(["Start Date", contract.startDate]);
  summaryRows.push(["End Date", contract.endDate]);
  summaryRows.push(["Expiry Date", contract.expiryDate]);
  summaryRows.push(["Status", contract.status]);
  summaryRows.push(["Description", contract.description]);
  summaryRows.push(["Service Type", svcMap.get(contract.serviceTypeId ?? "") ?? ""]);
  summaryRows.push(["Payroll Window", pwMap.get(contract.payrollWindowId ?? "") ?? ""]);
  summaryRows.push(["Billing Type", btMap.get(contract.billingTypeId ?? "") ?? ""]);
  summaryRows.push(["ESIC Subcode", esicMap.get(contract.esicBranchId ?? "") ?? ""]);
  summaryRows.push(["GST Option", contract.gstOption]);

  let totalHeadcount = 0;
  let totalMonthlyCTC = 0;
  let totalGross = 0;
  let totalBenefits = 0;
  let totalDeductions = 0;
  let totalEmployer = 0;
  resources.forEach((r) => {
    const qty = Number(r.quantity ?? 1) || 1;
    const wage = sumArr(r.components);
    const ben = sumArr(r.benefits);
    const ded = sumArr(r.deductions);
    const emp = sumArr(r.employer_contributions);
    totalHeadcount += qty;
    totalGross += (wage + ben) * qty;
    totalBenefits += ben * qty;
    totalDeductions += ded * qty;
    totalEmployer += emp * qty;
    totalMonthlyCTC += (wage + ben + emp) * qty;
  });
  summaryRows.push(["", ""]);
  summaryRows.push(["Resource Lines", resources.length]);
  summaryRows.push(["Total Headcount", totalHeadcount]);
  summaryRows.push(["Total Monthly Gross", totalGross]);
  summaryRows.push(["Total Monthly Benefits (in gross)", totalBenefits]);
  summaryRows.push(["Total Monthly Deductions", totalDeductions]);
  summaryRows.push(["Total Monthly Employer Contribution", totalEmployer]);
  summaryRows.push(["Total Monthly CTC (Gross + Employer)", totalMonthlyCTC]);
  summaryRows.push(["Total Monthly Net Payable (Gross - Deductions)", totalGross - totalDeductions]);

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.aoa_to_sheet([["Field", "Value"], ...summaryRows]);
  wsSummary["!cols"] = [{ wch: 42 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ---- Sheet 2: Resources (human-readable)
  const resHeader = [
    "#",
    "Designation",
    "Service Type",
    "Quantity",
    "Payroll Day Basis",
    "Wage Components Total",
    "Benefits Total",
    "Gross (Wage + Benefits)",
    "Deductions Total",
    "Net Payable",
    "Employer Contribution Total",
    "Monthly CTC",
    "Annual CTC",
    "Line Monthly CTC (× Qty)",
    "Line Annual CTC (× Qty)",
  ];
  const resHumanRows = resources.map((r, idx) => {
    const qty = Number(r.quantity ?? 1) || 1;
    const wage = sumArr(r.components);
    const ben = sumArr(r.benefits);
    const ded = sumArr(r.deductions);
    const emp = sumArr(r.employer_contributions);
    const gross = wage + ben;
    const ctc = gross + emp;
    return [
      idx + 1,
      desigMap.get(String(r.designation_id ?? "")) ?? "",
      svcMap.get(String(r.service_type_id ?? "")) ?? "",
      qty,
      pdbMap.get(String(r.payroll_day_base_id ?? "")) ?? "",
      wage,
      ben,
      gross,
      ded,
      gross - ded,
      emp,
      ctc,
      ctc * 12,
      ctc * qty,
      ctc * qty * 12,
    ];
  });
  const wsRes = XLSX.utils.aoa_to_sheet([resHeader, ...resHumanRows]);
  wsRes["!cols"] = resHeader.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, wsRes, "Resources");

  // ---- Sheet 3: Salary Breakdown (long format)
  const breakdownHeader = [
    "Resource #",
    "Designation",
    "Quantity",
    "Section",
    "Component",
    "Calc Type",
    "Percentage",
    "State",
    "Monthly Amount",
    "Line Total (× Qty)",
  ];
  const breakdownRows: (string | number)[][] = [];
  resources.forEach((r, idx) => {
    const qty = Number(r.quantity ?? 1) || 1;
    const desig = desigMap.get(String(r.designation_id ?? "")) ?? "";
    const pushSection = (section: string, items: unknown) => {
      if (!Array.isArray(items)) return;
      (items as Array<Record<string, unknown>>).forEach((it) => {
        const amt = contractTotalAmount(it);
        breakdownRows.push([
          idx + 1,
          desig,
          qty,
          section,
          String(it.name ?? ""),
          String(it.calcType ?? ""),
          Number(it.percentage ?? 0) || 0,
          String(it.state ?? ""),
          amt,
          amt * qty,
        ]);
      });
    };
    pushSection("Wage", r.components);
    pushSection("Benefit", r.benefits);
    pushSection("Deduction", r.deductions);
    pushSection("Employer Contribution", r.employer_contributions);
  });
  const wsBreak = XLSX.utils.aoa_to_sheet([breakdownHeader, ...breakdownRows]);
  wsBreak["!cols"] = breakdownHeader.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, wsBreak, "Salary Breakdown");

  // ---- Sheet 4: Contract (raw, importable)
  const contractRow: Record<string, string | number> = {
    contract_code: contract.contractCode,
    unit_id: contract.unitId,
    start_date: contract.startDate,
    end_date: contract.endDate,
    expiry_date: contract.expiryDate,
    description: contract.description,
    service_type_id: contract.serviceTypeId ?? "",
    payroll_window_id: contract.payrollWindowId ?? "",
    billing_type_id: contract.billingTypeId ?? "",
    esic_branch_id: contract.esicBranchId ?? "",
    gst_option: contract.gstOption,
    status: contract.status,
  };
  const wsContract = XLSX.utils.json_to_sheet([contractRow], {
    header: [...CONTRACT_FIELDS],
  });
  XLSX.utils.book_append_sheet(wb, wsContract, "Contract");

  // ---- Sheet 5: Resources_Raw (importable JSON columns)
  const resourceRawRows = resources.map((r, idx) => ({
    sort_order: Number(r.sort_order ?? idx),
    designation_id: r.designation_id ? String(r.designation_id) : "",
    service_type_id: r.service_type_id ? String(r.service_type_id) : "",
    quantity: Number(r.quantity ?? 1),
    payroll_day_base_id: r.payroll_day_base_id ? String(r.payroll_day_base_id) : "",
    components_json: JSON.stringify(r.components ?? []),
    benefits_json: JSON.stringify(r.benefits ?? []),
    deductions_json: JSON.stringify(r.deductions ?? []),
    employer_contributions_json: JSON.stringify(r.employer_contributions ?? []),
  }));
  const wsRaw = XLSX.utils.json_to_sheet(resourceRawRows, {
    header: [
      "sort_order",
      "designation_id",
      "service_type_id",
      "quantity",
      "payroll_day_base_id",
      "components_json",
      "benefits_json",
      "deductions_json",
      "employer_contributions_json",
    ],
  });
  XLSX.utils.book_append_sheet(wb, wsRaw, "Resources_Raw");

  XLSX.writeFile(wb, `${contract.contractCode || "contract"}.xlsx`);
}

type ImportedContract = {
  contractRow: Record<string, unknown>;
  resourceRows: Record<string, unknown>[];
};

function parseContractWorkbook(buf: ArrayBuffer): ImportedContract {
  const wb = XLSX.read(buf, { type: "array" });
  const cSheet = wb.Sheets["Contract"];
  if (!cSheet) throw new Error("Workbook is missing a 'Contract' sheet");
  const cRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(cSheet, {
    defval: "",
  });
  if (cRows.length === 0) throw new Error("'Contract' sheet has no rows");
  const contractRow = { ...cRows[0] };

  // Allow user to edit the human-readable Summary sheet (Contract Code, Status,
  // Description, GST Option). When those values diverge from the raw Contract
  // sheet, the Summary edits win — that's the sheet users actually look at.
  const sSheet = wb.Sheets["Summary"];
  if (sSheet) {
    const sRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sSheet, {
      header: 1,
      defval: "",
    }) as unknown as Array<Array<unknown>>;
    const sMap = new Map<string, string>();
    for (const row of sRows) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const k = String(row[0] ?? "").trim();
      const v = row[1];
      if (k) sMap.set(k.toLowerCase(), v == null ? "" : String(v));
    }
    const apply = (label: string, field: string) => {
      const v = sMap.get(label.toLowerCase());
      if (v != null && v !== "") contractRow[field] = v;
    };
    apply("Contract Code", "contract_code");
    apply("Status", "status");
    apply("Description", "description");
    apply("GST Option", "gst_option");
    apply("Start Date", "start_date");
    apply("End Date", "end_date");
    apply("Expiry Date", "expiry_date");
  }

  const rSheet = wb.Sheets["Resources_Raw"] ?? wb.Sheets["Resources"];
  const rRows = rSheet
    ? XLSX.utils.sheet_to_json<Record<string, unknown>>(rSheet, { defval: "" })
    : [];
  return { contractRow, resourceRows: rRows };
}

function safeJsonArray(v: unknown): unknown[] {
  if (v == null || v === "") return [];
  if (Array.isArray(v)) return v;
  try {
    const p = JSON.parse(String(v));
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

async function importContractFromXlsx(buf: ArrayBuffer): Promise<{
  action: "created" | "updated";
  contractCode: string;
}> {
  const { contractRow, resourceRows } = parseContractWorkbook(buf);
  const code = String(contractRow.contract_code ?? "").trim();
  if (!code) throw new Error("Missing contract_code in workbook");
  const unitId = String(contractRow.unit_id ?? "").trim();
  if (!unitId) throw new Error("Missing unit_id in workbook");

  const row = {
    contract_code: code,
    unit_id: unitId,
    start_date: contractRow.start_date ? String(contractRow.start_date) : null,
    end_date: contractRow.end_date ? String(contractRow.end_date) : null,
    expiry_date: contractRow.expiry_date ? String(contractRow.expiry_date) : null,
    description: String(contractRow.description ?? ""),
    service_type_id: contractRow.service_type_id ? String(contractRow.service_type_id) : null,
    payroll_window_id: contractRow.payroll_window_id ? String(contractRow.payroll_window_id) : null,
    billing_type_id: contractRow.billing_type_id ? String(contractRow.billing_type_id) : null,
    esic_branch_id: contractRow.esic_branch_id ? String(contractRow.esic_branch_id) : null,
    gst_option: String(contractRow.gst_option ?? "csgst"),
    status: String(contractRow.status ?? "active"),
  };

  const existing = await supabase
    .from("client_contracts" as never)
    .select("id")
    .eq("contract_code", code)
    .maybeSingle();
  if (existing.error) throw existing.error;

  let contractId: string;
  let action: "created" | "updated";
  if (existing.data) {
    contractId = String((existing.data as Record<string, unknown>).id);
    const upd = await supabase
      .from("client_contracts" as never)
      .update(row as never)
      .eq("id", contractId);
    if (upd.error) throw upd.error;
    action = "updated";
  } else {
    const ins = await supabase
      .from("client_contracts" as never)
      .insert(row as never)
      .select("id")
      .single();
    if (ins.error) throw ins.error;
    contractId = String((ins.data as Record<string, unknown>).id);
    action = "created";
  }

  const resources: ContractResource[] = resourceRows.map((r) => ({
    designationId: String(r.designation_id ?? ""),
    serviceTypeId: String(r.service_type_id ?? ""),
    quantity: Number(r.quantity ?? 1) || 1,
    payrollDayBaseId: r.payroll_day_base_id ? String(r.payroll_day_base_id) : null,
    components: safeJsonArray(r.components_json) as ResourceComponent[],
    benefits: safeJsonArray(r.benefits_json) as BenefitItem[],
    deductions: safeJsonArray(r.deductions_json) as BenefitItem[],
    employerContributions: safeJsonArray(r.employer_contributions_json) as BenefitItem[],
  }));
  await persistResources(contractId, resources);

  void logActivity({
    module: "Client Contracts",
    action: action === "created" ? "import-create" : "import-update",
    entityType: "client_contracts",
    entityId: contractId,
    entityLabel: code,
  });

  return { action, contractCode: code };
}

function ClientContractsPage() {
  const qc = useQueryClient();
  const { items, addMut, updateMut, deleteMut, updateStageMut, resubmitMut } = useContracts();
  const { can } = useCurrentPermissions();
  const canApprove = can("contracts", "approve");
  const canEdit = can("contracts", "edit");
  const { units } = useUnits();
  const { customers } = useCustomers();
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const customerById = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers],
  );

  const [query, setQuery] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientContract | null>(null);
  const [deleting, setDeleting] = useState<ClientContract | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  async function handleSyncFormulas(contractId: string, label: string) {
    setSyncingId(contractId);
    try {
      const { data, error } = await supabase
        .from("contract_resources" as never)
        .select("id,designation_id,service_type_id,quantity,components,sort_order,payroll_day_base_id,benefits,deductions,employer_contributions")
        .eq("contract_id", contractId)
        .order("sort_order");
      if (error) throw error;
      const current: ContractResource[] = (data as unknown as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        designationId: r.designation_id ? String(r.designation_id) : "",
        serviceTypeId: r.service_type_id ? String(r.service_type_id) : "",
        quantity: Number(r.quantity ?? 1),
        components: Array.isArray(r.components) ? (r.components as ResourceComponent[]) : [],
        payrollDayBaseId: r.payroll_day_base_id ? String(r.payroll_day_base_id) : null,
        benefits: Array.isArray(r.benefits) ? (r.benefits as BenefitItem[]) : [],
        deductions: Array.isArray(r.deductions) ? (r.deductions as BenefitItem[]) : [],
        employerContributions: Array.isArray(r.employer_contributions) ? (r.employer_contributions as BenefitItem[]) : [],
      }));
      if (current.length === 0) {
        toast.info("No resource lines to sync on this contract.");
        return;
      }
      const hydrated = await hydrateFormulasFromMaster(current);
      await persistResources(contractId, hydrated);
      await qc.invalidateQueries({ queryKey: ["admin", "contract-resources", contractId] });
      toast.success(`Formulas synced from master for ${label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sync formulas");
    } finally {
      setSyncingId(null);
    }
  }
  const [tab, setTab] = useState<RecordType>("client");
  const [approvalTarget, setApprovalTarget] = useState<{
    contract: ClientContract;
    mode: ApprovalMode;
  } | null>(null);

  const enriched = useMemo(() => {
    return items.map((c) => {
      const unit = unitById.get(c.unitId);
      const org = unit?.customerId ? customerById.get(unit.customerId) : undefined;
      return {
        ...c,
        unitName: unit?.name ?? "—",
        unitCode: unit?.code ?? "",
        orgName: org?.name ?? "—",
        orgId: org?.id ?? "",
      };
    });
  }, [items, unitById, customerById]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((c) => {
      if (c.recordType !== tab) return false;
      if (tab === "client" && statusFilter !== "all" && c.status !== statusFilter) return false;
      if (orgFilter !== "all" && c.orgId !== orgFilter) return false;
      if (unitFilter !== "all" && c.unitId !== unitFilter) return false;
      if (!q) return true;
      return (
        c.contractCode.toLowerCase().includes(q) ||
        c.prospectCode.toLowerCase().includes(q) ||
        c.unitName.toLowerCase().includes(q) ||
        c.unitCode.toLowerCase().includes(q) ||
        c.orgName.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    });
  }, [enriched, query, statusFilter, orgFilter, unitFilter, tab]);

  const hasFilters =
    !!query || orgFilter !== "all" || unitFilter !== "all" || statusFilter !== "all";

  const tabCounts = useMemo(() => {
    let prospects = 0;
    let clients = 0;
    for (const c of items) {
      if (c.recordType === "client") clients++;
      else prospects++;
    }
    return { prospects, clients };
  }, [items]);

  // Merged stats — show both client AND prospect health at the top of the page.
  const overview = useMemo(() => {
    let activeClients = 0;
    let inactiveClients = 0;
    let expiredClients = 0;
    let pendingProspects = 0;
    let rejectedProspects = 0;
    let lostProspects = 0;
    for (const c of items) {
      if (c.recordType === "client") {
        if (c.status === "active") activeClients++;
        else if (c.status === "inactive") inactiveClients++;
        else if (c.status === "expired") expiredClients++;
      } else {
        if (c.prospectStage === "lost") lostProspects++;
        else if (c.approvalStatus === "rejected") rejectedProspects++;
        else pendingProspects++;
      }
    }
    return {
      total: items.length,
      activeClients,
      inactiveClients: inactiveClients + expiredClients,
      pendingProspects,
      rejectedProspects,
      lostProspects,
    };
  }, [items]);

  return (
    <div>
      <PageHeader
        title="Client Contracts"
        eyebrow="Contracts"
        description="Manage client contracts across organisations and units."
        crumbs={[{ label: "Contracts" }, { label: "Client Contracts" }]}
        kpis={
          <>
            <PageStat label="Clients + Prospects" value={overview.total} />
            <PageStat label="Active Clients" value={overview.activeClients} tone="accent" />
            <PageStat label="Inactive / Expired" value={overview.inactiveClients} tone="warning" />
            <PageStat label="Awaiting Approval" value={overview.pendingProspects} tone="warning" />
            <PageStat label="Rejected" value={overview.rejectedProspects} tone="destructive" />
            <PageStat label="Lost" value={overview.lostProspects} tone="destructive" />
          </>
        }
      />


      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as RecordType);
          setStatusFilter("all");
        }}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="client">
            Clients <span className="ml-1.5 text-xs text-muted-foreground">({tabCounts.clients})</span>
          </TabsTrigger>
          <TabsTrigger value="prospect">
            Prospects <span className="ml-1.5 text-xs text-muted-foreground">({tabCounts.prospects})</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mb-4 flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={filtered.length === 0}
          onClick={() =>
            downloadCsv(
              "client-contracts",
              filtered.map((c) => ({
                code: c.contractCode,
                organization: c.orgName,
                unit: `${c.unitCode} – ${c.unitName}`,
                start: csvDate(c.startDate),
                end: csvDate(c.endDate),
                description: c.description,
                gst: c.gstOption.toUpperCase(),
                status: c.status,
              })),
              [
                { key: "code", header: "Contract ID" },
                { key: "organization", header: "Organization" },
                { key: "unit", header: "Unit" },
                { key: "start", header: "Start date" },
                { key: "end", header: "End date" },
                { key: "description", header: "Description" },
                { key: "gst", header: "GST option" },
                { key: "status", header: "Status" },
              ],
            )
          }
          className="h-10 rounded-lg"
        >
          <Download className="mr-1.5 h-4 w-4" />
          Export Contracts
        </Button>
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const buf = await file.arrayBuffer();
              const res = await importContractFromXlsx(buf);
              toast.success(
                `Contract ${res.contractCode} ${res.action === "created" ? "imported" : "updated"} from Excel`,
              );
              await qc.invalidateQueries({ queryKey: QK });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Import failed");
            }
          }}
        />
        <Button
          variant="outline"
          onClick={() => importInputRef.current?.click()}
          className="h-10 rounded-lg"
        >
          <Upload className="mr-1.5 h-4 w-4" />
          Import Contract
        </Button>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Create Contract
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,200px))_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by contract ID, unit, organisation…"
              className="h-10 rounded-lg pl-9"
            />
          </div>
          <Select
            value={orgFilter}
            onValueChange={(v) => {
              setOrgFilter(v);
              setUnitFilter("all");
            }}
          >
            <SelectTrigger className="h-10 rounded-lg">
              <SelectValue placeholder="Organization" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All organizations</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={unitFilter} onValueChange={setUnitFilter}>
            <SelectTrigger className="h-10 rounded-lg">
              <SelectValue placeholder="Unit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All units</SelectItem>
              {units
                .filter((u) => orgFilter === "all" || u.customerId === orgFilter)
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.code} – {u.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 rounded-lg">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="h-10 rounded-lg"
            disabled={!hasFilters}
            onClick={() => {
              setQuery("");
              setOrgFilter("all");
              setUnitFilter("all");
              setStatusFilter("all");
            }}
          >
            <X className="mr-1.5 h-4 w-4" /> Clear
          </Button>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {items.length} contracts
        </div>
      </div>

      <div className="ios-table-card overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-clip">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3" data-col="code">{tab === "client" ? "Contract ID" : "Prospect ID"}</th>
                <th className="px-5 py-3">Organization</th>
                <th className="px-5 py-3">Unit</th>
                {tab === "client" ? (
                  <>
                    <th className="px-5 py-3" data-col="date">Start</th>
                    <th className="px-5 py-3" data-col="date">End</th>
                  </>
                ) : (
                  <th className="px-5 py-3" data-col="date">Start</th>
                )}
                <th className="px-5 py-3" data-col={tab === "client" ? "status" : "approval"}>{tab === "client" ? "Status" : "Approval"}</th>
                <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-accent" data-col="code">
                    {tab === "client" ? c.contractCode : c.prospectCode}
                  </td>
                  <td className="px-5 py-3 font-medium text-foreground">
                    <span className="cell-primary">{c.orgName}</span>
                  </td>
                  <td className="px-5 py-3 text-foreground">
                    <div className="cell-stack">
                      <span className="cell-secondary font-mono">{c.unitCode}</span>
                      <span className="cell-primary">{c.unitName}</span>
                    </div>
                  </td>
                  {tab === "client" ? (
                  <>
                    <td className="px-5 py-3 text-muted-foreground" data-col="date">{c.startDate || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground" data-col="date">{c.endDate || "—"}</td>
                  </>
                ) : (
                  <td className="px-5 py-3 text-muted-foreground" data-col="date">
                    {c.startDate || "—"}
                  </td>
                )}
                <td className="px-5 py-3" data-col={tab === "client" ? "status" : "approval"}>
                    {tab === "client" ? (
                      <StatusBadge status={c.status} />
                    ) : c.prospectStage === "lost" ? (
                      <LostBadge />
                    ) : (
                      <ApprovalBadge
                        status={c.approvalStatus}
                        reason={c.rejectionReason}
                      />
                    )}
                  </td>
                  <td className="px-5 py-3 text-right" data-col="actions">
                    <div className="inline-flex gap-1">
                      {tab === "prospect" &&
                        c.approvalStatus === "pending" &&
                        c.prospectStage !== "lost" &&
                        canApprove && (
                          <>
                            <Button
                              size="icon"
                              data-variant="success"
                              className="h-8 w-8 rounded-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                              onClick={() => setApprovalTarget({ contract: c, mode: "approve" })}
                              title="Approve & sign — promote to client"
                              aria-label="Approve"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              data-variant="danger"
                              variant="outline"
                              className="h-8 w-8 rounded-full border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                              onClick={() => setApprovalTarget({ contract: c, mode: "reject" })}
                              title="Reject"
                              aria-label="Reject"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      {tab === "prospect" &&
                        c.approvalStatus === "rejected" &&
                        c.prospectStage !== "lost" &&
                        canEdit && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground hover:text-accent"
                            onClick={() =>
                              resubmitMut.mutate({ id: c.id, prospectCode: c.prospectCode })
                            }
                            title="Resubmit this prospect for approval"
                            aria-label="Resubmit"
                          >
                            <RefreshCcw className="h-4 w-4" />
                          </Button>
                        )}
                      {tab === "prospect" &&
                        c.approvalStatus === "pending" &&
                        c.prospectStage !== "lost" &&
                        canEdit && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground"
                            onClick={() =>
                              updateStageMut.mutate({
                                id: c.id,
                                stage: "lost",
                                label: c.prospectCode,
                              })
                            }
                            title="Mark prospect as lost (stays in prospects)"
                            aria-label="Mark Lost"
                          >
                            <Flag className="h-4 w-4" />
                          </Button>
                        )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-accent"
                        onClick={async () => {
                          try {
                            await exportContractToXlsx(c);
                            toast.success(`Exported ${c.contractCode || c.prospectCode}.xlsx`);
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Export failed");
                          }
                        }}
                        aria-label="Export to Excel"
                        title="Export to Excel"
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => handleSyncFormulas(c.id, c.contractCode || "contract")}
                        disabled={syncingId === c.id}
                        aria-label="Sync formulas from master"
                        title="Sync formulas from Allowance / Cost Component Manager"
                      >
                        <RefreshCcw className={`h-4 w-4 ${syncingId === c.id ? "animate-spin" : ""}`} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditing(c);
                          setFormOpen(true);
                        }}
                        aria-label="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <DeleteGuardButton
                        id={c.id}
                        entityLabel="contract"
                        checks={[
                          { table: "contract_resources", column: "contract_id", label: "resource lines" },
                        ]}
                        onDelete={() => setDeleting(c)}
                      />

                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    <FileText className="mx-auto mb-2 h-6 w-6 opacity-50" />
                    {items.length === 0
                      ? "No contracts yet. Create your first contract to get started."
                      : tab === "prospect"
                        ? "No prospects match your filters."
                        : "No clients match your filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ContractFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        editing={editing}
        existingProspectCodes={items.map((i) => i.prospectCode).filter((c): c is string => !!c)}
        onSubmit={async (p, resources) => {
          try {
            let contractId: string;
            if (editing) {
              await updateMut.mutateAsync({ id: editing.id, p, canApproveApproval: canApprove });
              contractId = editing.id;
            } else {
              contractId = await addMut.mutateAsync(p);
            }
            await persistResources(contractId, resources);
            await qc.invalidateQueries({ queryKey: ["admin", "contract-resources", contractId] });
            toast.success(editing ? "Contract updated" : "Contract created");
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not save contract";
          }
        }}
        canManageApproval={canApprove}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this contract?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <span className="font-mono font-semibold text-foreground">
                  {deleting.contractCode}
                </span>
              )}
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
                  toast.success("Contract deleted");
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

      <ContractApprovalDialog
        open={!!approvalTarget}
        onOpenChange={(o) => !o && setApprovalTarget(null)}
        mode={approvalTarget?.mode ?? "approve"}
        contract={
          approvalTarget
            ? {
                id: approvalTarget.contract.id,
                prospectCode: approvalTarget.contract.prospectCode,
                contractCode: approvalTarget.contract.contractCode,
                createdBy: approvalTarget.contract.createdBy,
              }
            : null
        }
        onDone={() => {
          void qc.invalidateQueries({ queryKey: QK });
          setApprovalTarget(null);
        }}
      />
    </div>
  );
}

function ApprovalBadge({ status, reason }: { status: ApprovalStatus; reason?: string }) {
  const map: Record<ApprovalStatus, { cls: string; label: string }> = {
    pending: { cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", label: "Pending" },
    approved: { cls: "bg-accent/15 text-accent", label: "Approved" },
    rejected: { cls: "bg-destructive/15 text-destructive", label: "Rejected" },
  };
  const { cls, label } = map[status];
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
          cls,
        )}
        title={status === "rejected" && reason ? reason : undefined}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {label}
      </span>
      {status === "rejected" && reason ? (
        <span className="max-w-[220px] truncate text-[11px] text-destructive/80" title={reason}>
          {reason}
        </span>
      ) : null}
    </div>
  );
}

function LostBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      Lost
    </span>
  );
}


function StatusBadge({ status }: { status: ContractStatus }) {
  const map: Record<ContractStatus, string> = {
    active: "bg-accent/15 text-accent",
    inactive: "bg-muted text-muted-foreground",
    expired: "bg-destructive/15 text-destructive",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
        map[status],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function ContractFormDialog({
  open,
  onOpenChange,
  editing,
  existingProspectCodes,
  onSubmit,
  canManageApproval,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: ClientContract | null;
  existingProspectCodes: string[];
  onSubmit: (
    p: Omit<ClientContract, "id">,
    resources: ContractResource[],
  ) => Promise<string | null>;
  canManageApproval: boolean;
}) {
  const { units } = useUnits();
  const { customers } = useCustomers();
  const serviceTypes = useServiceTypes();
  const payrollWindows = usePayrollWindows();
  const billingTypes = useBillingTypes();
  const esicBranches = useEsicBranches();

  const customerById = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers],
  );

  const [contractCode, setContractCode] = useState("");
  const [prospectCode, setProspectCode] = useState("");
  const [unitId, setUnitId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [originalStartDate, setOriginalStartDate] = useState("");
  const [renewalCount, setRenewalCount] = useState(0);
  const expiryManuallySetRef = useRef(false);
  const [description, setDescription] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState<string>("");
  const [payrollWindowId, setPayrollWindowId] = useState<string>("");
  const [billingTypeId, setBillingTypeId] = useState<string>("");
  const [esicBranchId, setEsicBranchId] = useState<string>("");
  const [gstOption, setGstOption] = useState<GstOption>("csgst");
  const [approvalValue, setApprovalValue] = useState<ApprovalPickerValue>(null);
  const [unitPickerOpen, setUnitPickerOpen] = useState(false);
  const [unitQuery, setUnitQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [resources, setResources] = useState<ContractResource[]>([]);
  const [savedResourcesSnapshot, setSavedResourcesSnapshot] = useState("[]");
  const [hasStagedResourceChanges, setHasStagedResourceChanges] = useState(false);
  const [resourceDialog, setResourceDialog] = useState<{
    open: boolean;
    index: number | null;
    initial: ContractResource | null;
  }>({ open: false, index: null, initial: null });

  const existingResources = useContractResources(editing?.id ?? null);
  const existingResourcesSnapshot = useMemo(
    () => serializeContractResources(existingResources),
    [existingResources],
  );
  const resourcesSnapshot = useMemo(() => serializeContractResources(resources), [resources]);
  const qc = useQueryClient();

  const auditQ = useQuery({
    queryKey: ["contract-audit", editing?.id],
    enabled: !!editing?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_contracts" as never)
        .select(
          "approval_status,approved_by,approved_at,rejected_by,rejected_at,rejection_reason,company_signature_data,signed_at",
        )
        .eq("id", editing!.id)
        .maybeSingle();
      if (error) throw error;
      const row = data as Record<string, unknown> | null;
      const lookup = async (uid: string | null) => {
        if (!uid) return null;
        const { data: n } = await supabase.rpc("get_user_display_name" as never, {
          _user_id: uid,
        } as never);
        const arr = n as Array<{ full_name?: string; role_key?: string }> | null;
        return arr && arr[0] ? arr[0] : null;
      };
      const approver = await lookup((row?.approved_by as string | null) ?? null);
      const rejecter = await lookup((row?.rejected_by as string | null) ?? null);
      return { row, approver, rejecter };
    },
  });
  const audit = auditQ.data;

  // Reset when opened
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setContractCode(editing.contractCode);
      setProspectCode(editing.prospectCode);
      setUnitId(editing.unitId);
      setStartDate(editing.startDate);
      setEndDate(editing.endDate);
      setExpiryDate(editing.expiryDate);
      setOriginalStartDate(editing.originalStartDate || editing.startDate || "");
      setRenewalCount(editing.renewalCount ?? 0);
      expiryManuallySetRef.current = !!editing.expiryDate;
      setDescription(editing.description);
      setServiceTypeId(editing.serviceTypeId ?? "");
      setPayrollWindowId(editing.payrollWindowId ?? "");
      setBillingTypeId(editing.billingTypeId ?? "");
      setEsicBranchId(editing.esicBranchId ?? "");
      setGstOption(editing.gstOption);
      setApprovalValue(getApprovalPickerValue(editing));
    } else {
      setContractCode("");
      setProspectCode(nextProspectCode(existingProspectCodes));
      setUnitId("");
      setStartDate("");
      setEndDate("");
      setExpiryDate("");
      setOriginalStartDate("");
      setRenewalCount(0);
      expiryManuallySetRef.current = false;
      setDescription("");
      setServiceTypeId("");
      setPayrollWindowId("");
      setBillingTypeId("");
      setEsicBranchId("");
      setGstOption("csgst");
      setApprovalValue(null);
    }
    setResources([]);
    setSavedResourcesSnapshot("[]");
    setHasStagedResourceChanges(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  // Auto-derive expiry date = start date + 6 months (unless user manually overrode).
  useEffect(() => {
    if (!open) return;
    if (!startDate) return;
    if (expiryManuallySetRef.current) return;
    const derived = addMonthsISO(startDate, 6);
    setExpiryDate((prev) => (prev === derived ? prev : derived));
  }, [startDate, open]);

  // Total renewal checkpoints over the whole contract span (one every 6 months).
  const totalRenewalCheckpoints = useMemo(() => {
    const months = monthsBetweenISO(startDate, endDate);
    if (months <= 0) return 0;
    return Math.max(1, Math.floor(months / 6));
  }, [startDate, endDate]);
  const currentCheckpoint = Math.min(totalRenewalCheckpoints || 0, (renewalCount ?? 0) + 1);

  // Hydrate existing resources when editing
  useEffect(() => {
    if (!open || !editing || existingResources.length === 0) return;
    const clonedResources = existingResources.map(cloneContractResource);
    const snapshot = serializeContractResources(clonedResources);
    if (resources.length > 0 && resourcesSnapshot !== savedResourcesSnapshot) return;
    if (resourcesSnapshot === snapshot && savedResourcesSnapshot === snapshot) return;
    setResources(clonedResources);
    setSavedResourcesSnapshot(snapshot);
    setHasStagedResourceChanges(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id, existingResources.length, existingResourcesSnapshot, resources.length, resourcesSnapshot, savedResourcesSnapshot]);

  const selectedUnit = units.find((u) => u.id === unitId);
  const selectedOrg = selectedUnit?.customerId
    ? customerById.get(selectedUnit.customerId)
    : undefined;

  // Auto-fill contract start/end from the selected unit's contract period.
  // Only overwrite when the field is empty so the user can still edit.
  useEffect(() => {
    if (!selectedUnit) return;
    if (selectedUnit.contractStartDate) {
      setStartDate((prev) => prev || selectedUnit.contractStartDate);
    }
    if (selectedUnit.contractEndDate) {
      setEndDate((prev) => prev || selectedUnit.contractEndDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnit?.id]);
  const filteredUnits = useMemo(() => {
    const query = unitQuery.trim().toLowerCase();
    if (!query) return units;
    return units.filter((u) => {
      const org = u.customerId ? customerById.get(u.customerId) : null;
      return [u.code, u.name, org?.name ?? "", u.id]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [customerById, unitQuery, units]);

  const selectedWindow = payrollWindows.find((w) => w.id === payrollWindowId);
  const payDate = selectedWindow ? `Day ${selectedWindow.processingDay}` : "—";
  const billingDates = selectedWindow
    ? `${selectedWindow.windowStartDay} – ${selectedWindow.windowEndDay}`
    : "—";
  const resourceSaveBypassEnabled = hasStagedResourceChanges || resourcesSnapshot !== savedResourcesSnapshot;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>{editing ? "Edit Contract" : "Create Contract"}</DialogTitle>
              <DialogDescription>
                Capture client information, payroll, billing and GST settings.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>


        <div className="space-y-5 py-2">
          {/* Client Information */}
          <Section title="Client Information">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contract ID">
                <Input
                  value={editing && editing.recordType === "client" ? contractCode : prospectCode}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (editing && editing.recordType === "client") setContractCode(v);
                    else setProspectCode(v);
                  }}
                  className="font-mono"
                />
              </Field>
              <Field label="Unit ID *">
                <Popover open={unitPickerOpen} onOpenChange={setUnitPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="h-10 w-full justify-between rounded-lg font-normal"
                    >
                      {selectedUnit ? (
                        <span className="truncate font-mono text-xs">
                          {selectedUnit.code}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Search unit ID…</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search by unit ID or name…"
                        value={unitQuery}
                        onValueChange={setUnitQuery}
                      />
                      <CommandList>
                        <CommandEmpty>No units found.</CommandEmpty>
                        <CommandGroup>
                          {filteredUnits.map((u) => {
                            const org = u.customerId ? customerById.get(u.customerId) : null;
                            return (
                              <CommandItem
                                key={u.id}
                                value={`${u.code} ${u.name} ${org?.name ?? ""} ${u.id}`}
                                onSelect={() => {
                                  setUnitId(u.id);
                                  setUnitQuery("");
                                  setUnitPickerOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    unitId === u.id ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span className="font-mono text-xs font-semibold text-accent">
                                    {u.code}
                                  </span>
                                  <span className="text-sm">{u.name}</span>
                                  {org && (
                                    <span className="text-xs text-muted-foreground">
                                      {org.name}
                                    </span>
                                  )}
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </Field>
              <Field label="Unit Name">
                <Input value={selectedUnit?.name ?? ""} readOnly placeholder="Auto-filled" />
              </Field>
              <Field label="Organization Name">
                <Input value={selectedOrg?.name ?? ""} readOnly placeholder="Auto-filled" />
              </Field>
            </div>
          </Section>

          {/* Approval Audit Trail */}
          {editing && audit?.row ? (
            <Section title="Approval Audit Trail">
              {(() => {
                const r = audit.row as Record<string, unknown>;
                const status = String(r.approval_status ?? "pending");
                const approvedAt = r.approved_at as string | null;
                const rejectedAt = r.rejected_at as string | null;
                const signedAt = r.signed_at as string | null;
                const reason = String(r.rejection_reason ?? "");
                
                const fmt = (iso: string | null) =>
                  iso ? new Date(iso).toLocaleString() : "—";
                return (
                  <div className="space-y-4">
                    {status === "approved" && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-muted-foreground">
                            Approved By
                          </div>
                          <div className="text-sm font-medium">
                            {audit.approver?.full_name ?? "—"}
                            {audit.approver?.role_key ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({audit.approver.role_key})
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-muted-foreground">
                            Approved At
                          </div>
                          <div className="text-sm">{fmt(approvedAt ?? signedAt)}</div>
                        </div>
                      </div>
                    )}
                    {status === "rejected" && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-muted-foreground">
                            Rejected By
                          </div>
                          <div className="text-sm font-medium">
                            {audit.rejecter?.full_name ?? "—"}
                            {audit.rejecter?.role_key ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({audit.rejecter.role_key})
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-muted-foreground">
                            Rejected At
                          </div>
                          <div className="text-sm">{fmt(rejectedAt)}</div>
                        </div>
                        {reason && (
                          <div className="sm:col-span-2 space-y-1">
                            <div className="text-xs font-semibold text-muted-foreground">
                              Reason
                            </div>
                            <div className="rounded-md border bg-muted/30 p-2 text-sm">
                              {reason}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {status === "pending" && (
                      <div className="text-sm italic text-muted-foreground">
                        Awaiting approval.
                      </div>
                    )}

                  </div>
                );
              })()}
            </Section>
          ) : null}


          {/* General Information */}
          <Section title="General Information">
            <div className="grid gap-4 sm:grid-cols-2">
              {editing ? (
                <Field label="Approval">
                  <Select
                    value={approvalValue ?? undefined}
                    onValueChange={(v) => setApprovalValue(v as Exclude<ApprovalPickerValue, null>)}
                    disabled={!canManageApproval}
                  >
                    <SelectTrigger className="h-10 rounded-lg">
                      <SelectValue placeholder="Pending" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
              <Field label="Contract start date">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    expiryManuallySetRef.current = false;
                  }}
                />
                {originalStartDate && originalStartDate !== startDate ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Client onboarded on{" "}
                    <span className="font-medium text-foreground">{originalStartDate}</span>{" "}
                    (preserved across renewals).
                  </p>
                ) : null}
              </Field>
              <Field label="Contract end date">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </Field>
              <Field label="Next renewal / expiry date" className="sm:col-span-2">
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => {
                    setExpiryDate(e.target.value);
                    expiryManuallySetRef.current = true;
                  }}
                />


                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Auto-set to 6 months after start. Renewal happens every 6 months.</span>
                  {totalRenewalCheckpoints > 0 ? (
                    <span className="font-medium text-foreground">
                      Checkpoint {currentCheckpoint} of {totalRenewalCheckpoints}
                    </span>
                  ) : null}
                </div>
              </Field>

              <Field label="Service Type">
                <Select
                  value={serviceTypeId || "none"}
                  onValueChange={(v) => setServiceTypeId(v === "none" ? "" : v)}
                >
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue placeholder="Select service type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {serviceTypes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>


          {/* Payroll Information */}
          <Section title="Payroll Information">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Payroll Window">
                <Select
                  value={payrollWindowId || "none"}
                  onValueChange={(v) => setPayrollWindowId(v === "none" ? "" : v)}
                >
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue placeholder="Select window" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {payrollWindows.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.label} ({w.windowStartDay}–{w.windowEndDay})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Pay Date (auto)">
                <Input value={payDate} readOnly />
              </Field>
              <Field label="Billing Dates (auto)">
                <Input value={billingDates} readOnly />
              </Field>
              <div className="sm:col-span-3">
                <Field label="Billing Type">
                  <Select
                    value={billingTypeId || "none"}
                    onValueChange={(v) => setBillingTypeId(v === "none" ? "" : v)}
                  >
                    <SelectTrigger className="h-10 rounded-lg">
                      <SelectValue placeholder="Select billing type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {billingTypes.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="sm:col-span-3">
                <Field label="ESIC Subcode">
                  <Select
                    value={esicBranchId || "none"}
                    onValueChange={(v) => setEsicBranchId(v === "none" ? "" : v)}
                  >
                    <SelectTrigger className="h-10 rounded-lg">
                      <SelectValue placeholder="Select ESIC subcode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {esicBranches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          <span className="font-mono text-xs">{b.esicCode}</span>
                          {b.location ? ` — ${b.location}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          </Section>

          {/* GST */}
          <Section title="GST">
            {selectedUnit ? (
              <div className="mb-4 grid gap-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">PAN</div>
                  <div className="font-medium">{selectedUnit.panNumber || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">GST type</div>
                  <div className="font-medium">
                    {selectedUnit.gstPayable ? (selectedUnit.gstType || "—") : "Not payable"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">GST number</div>
                  <div className="font-medium">
                    {selectedUnit.gstPayable ? (selectedUnit.gstNumber || "—") : "—"}
                  </div>
                </div>
                <div className="sm:col-span-3 text-[11px] text-muted-foreground">
                  Manage these in Unit Manager.
                </div>
              </div>
            ) : (
              <div className="mb-4 text-sm italic text-muted-foreground">
                Select a unit to view its GST information.
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  { value: "csgst", label: "CGST + SGST" },
                  { value: "igst", label: "IGST" },
                  { value: "none", label: "No GST" },
                ] as { value: GstOption; label: string }[]
              ).map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    gstOption === opt.value
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border bg-card hover:bg-secondary/40",
                  )}
                >
                  <input
                    type="radio"
                    name="gst-option"
                    value={opt.value}
                    checked={gstOption === opt.value}
                    onChange={() => setGstOption(opt.value)}
                    className="h-4 w-4 accent-accent"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </Section>

          {/* Resources */}
          <ResourcesSection
            resources={resources}
            onAdd={() =>
              setResourceDialog({ open: true, index: null, initial: null })
            }
            onEdit={(idx) =>
              setResourceDialog({
                open: true,
                index: idx,
                initial: cloneContractResource(resources[idx]),
              })
            }
            onCopy={(idx) =>
              setResourceDialog({
                open: true,
                index: null,
                initial: { ...cloneContractResource(resources[idx]), id: undefined },
              })
            }
            onDelete={(idx) => {
              setResources((prev) => prev.filter((_, i) => i !== idx));
              setHasStagedResourceChanges(true);
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            data-force-enabled={resourceSaveBypassEnabled ? "true" : undefined}
            onClick={async () => {
              if (!unitId) {
                toast.error("Please select a unit");
                return;
              }
              const payload = applyApprovalPickerToPayload({
                contractCode,
                prospectCode,
                recordType: editing?.recordType ?? "prospect",
                unitId,
                startDate,
                endDate,
                expiryDate,
                originalStartDate: originalStartDate || startDate,
                renewalCount,
                description,
                serviceTypeId: serviceTypeId || null,
                payrollWindowId: payrollWindowId || null,
                billingTypeId: billingTypeId || null,
                esicBranchId: esicBranchId || null,
                gstOption,
                status: editing?.status ?? "inactive",
                approvalStatus: editing?.approvalStatus ?? "pending",
                prospectStage: editing?.prospectStage ?? "new",
                rejectionReason: editing?.rejectionReason ?? "",
                createdBy: editing?.createdBy ?? null,
                promotedAt: editing?.promotedAt ?? null,
              }, approvalValue, editing);
              const ok = await confirmAction({
                title: editing ? "Confirm changes?" : "Create contract?",
                description: editing
                  ? "Are you sure you want to confirm and save these contract changes? The updated resource amounts will be used across payroll and related screens."
                  : "This will create the contract and save all resource details.",
                confirmText: editing ? "Yes, Save Changes" : "Create Contract",
                cancelText: "Review Again",
              });
              if (!ok) return;
              setSaving(true);
              try {
                const resourcesToSave = resources.map(cloneContractResource);
                const err = await onSubmit(payload, resourcesToSave);
                if (err) toast.error(err);
                else {
                  setSavedResourcesSnapshot(serializeContractResources(resourcesToSave));
                  setHasStagedResourceChanges(false);
                  onOpenChange(false);
                }
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Create Contract"}
          </Button>
        </DialogFooter>

        <ResourceFormDialog
          open={resourceDialog.open}
          initial={resourceDialog.initial}
          onOpenChange={(o) =>
            setResourceDialog((s) => ({ ...s, open: o }))
          }
          onSubmit={(r) => {
            const stagedResource = cloneContractResource(r);
            const nextResources =
              resourceDialog.index !== null
                ? resources.map((x, i) => (i === resourceDialog.index ? stagedResource : x))
                : [...resources, stagedResource];
            setResources(nextResources);
            setHasStagedResourceChanges(true);
            setResourceDialog({ open: false, index: null, initial: null });
            toast.message("Resource staged — click Save Changes to confirm");
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

const DECIMAL_INPUT_REGEX = /^\d*\.?\d*$/;

function DecimalAmountInput({
  value,
  onValueChange,
  className,
}: {
  value: number;
  onValueChange: (amount: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value === 0 ? "" : String(value));
  const editingRef = useRef(false);

  useEffect(() => {
    if (!editingRef.current) {
      setDraft(value === 0 ? "" : String(value));
    }
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder="0.00"
      className={className}
      value={draft}
      onChange={(e) => {
        const next = e.target.value.trim();
        if (!DECIMAL_INPUT_REGEX.test(next)) return;
        setDraft(next);
        if (next === "" || next === ".") {
          onValueChange(0);
          return;
        }
        const parsed = Number.parseFloat(next);
        if (Number.isFinite(parsed)) {
          onValueChange(parsed);
        }
      }}
      onFocus={(e) => {
        editingRef.current = true;
        e.target.select();
      }}
      onBlur={() => {
        editingRef.current = false;
        const next = draft.trim();
        if (next === "" || next === ".") {
          setDraft("");
          onValueChange(0);
          return;
        }
        const parsed = Number.parseFloat(next);
        if (!Number.isFinite(parsed)) {
          setDraft(value === 0 ? "" : String(value));
          return;
        }
        onValueChange(parsed);
        setDraft(parsed === 0 ? "" : String(parsed));
      }}
    />
  );
}

function ResourcesSection({
  resources,
  onAdd,
  onEdit,
  onCopy,
  onDelete,
}: {
  resources: ContractResource[];
  onAdd: () => void;
  onEdit: (idx: number) => void;
  onCopy: (idx: number) => void;
  onDelete: (idx: number) => void;
}) {
  const designations = useDesignations();
  const serviceTypes = useServiceTypes();
  const dById = useMemo(
    () => new Map(designations.map((d) => [d.id, d])),
    [designations],
  );
  const sById = useMemo(
    () => new Map(serviceTypes.map((s) => [s.id, s])),
    [serviceTypes],
  );

  return (
    <Section title="Resources">
      {resources.length === 0 ? (
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card px-4 py-8 text-sm text-muted-foreground transition-colors hover:border-accent hover:bg-accent/5 hover:text-foreground"
        >
          <Users className="h-6 w-6 opacity-60" />
          <span className="font-medium">No resources mapped to the contract.</span>
          <span className="text-xs">Click here to add resources</span>
        </button>
      ) : (
        <div className="space-y-3">
          {resources.map((r, idx) => {
            const gross = r.components.reduce(
              (s, c) => s + (Number(c.amount) || 0),
              0,
            );
            const dn = dById.get(r.designationId);
            const sn = sById.get(r.serviceTypeId);
            return (
              <div
                key={idx}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {dn?.name ?? "—"}
                      </span>
                      {dn?.code && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {dn.code}
                        </span>
                      )}
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                        {sn?.name ?? "—"}
                      </span>
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                        Qty {r.quantity}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.components.map((c) => (
                        <span
                          key={c.allowanceId}
                          className="rounded bg-secondary/60 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {c.name}: {c.amount.toFixed(2)}
                        </span>
                      ))}
                      {r.components.length === 0 && (
                        <span className="text-[11px] italic text-muted-foreground">
                          No wage components
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 text-xs font-semibold text-foreground">
                      Gross: {gross.toFixed(2)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => onEdit(idx)}
                      aria-label="Edit"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => onCopy(idx)}
                      aria-label="Copy"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(idx)}
                      aria-label="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onAdd}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add another resource
          </Button>
        </div>
      )}
    </Section>
  );
}

function ResourceFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: ContractResource | null;
  onSubmit: (r: ContractResource) => void;
}) {
  const designations = useDesignations();
  const serviceTypes = useServiceTypes();
  const allowanceTypes = useAllowanceTypes();
  const payrollDayBases = usePayrollDayBases();
  const costComponents = useCostComponentOptions();
  const rolesList = useRolesList();

  const [designationId, setDesignationId] = useState("");
  const [roleKey, setRoleKey] = useState<string>("");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [components, setComponents] = useState<ResourceComponent[]>([]);
  const [payrollDayBaseId, setPayrollDayBaseId] = useState<string>("");
  const [benefits, setBenefits] = useState<BenefitItem[]>([]);
  const [deductions, setDeductions] = useState<BenefitItem[]>([]);
  const [employerContributions, setEmployerContributions] = useState<BenefitItem[]>([]);
  const [designationOpen, setDesignationOpen] = useState(false);
  const [allowancePickerOpen, setAllowancePickerOpen] = useState(false);
  const [designationQuery, setDesignationQuery] = useState("");
  const [allowanceQuery, setAllowanceQuery] = useState("");
  const [benefitPickerOpen, setBenefitPickerOpen] = useState(false);
  const [benefitQuery, setBenefitQuery] = useState("");
  const [deductionPickerOpen, setDeductionPickerOpen] = useState(false);
  const [deductionQuery, setDeductionQuery] = useState("");
  const [employerPickerOpen, setEmployerPickerOpen] = useState(false);
  const [employerQuery, setEmployerQuery] = useState("");
  const [resourceBaselineSnapshot, setResourceBaselineSnapshot] = useState("");
  const dialogContentRef = useRef<HTMLDivElement | null>(null);

  const preserveDialogScroll = (update: () => void) => {
    const scrollTop = dialogContentRef.current?.scrollTop ?? 0;
    update();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (dialogContentRef.current) {
          dialogContentRef.current.scrollTop = scrollTop;
        }
      });
    });
  };

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const nextComponents = (() => {
        return initial.components
          .map((c) => syncResourceComponentMasterFields(c, allowanceTypes));
      })();
      const nextBenefits = initial.benefits.map(cloneBenefitItem);
      const nextDeductions = (initial.deductions ?? []).map(cloneBenefitItem);
      const nextEmployerContributions = (initial.employerContributions ?? []).map(cloneBenefitItem);
      setDesignationId(initial.designationId);
      setRoleKey(initial.roleKey ?? "");
      setServiceTypeId(initial.serviceTypeId);
      setQuantity(String(initial.quantity));
      setComponents(nextComponents);
      setPayrollDayBaseId(initial.payrollDayBaseId ?? "");
      setBenefits(nextBenefits);
      setDeductions(nextDeductions);
      setEmployerContributions(nextEmployerContributions);
      setResourceBaselineSnapshot(serializeContractResources([{ ...initial, components: nextComponents, benefits: nextBenefits, deductions: nextDeductions, employerContributions: nextEmployerContributions }]));
    } else {
      const nextComponents = allowanceTypes
        .filter((a) => a.isDefault)
        .map((a) => ({
          allowanceId: a.id,
          name: a.shortName || a.displayName,
          amount: 0,
          includeInOt: a.includeInOt,
          formulaMode: a.formulaMode ?? null,
          formulaExpression: a.formulaExpression ?? null,
          formulaVersion: a.formulaVersion ?? null,
          fixedCalcMethod: a.fixedCalcMethod ?? "flat",
          fixedDutyComponents: a.fixedDutyComponents ?? [],
          fixedDutyDivisor: a.fixedDutyDivisor ?? "base_days",
        }));
      setDesignationId("");
      setServiceTypeId("");
      setQuantity("1");
      // Pre-load defaults from allowance types
      setComponents(nextComponents);
      setPayrollDayBaseId("");
      setBenefits([]);
      setDeductions([]);
      setEmployerContributions([]);
      setResourceBaselineSnapshot(serializeContractResources([{ designationId: "", serviceTypeId: "", quantity: 1, components: nextComponents, payrollDayBaseId: null, benefits: [], deductions: [], employerContributions: [] }]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, allowanceTypes.length]);

  const currentResourceSnapshot = useMemo(
    () =>
      serializeContractResources([
        {
          id: initial?.id,
          designationId,
          serviceTypeId,
          quantity: Number.parseInt(quantity, 10) || 1,
          components,
          payrollDayBaseId: payrollDayBaseId || null,
          benefits,
          deductions,
          employerContributions,
        },
      ]),
    [benefits, components, deductions, designationId, employerContributions, initial?.id, payrollDayBaseId, quantity, serviceTypeId],
  );
  const resourceHasChanges = resourceBaselineSnapshot !== "" && currentResourceSnapshot !== resourceBaselineSnapshot;

  const gross = components.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const usedIds = new Set(components.map((c) => c.allowanceId));
  const availableExtras = allowanceTypes.filter((a) => !usedIds.has(a.id));
  const filteredDesignations = useMemo(() => {
    const query = designationQuery.trim().toLowerCase();
    if (!query) return designations;
    return designations.filter((d) =>
      [d.code, d.name, d.id].join(" ").toLowerCase().includes(query),
    );
  }, [designationQuery, designations]);
  const filteredAvailableExtras = useMemo(() => {
    const query = allowanceQuery.trim().toLowerCase();
    if (!query) return availableExtras;
    return availableExtras.filter((a) =>
      [a.shortName, a.displayName, a.name, a.id]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [allowanceQuery, availableExtras]);

  // Recompute formula-based wage components (e.g. HRA = 5% of Basic + DA)
  // whenever any other component changes. Skips self-reference and no-ops
  // when the amount is unchanged so React doesn't re-render in a loop.
  useEffect(() => {
    setComponents((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        const at = findAllowanceForResourceComponent(c, allowanceTypes);
        if (!at) return c;
        const hasFormula = hasConfiguredFormula(at);
        if (!hasFormula && at.calcType !== "percentage") return c;
        const others = prev.filter((x) => x.allowanceId !== c.allowanceId);
        const newAmt = computeBenefitAmount(
          {
            calcType: at.calcType,
            percentage: at.percentage,
            baseComponents: at.baseComponents,
            capAmount: at.capAmount,
            capFlatAmount: null,
            amount: 0,
            formulaMode: at.formulaMode ?? null,
            formulaExpression: at.formulaExpression ?? null,
            name: at.shortName || at.displayName || at.name,
          },
          others,
          [],
          allowanceTypes,
        );
        const synced = {
          ...c,
          includeInOt: at.includeInOt,
          formulaMode: at.formulaMode ?? null,
          formulaExpression: at.formulaExpression ?? null,
          formulaVersion: at.formulaVersion ?? null,
          amount: newAmt,
        };
        const metaChanged =
          c.allowanceId !== synced.allowanceId ||
          c.name !== synced.name ||
          c.includeInOt !== synced.includeInOt ||
          c.formulaMode !== synced.formulaMode ||
          c.formulaExpression !== synced.formulaExpression ||
          c.formulaVersion !== synced.formulaVersion;
        if (!metaChanged && Math.abs((Number(c.amount) || 0) - newAmt) < 0.005) return c;
        changed = true;
        return synced;
      });
      return changed ? next : prev;
    });
  }, [components, allowanceTypes]);

  // Recompute percentage/formula benefits whenever wage components change
  const hasFormula = (b: BenefitItem) => hasConfiguredFormula(b);
  useEffect(() => {
    setBenefits((prev) =>
      prev.map((b) =>
        b.calcType === "percentage" || hasFormula(b)
          ? { ...b, amount: computeBenefitAmount(b, components, [], allowanceTypes) }
          : b,
      ),
    );
  }, [components, allowanceTypes]);

  // Deductions/employer contributions also depend on benefits (Gross = components + benefits)
  useEffect(() => {
    setDeductions((prev) =>
      prev.map((b) =>
        b.calcType === "percentage" || hasFormula(b)
          ? { ...b, amount: computeBenefitAmount(b, components, benefits, allowanceTypes) }
          : b,
      ),
    );
    setEmployerContributions((prev) => {
      const refsCtc = (b: BenefitItem) =>
        b.baseComponents.some((x) => {
          const l = x.label.trim().toLowerCase();
          return l === "ctc" || l === "total ctc";
        });
      const isMgmtFee = (b: BenefitItem) => /management\s*fee/i.test(b.name);
      const firstPass = prev.map((b) =>
        (b.calcType === "percentage" || hasFormula(b)) && !refsCtc(b)
          ? { ...b, amount: computeBenefitAmount(b, components, benefits, allowanceTypes) }
          : b,
      );
      const ctcBase = firstPass.filter((b) => !refsCtc(b) && !isMgmtFee(b));
      return firstPass.map((b) =>
        (b.calcType === "percentage" || hasFormula(b)) && refsCtc(b)
          ? { ...b, amount: computeBenefitAmount(b, components, benefits, allowanceTypes, ctcBase) }
          : b,
      );
    });
  }, [components, benefits, allowanceTypes]);

  // Overlay latest formula_mode / formula_expression from Cost Component master
  // onto loaded benefits/deductions/employer rows so existing contracts pick up
  // formula edits made in Control Center without needing to re-save the row.
  useEffect(() => {
    if (!costComponents.length) return;
    const byId = new Map(costComponents.map((c) => [c.id, c]));
    const overlay = (b: BenefitItem): BenefitItem => {
      const m = byId.get(b.costComponentId);
      if (!m) return b;
      const expr = m.formulaExpression ?? null;
      const mode = m.formulaMode ?? null;
      const ver = m.formulaVersion ?? null;
      if ((b.formulaExpression ?? null) === expr && (b.formulaMode ?? null) === mode && (b.formulaVersion ?? null) === ver) return b;
      return { ...b, formulaMode: mode, formulaExpression: expr, formulaVersion: ver };
    };
    setBenefits((prev) => {
      const next = prev.map(overlay);
      return next.some((b, i) => b !== prev[i]) ? next : prev;
    });
    setDeductions((prev) => {
      const next = prev.map(overlay);
      return next.some((b, i) => b !== prev[i]) ? next : prev;
    });
    setEmployerContributions((prev) => {
      const next = prev.map(overlay);
      return next.some((b, i) => b !== prev[i]) ? next : prev;
    });
  }, [costComponents]);

  const PT_SYNTHETIC_ID = "__pt__";
  const ptSynthetic: CostComponentOption = {
    id: PT_SYNTHETIC_ID,
    name: "Professional Tax (PT)",
    calcType: "fixed",
    percentage: 0,
    baseComponents: [],
    capAmount: null,
    capFlatAmount: null,
    amount: 0,
    state: "Per state slab (resolved at payroll from unit state, employee gender, earned gross)",
    deductionCalcType: "fixed_amount",
    fixedCalcMethod: "flat",
    fixedDutyComponents: [],
    fixedDutyDivisor: "base_days",
  };


  const usedBenefitIds = new Set(benefits.map((b) => b.costComponentId));
  const usedDeductionIds = new Set(deductions.map((b) => b.costComponentId));
  const usedEmployerIds = new Set(employerContributions.map((b) => b.costComponentId));
  const availableBenefits = costComponents.filter((c) => !usedBenefitIds.has(c.id));
  const availableDeductions: CostComponentOption[] = [
    ...costComponents.filter((c) => !usedDeductionIds.has(c.id)),
    ...(usedDeductionIds.has(PT_SYNTHETIC_ID) ? [] : [ptSynthetic]),
  ];
  const availableEmployer = costComponents.filter((c) => !usedEmployerIds.has(c.id));
  const filteredAvailableBenefits = useMemo(() => {
    const q = benefitQuery.trim().toLowerCase();
    if (!q) return availableBenefits;
    return availableBenefits.filter((c) =>
      [c.name, c.state, c.id].join(" ").toLowerCase().includes(q),
    );
  }, [benefitQuery, availableBenefits]);
  const filteredAvailableDeductions = useMemo(() => {
    const q = deductionQuery.trim().toLowerCase();
    if (!q) return availableDeductions;
    return availableDeductions.filter((c) =>
      [c.name, c.state, c.id].join(" ").toLowerCase().includes(q),
    );
  }, [deductionQuery, availableDeductions]);
  const filteredAvailableEmployer = useMemo(() => {
    const q = employerQuery.trim().toLowerCase();
    if (!q) return availableEmployer;
    return availableEmployer.filter((c) =>
      [c.name, c.state, c.id].join(" ").toLowerCase().includes(q),
    );
  }, [employerQuery, availableEmployer]);
  const benefitOptionsKey = useMemo(
    () => availableBenefits.map((c) => c.id).join("|") || "empty",
    [availableBenefits],
  );
  const deductionOptionsKey = useMemo(
    () => availableDeductions.map((c) => c.id).join("|") || "empty",
    [availableDeductions],
  );
  const employerOptionsKey = useMemo(
    () => availableEmployer.map((c) => c.id).join("|") || "empty",
    [availableEmployer],
  );

  const updateAmount = (allowanceId: string, amount: number) => {
    setComponents((prev) =>
      prev.map((c) => (c.allowanceId === allowanceId ? { ...c, amount } : c)),
    );
  };

  const removeComponent = (allowanceId: string) => {
    setComponents((prev) => prev.filter((c) => c.allowanceId !== allowanceId));
  };

  const addComponent = (a: AllowanceType) => {
    preserveDialogScroll(() => {
      setComponents((prev) => {
        const next: ResourceComponent = {
          allowanceId: a.id,
          name: a.shortName || a.displayName,
          amount: 0,
          includeInOt: a.includeInOt,
          formulaMode: a.formulaMode ?? null,
          formulaExpression: a.formulaExpression ?? null,
          formulaVersion: a.formulaVersion ?? null,
          fixedCalcMethod: a.fixedCalcMethod ?? "flat",
          fixedDutyComponents: a.fixedDutyComponents ?? [],
          fixedDutyDivisor: a.fixedDutyDivisor ?? "base_days",
        };
        const hasF = hasConfiguredFormula(a);
        if (a.calcType === "percentage" || hasF) {
          next.amount = computeBenefitAmount(
            {
              calcType: a.calcType,
              percentage: a.percentage,
              baseComponents: a.baseComponents,
              capAmount: a.capAmount,
              capFlatAmount: null,
              amount: 0,
              formulaMode: a.formulaMode ?? null,
              formulaExpression: a.formulaExpression ?? null,
              name: a.shortName || a.displayName || a.name,
            },
            prev,
            [],
            allowanceTypes,
          );
        }
        return [...prev, next];
      });
      setAllowanceQuery("");
      setAllowancePickerOpen(false);
    });
  };

  const addBenefit = (c: CostComponentOption) => {
    const benefit: BenefitItem = {
      costComponentId: c.id,
      name: c.name,
      calcType: c.calcType,
      percentage: c.percentage,
      baseComponents: c.baseComponents,
      capAmount: c.capAmount,
      capFlatAmount: c.capFlatAmount,
      amount: c.calcType === "fixed" ? Number(c.amount ?? 0) : 0,
      state: c.state,
      deductionCalcType: c.deductionCalcType,
      fixedCalcMethod: c.fixedCalcMethod,
      fixedDutyComponents: c.fixedDutyComponents,
      fixedDutyDivisor: c.fixedDutyDivisor,
      formulaMode: c.formulaMode ?? null,
      formulaExpression: c.formulaExpression ?? null,
      formulaVersion: c.formulaVersion ?? null,
    };
    const hasF = hasConfiguredFormula(benefit);
    if (benefit.calcType === "percentage" || hasF) {
      benefit.amount = computeBenefitAmount(benefit, components, [], allowanceTypes);
    }
    preserveDialogScroll(() => {
      setBenefits((prev) => [...prev, benefit]);
      setBenefitQuery("");
      setBenefitPickerOpen(false);
    });
  };

  const updateBenefitAmount = (id: string, amount: number) => {
    setBenefits((prev) => prev.map((b) => (b.costComponentId === id ? { ...b, amount } : b)));
  };

  const removeBenefit = (id: string) => {
    setBenefits((prev) => prev.filter((b) => b.costComponentId !== id));
  };

  const addDeduction = (c: CostComponentOption) => {
    const item: BenefitItem = {
      costComponentId: c.id,
      name: c.name,
      calcType: c.calcType,
      percentage: c.percentage,
      baseComponents: c.baseComponents,
      capAmount: c.capAmount,
      capFlatAmount: c.capFlatAmount,
      amount: c.calcType === "fixed" ? Number(c.amount ?? 0) : 0,
      state: c.state,
      deductionCalcType: c.deductionCalcType,
      fixedCalcMethod: c.fixedCalcMethod,
      fixedDutyComponents: c.fixedDutyComponents,
      fixedDutyDivisor: c.fixedDutyDivisor,
      formulaMode: c.formulaMode ?? null,
      formulaExpression: c.formulaExpression ?? null,
      formulaVersion: c.formulaVersion ?? null,
    };
    const hasF = hasConfiguredFormula(item);
    if (item.calcType === "percentage" || hasF) {
      item.amount = computeBenefitAmount(item, components, benefits, allowanceTypes);
    }
    preserveDialogScroll(() => {
      setDeductions((prev) => [...prev, item]);
      setDeductionQuery("");
      setDeductionPickerOpen(false);
    });
  };

  const updateDeductionAmount = (id: string, amount: number) => {
    setDeductions((prev) => prev.map((b) => (b.costComponentId === id ? { ...b, amount } : b)));
  };

  const removeDeduction = (id: string) => {
    setDeductions((prev) => prev.filter((b) => b.costComponentId !== id));
  };

  const addEmployerContribution = (c: CostComponentOption) => {
    const item: BenefitItem = {
      costComponentId: c.id,
      name: c.name,
      calcType: c.calcType,
      percentage: c.percentage,
      baseComponents: c.baseComponents,
      capAmount: c.capAmount,
      capFlatAmount: c.capFlatAmount,
      amount: c.calcType === "fixed" ? Number(c.amount ?? 0) : 0,
      state: c.state,
      deductionCalcType: c.deductionCalcType,
      fixedCalcMethod: c.fixedCalcMethod,
      fixedDutyComponents: c.fixedDutyComponents,
      fixedDutyDivisor: c.fixedDutyDivisor,
      formulaMode: c.formulaMode ?? null,
      formulaExpression: c.formulaExpression ?? null,
      formulaVersion: c.formulaVersion ?? null,
    };
    const hasF = hasConfiguredFormula(item);
    if (item.calcType === "percentage" || hasF) {
      const l = (s: string) => s.trim().toLowerCase();
      const refsCtc = item.baseComponents.some(
        (x) => l(x.label) === "ctc" || l(x.label) === "total ctc",
      );
      item.amount = computeBenefitAmount(
        item,
        components,
        benefits,
        allowanceTypes,
        refsCtc ? employerContributions : [],
      );
    }
    preserveDialogScroll(() => {
      setEmployerContributions((prev) => [...prev, item]);
      setEmployerQuery("");
      setEmployerPickerOpen(false);
    });
  };

  const updateEmployerAmount = (id: string, amount: number) => {
    setEmployerContributions((prev) => prev.map((b) => (b.costComponentId === id ? { ...b, amount } : b)));
  };

  const removeEmployerContribution = (id: string) => {
    setEmployerContributions((prev) => prev.filter((b) => b.costComponentId !== id));
  };

  const handleSubmit = () => {
    if (!designationId) {
      toast.error("Please select a designation");
      return;
    }
    if (!serviceTypeId) {
      toast.error("Please select a service type");
      return;
    }
    if (!payrollDayBaseId) {
      toast.error("Please select Payroll Days");
      return;
    }
    const q = parseInt(quantity, 10);
    if (!q || q < 1) {
      toast.error("Quantity must be at least 1");
      return;
    }
    onSubmit({
      id: initial?.id,
      designationId,
      serviceTypeId,
      quantity: q,
      components,
      payrollDayBaseId: payrollDayBaseId || null,
      benefits,
      deductions,
      employerContributions,
    });
  };

  const totalBenefits = benefits.reduce((s, b) => s + (Number(b.amount) || 0), 0);

  // Statutory ESI on the contract (full-month) gross. Percentages and the
  // wage ceiling are driven by the ESI cost components configured in
  // Control Center → Cost Component Manager (employee & employer entries).
  // Falls back to statutory defaults (0.75% / 3.25% / ₹21,000) only if not set.
  const _esiComponentsTotal = components.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const _esiBenefitsTotal = benefits.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const _esiGross = _esiComponentsTotal + _esiBenefitsTotal;
  const _esiWashing = components
    .filter((c) => /\bwashing\b/i.test(c.name))
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const _esiConveyance = components
    .filter((c) => /\bconveyance\b|\bconv\.?\b/i.test(c.name))
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const _esiBase = Math.max(0, _esiGross - _esiWashing - _esiConveyance);
  const _esiEmpItem = deductions.find(isEsiItem);
  const _esiErItem = employerContributions.find(isEsiItem);
  const _esiEmpPct =
    _esiEmpItem && Number(_esiEmpItem.percentage) > 0 ? Number(_esiEmpItem.percentage) : 0.75;
  const _esiErPct =
    _esiErItem && Number(_esiErItem.percentage) > 0 ? Number(_esiErItem.percentage) : 3.25;
  const _esiCap =
    (_esiEmpItem && Number(_esiEmpItem.capAmount) > 0 && Number(_esiEmpItem.capAmount)) ||
    (_esiErItem && Number(_esiErItem.capAmount) > 0 && Number(_esiErItem.capAmount)) ||
    21000;
  // ESI ceiling applies to ESI wages (gross excluding washing & conveyance),
  // not raw gross — those allowances are statutorily excluded from ESI wages.
  const _esiEligible = _esiBase > 0 && _esiBase <= _esiCap;
  const esiEmployeeAmount = _esiEligible ? Math.ceil(_esiBase * (_esiEmpPct / 100)) : 0;
  const esiEmployerAmount = _esiEligible ? Math.ceil(_esiBase * (_esiErPct / 100)) : 0;

  const totalDeductions =
    deductions.reduce((s, b) => s + (isStatutoryEsi(b) ? esiEmployeeAmount : contractTotalAmount(b)), 0);
  const totalEmployer =
    employerContributions.reduce((s, b) => s + (isStatutoryEsi(b) ? esiEmployerAmount : contractTotalAmount(b)), 0);

  const selectedDesignation = designations.find((d) => d.id === designationId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        className="max-h-[92vh] overflow-y-auto sm:max-w-[min(92vw,1100px)]"
      >
        <DialogHeader>
          <DialogTitle>
            {initial?.id ? "Edit Resource" : "Add Resource"}
          </DialogTitle>
          <DialogDescription>
            Map a designation, service type and quantity, then configure wage
            components.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Designation *">
              <Popover open={designationOpen} onOpenChange={setDesignationOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="h-10 w-full justify-between rounded-lg font-normal"
                  >
                    {selectedDesignation ? (
                      <span className="truncate">
                        {selectedDesignation.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Select…</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                >
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search designation…"
                      value={designationQuery}
                      onValueChange={setDesignationQuery}
                    />
                    <CommandList>
                      <CommandEmpty>No designation found.</CommandEmpty>
                      <CommandGroup>
                        {filteredDesignations.map((d) => (
                          <CommandItem
                            key={d.id}
                            value={`${d.code} ${d.name} ${d.id}`}
                            onSelect={() => {
                              setDesignationId(d.id);
                              setDesignationQuery("");
                              setDesignationOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                designationId === d.id
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="text-sm">{d.name}</span>
                              {d.code && (
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  {d.code}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </Field>

            <Field label="Service Type *">
              <Select value={serviceTypeId} onValueChange={setServiceTypeId}>
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {serviceTypes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Agreed Deployment *">
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Payroll Days *">
            <Select value={payrollDayBaseId} onValueChange={setPayrollDayBaseId}>
              <SelectTrigger className="h-10 rounded-lg">
                <SelectValue placeholder="Select payroll-days rule" />
              </SelectTrigger>
              <SelectContent>
                {payrollDayBases.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex flex-col">
                      <span>{p.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {p.method === "fixed_days"
                          ? `Fixed ${p.fixedDays ?? 26} days`
                          : p.method === "actual_minus_weekly_off"
                            ? `Actual − weekly off`
                            : `Actual days in month`}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="rounded-xl border border-border bg-secondary/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Wages Components
              </h4>
              <Popover
                open={allowancePickerOpen}
                onOpenChange={setAllowancePickerOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={availableExtras.length === 0}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add allowance
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-72 p-0"
                  align="end"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search allowance…"
                      value={allowanceQuery}
                      onValueChange={setAllowanceQuery}
                    />
                    <CommandList>
                      <CommandEmpty>No more allowances.</CommandEmpty>
                      <CommandGroup>
                        {filteredAvailableExtras.map((a) => (
                          <CommandItem
                            key={a.id}
                            value={`${a.shortName} ${a.displayName} ${a.name} ${a.id}`}
                            onSelect={() => addComponent(a)}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm">
                                {a.shortName || a.displayName}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {a.displayName}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {components.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No wage components yet.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {components.map((c) => (
                  <div key={c.allowanceId} className="grid gap-1">
                    <Label className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                      <span className="truncate">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => removeComponent(c.allowanceId)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${c.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Label>
                    <DecimalAmountInput
                      value={c.amount}
                      onValueChange={(amount) => updateAmount(c.allowanceId, amount)}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center justify-end border-t border-border pt-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Gross
              </span>
              <span className="ml-3 text-base font-bold text-foreground">
                {gross.toFixed(2)}
              </span>
            </div>
          </div>


          {/* Deductions Management */}
          <div className="rounded-xl border border-border bg-secondary/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Deductions
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Add deduction components (LWF, PT, etc.) that reduce gross to arrive at net payable.
                </p>
              </div>
              <Popover open={deductionPickerOpen} onOpenChange={setDeductionPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add component
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-80 p-0"
                  align="end"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <Command key={deductionOptionsKey} shouldFilter={false}>
                    <CommandInput
                      placeholder="Which deduction would you like to add?"
                      value={deductionQuery}
                      onValueChange={setDeductionQuery}
                    />
                    <CommandList>
                      <CommandEmpty>No more components.</CommandEmpty>
                      <CommandGroup>
                        {filteredAvailableDeductions.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.name} ${c.state} ${c.id}`}
                            onSelect={() => addDeduction(c)}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm">{c.name}</span>
                              <span className="text-[11px] text-muted-foreground">
                                {c.calcType === "percentage"
                                  ? `${c.percentage}% of ${c.baseComponents.map((b, i) => (i === 0 ? b.label : `${b.operator} ${b.label}`)).join(" ") || "—"}`
                                  : c.amount != null && c.amount > 0
                                    ? `Fixed ₹${c.amount.toLocaleString("en-IN")}`
                                    : "Fixed amount (manual)"}
                                {c.state && c.state !== "N/A" ? ` · ${c.state}` : ""}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {deductions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card/50 px-4 py-6 text-center">
                <div className="text-sm font-medium text-foreground">No deductions added</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Click <span className="font-semibold text-foreground">Add component</span> to attach LWF, PT…
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {deductions.map((b) => (
                  <div
                    key={b.costComponentId}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{b.name}</span>
                        {b.state && b.state !== "N/A" && (
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {b.state}
                          </span>
                        )}
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            hasConfiguredFormula(b)
                              ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                              : b.calcType === "percentage"
                              ? "bg-accent/15 text-accent"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                          )}
                          title={hasConfiguredFormula(b) ? String(b.formulaExpression ?? "") : undefined}
                        >
                          {hasConfiguredFormula(b)
                            ? "Formula"
                            : b.calcType === "percentage"
                            ? `${b.percentage}%`
                            : "Fixed"}
                        </span>
                        {hasConfiguredFormula(b) && b.formulaVersion != null && (
                          <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-mono text-violet-700 dark:text-violet-300" title="Formula master version">
                            v{b.formulaVersion}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground" title={hasConfiguredFormula(b) ? String(b.formulaExpression ?? "") : undefined}>
                        {hasConfiguredFormula(b)
                          ? `Custom formula · ${b.formulaExpression?.slice(0, 60) ?? ""}${(b.formulaExpression?.length ?? 0) > 60 ? "…" : ""}`
                          : b.calcType === "percentage"
                          ? isStatutoryEsi(b)
                            ? `${b.percentage}% · ${ESI_CONTRACT_NOTE}`
                            : `${b.percentage}% of ${b.baseComponents.map((x, i) => (i === 0 ? x.label : `${x.operator} ${x.label}`)).join(" ") || "—"}${b.capAmount ? ` · cap ₹${b.capAmount.toLocaleString("en-IN")}` : ""}`
                          : "Manual entry"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {b.calcType === "fixed" && !hasConfiguredFormula(b) ? (
                         <DecimalAmountInput
                           value={b.amount}
                           className="h-9 w-28"
                           onValueChange={(amount) => updateDeductionAmount(b.costComponentId, amount)}
                         />
                      ) : (
                        <span className="w-28 text-right text-sm font-semibold text-foreground">
                          {isStatutoryEsi(b) ? esiEmployeeAmount.toFixed(2) : Number(b.amount).toFixed(2)}
                        </span>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeDeduction(b.costComponentId)}
                        aria-label="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-end border-t border-border pt-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Total Deductions
                  </span>
                  <span className="ml-3 text-base font-bold text-foreground">
                    {totalDeductions.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Employer Contribution */}
          <div className="rounded-xl border border-border bg-secondary/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Employer Contribution
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Add employer-side cost components (PF, ESIC, LWF, Gratuity, Bonus, Uniform, Management Fee, etc.) to compute Total CTC.
                </p>
              </div>
              <Popover open={employerPickerOpen} onOpenChange={setEmployerPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add component
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-80 p-0"
                  align="end"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <Command key={employerOptionsKey} shouldFilter={false}>
                    <CommandInput
                      placeholder="Which contribution would you like to add?"
                      value={employerQuery}
                      onValueChange={setEmployerQuery}
                    />
                    <CommandList>
                      <CommandEmpty>No more components.</CommandEmpty>
                      <CommandGroup>
                        {filteredAvailableEmployer.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.name} ${c.state} ${c.id}`}
                            onSelect={() => addEmployerContribution(c)}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm">{c.name}</span>
                              <span className="text-[11px] text-muted-foreground">
                                {c.calcType === "percentage"
                                  ? `${c.percentage}% of ${c.baseComponents.map((b, i) => (i === 0 ? b.label : `${b.operator} ${b.label}`)).join(" ") || "—"}`
                                  : c.amount != null && c.amount > 0
                                    ? `Fixed ₹${c.amount.toLocaleString("en-IN")}`
                                    : "Fixed amount (manual)"}
                                {c.state && c.state !== "N/A" ? ` · ${c.state}` : ""}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {employerContributions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card/50 px-4 py-6 text-center">
                <div className="text-sm font-medium text-foreground">No employer contributions added</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Click <span className="font-semibold text-foreground">Add component</span> to attach PF, ESIC, Gratuity, Management Fee…
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {employerContributions.map((b) => (
                  <div
                    key={b.costComponentId}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{b.name}</span>
                        {b.state && b.state !== "N/A" && (
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {b.state}
                          </span>
                        )}
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            hasConfiguredFormula(b)
                              ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                              : b.calcType === "percentage"
                              ? "bg-accent/15 text-accent"
                              : /management\s*fee/i.test(b.name)
                                ? "bg-primary/15 text-primary"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                          )}
                          title={hasConfiguredFormula(b) ? String(b.formulaExpression ?? "") : undefined}
                        >
                          {hasConfiguredFormula(b)
                            ? "Formula"
                            : b.calcType === "percentage"
                            ? `${b.percentage}%`
                            : /management\s*fee/i.test(b.name)
                              ? "Prorated"
                              : "Fixed"}
                        </span>
                        {hasConfiguredFormula(b) && b.formulaVersion != null && (
                          <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-mono text-violet-700 dark:text-violet-300" title="Formula master version">
                            v{b.formulaVersion}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground" title={hasConfiguredFormula(b) ? String(b.formulaExpression ?? "") : undefined}>
                        {hasConfiguredFormula(b)
                          ? `Custom formula · ${b.formulaExpression?.slice(0, 60) ?? ""}${(b.formulaExpression?.length ?? 0) > 60 ? "…" : ""}`
                          : b.calcType === "percentage"
                          ? isStatutoryEsi(b)
                            ? `${b.percentage}% · ${ESI_CONTRACT_NOTE}`
                            : `${b.percentage}% of ${b.baseComponents.map((x, i) => (i === 0 ? x.label : `${x.operator} ${x.label}`)).join(" ") || "—"}${b.capAmount ? ` · cap ₹${b.capAmount.toLocaleString("en-IN")}` : ""}`
                          : /management\s*fee/i.test(b.name)
                            ? "Prorated by T Days (per-day × actual payable days)"
                            : "Fixed amount"}
                      </div>

                    </div>
                    <div className="flex items-center gap-2">
                      {b.calcType === "fixed" && !hasConfiguredFormula(b) ? (
                         <DecimalAmountInput
                           value={b.amount}
                           className="h-9 w-28"
                           onValueChange={(amount) => updateEmployerAmount(b.costComponentId, amount)}
                         />
                      ) : (
                        <span className="w-28 text-right text-sm font-semibold text-foreground">
                          {isStatutoryEsi(b) ? esiEmployerAmount.toFixed(2) : Number(b.amount).toFixed(2)}
                        </span>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeEmployerContribution(b.costComponentId)}
                        aria-label="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-end border-t border-border pt-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Total Employer Contribution
                  </span>
                  <span className="ml-3 text-base font-bold text-foreground">
                    {totalEmployer.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Salary Breakdown Preview */}
          <SalaryBreakdownTable
            designationName={selectedDesignation?.name ?? ""}
            payrollDayBase={payrollDayBases.find((p) => p.id === payrollDayBaseId)}
            components={components}
            benefits={benefits}
            deductions={deductions}
            employerContributions={employerContributions}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            data-force-enabled={resourceHasChanges ? "true" : undefined}
            onClick={handleSubmit}
          >
            {initial?.id ? "Save Resource" : "Add Resource"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Salary Breakdown Table                                             */
/* ------------------------------------------------------------------ */

function SalaryBreakdownTable({
  designationName,
  payrollDayBase,
  components,
  benefits,
  deductions,
  employerContributions,
}: {
  designationName: string;
  payrollDayBase: PayrollDayBase | undefined;
  components: ResourceComponent[];
  benefits: BenefitItem[];
  deductions: BenefitItem[];
  employerContributions: BenefitItem[];
}) {
  const payableDays = computePayableDays(payrollDayBase);
  const divisorDays = payableDays;
  const componentsTotal = components.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const benefitsTotal = benefits.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const gross = componentsTotal + benefitsTotal;

  // Statutory ESI: percentages and the wage ceiling come from the ESI
  // cost components configured in Control Center → Cost Component Manager
  // (employee & employer entries). Falls back to statutory defaults
  // (0.75% / 3.25% / ₹21,000) only if not configured. The ceiling applies
  // to ESI wages (gross excluding washing & conveyance), NOT raw gross.
  const washingTotal = components
    .filter((c) => /\bwashing\b/i.test(c.name))
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const conveyanceTotal = components
    .filter((c) => /\bconveyance\b|\bconv\.?\b/i.test(c.name))
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const esiBase = Math.max(0, gross - washingTotal - conveyanceTotal);
  const esiEmpItem = deductions.find(isEsiItem);
  const esiErItem = employerContributions.find(isEsiItem);
  const esiEmpPct =
    esiEmpItem && Number(esiEmpItem.percentage) > 0 ? Number(esiEmpItem.percentage) : 0.75;
  const esiErPct =
    esiErItem && Number(esiErItem.percentage) > 0 ? Number(esiErItem.percentage) : 3.25;
  const esiCap =
    (esiEmpItem && Number(esiEmpItem.capAmount) > 0 && Number(esiEmpItem.capAmount)) ||
    (esiErItem && Number(esiErItem.capAmount) > 0 && Number(esiErItem.capAmount)) ||
    21000;
  const esiEligible = esiBase > 0 && esiBase <= esiCap;
  const esiEmployeeAmount = esiEligible ? Math.ceil(esiBase * (esiEmpPct / 100)) : 0;
  const esiEmployerAmount = esiEligible ? Math.ceil(esiBase * (esiErPct / 100)) : 0;

  const isReliever = (b: BenefitItem) => /reliever/i.test(b.name);
  const isMgmtFee = (b: BenefitItem) => /management\s*fee/i.test(b.name);
  const coreEmployer = employerContributions.filter((b) => !isReliever(b) && !isMgmtFee(b));
  const relieverItems = employerContributions.filter(isReliever);
  const mgmtFeeItems = employerContributions.filter(isMgmtFee);

  const hasEsiDeduction = deductions.some(isEsiItem);
  const hasEsiEmployer = coreEmployer.some(isEsiItem);
  const deductionsTotal =
    deductions.reduce((s, b) => s + contractTotalAmount(b), 0) +
    (hasEsiDeduction ? esiEmployeeAmount : 0);
  const coreEmployerTotal =
    coreEmployer.reduce((s, b) => s + contractTotalAmount(b), 0) +
    (hasEsiEmployer ? esiEmployerAmount : 0);
  const relieverTotal = relieverItems.reduce((s, b) => s + contractTotalAmount(b), 0);
  const mgmtFeeTotal = mgmtFeeItems.reduce((s, b) => s + contractTotalAmount(b), 0);
  const totalCTC = gross + coreEmployerTotal;
  const totalRate = totalCTC + relieverTotal;
  const grandTotal = totalRate + mgmtFeeTotal;

  const basisLabel = payrollDayBase
    ? payrollDayBase.method === "fixed_days"
      ? `${payrollDayBase.fixedDays ?? 0} Days`
      : payrollDayBase.method === "actual_minus_weekly_off"
        ? `${payableDays} Days (actual − weekly off)`
        : payrollDayBase.method === "custom_weekdays"
          ? `${payableDays} Days (custom weekdays)`
          : `${payableDays} Days (actual)`
    : "—";

  const earnedFor = (amount: number) =>
    divisorDays > 0 ? (amount / divisorDays) * payableDays : 0;

  const earnedGross = earnedFor(gross);
  const earnedDeductions = earnedFor(deductionsTotal);
  const netPayable = gross - deductionsTotal;
  const earnedNetPayable = earnedFor(netPayable);
  const earnedCTC = earnedFor(totalCTC);
  const earnedRate = earnedFor(totalRate);
  const earnedGrand = earnedFor(grandTotal);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border bg-secondary/40 px-4 py-2.5">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Salary Breakdown Preview
        </h4>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Auto-computed from wage components, benefits, deductions and the selected payroll-days rule.
        </p>
      </div>
      <div className="overflow-x-clip">
        <table className="ios-table w-full text-sm">
          <tbody className="[&_tr]:border-b [&_tr]:border-border/60 [&_td]:px-3 [&_td]:py-2">
            <tr className="bg-secondary/20">
              <td className="font-medium text-muted-foreground">Designation</td>
              <td className="text-center font-semibold">{designationName || "—"}</td>
              <td className="text-right text-muted-foreground">Total Payable Days</td>
              <td className="text-right">
                <span className="inline-block rounded bg-amber-200/70 px-2 py-0.5 font-bold text-amber-900 dark:bg-amber-300/30 dark:text-amber-100">
                  {payableDays || "—"}
                </span>
              </td>
            </tr>
            <tr className="bg-muted/40">
              <td className="font-bold uppercase text-foreground">Salary Particulars</td>
              <td className="text-center font-bold">{basisLabel}</td>
              <td />
              <td className="text-right font-bold tracking-wider">( EARNED ) Rs.</td>
            </tr>
            {(() => {
              const visibleComponents = components.filter((c) => Number(c.amount) > 0);
              const visibleBenefits = benefits.filter((b) => Number(b.amount) > 0);
              if (visibleComponents.length === 0 && visibleBenefits.length === 0) {
                return (
                  <tr>
                    <td colSpan={4} className="py-3 text-center text-xs text-muted-foreground">
                      No salary particulars configured.
                    </td>
                  </tr>
                );
              }
              return (
                <>
                  {visibleComponents.map((c) => (
                    <tr key={`c-${c.allowanceId}`}>
                      <td>{c.name}</td>
                      <td className="text-center tabular-nums">{Number(c.amount).toFixed(2)}</td>
                      <td />
                      <td className="text-right tabular-nums">{earnedFor(Number(c.amount)).toFixed(2)}</td>
                    </tr>
                  ))}
                  {visibleBenefits.map((b) => (
                    <tr key={`b-${b.costComponentId}`}>
                      <td>
                        {b.name}
                        {b.calcType === "percentage" && (
                          <span className="ml-2 text-[11px] text-muted-foreground">
                            @ {b.percentage}% of{" "}
                            {b.baseComponents
                              .map((x, i) => (i === 0 ? x.label : `${x.operator} ${x.label}`))
                              .join(" ") || "—"}
                            {b.capAmount ? ` (cap ₹${b.capAmount.toLocaleString("en-IN")})` : ""}
                          </span>
                        )}
                      </td>
                      <td className="text-center tabular-nums">{Number(b.amount).toFixed(2)}</td>
                      <td />
                      <td className="text-right tabular-nums">{earnedFor(Number(b.amount)).toFixed(2)}</td>
                    </tr>
                  ))}
                </>
              );
            })()}
            <tr className="bg-sky-100 font-bold dark:bg-sky-500/20">
              <td className="uppercase">TOTAL Gross Rs.</td>
              <td className="text-center tabular-nums">{gross.toFixed(2)}</td>
              <td />
              <td className="text-right text-base tabular-nums">{earnedGross.toFixed(2)}</td>
            </tr>
            <tr className="bg-muted/40">
              <td className="font-bold uppercase text-foreground">Deductions</td>
              <td />
              <td />
              <td className="text-right font-bold tracking-wider">( EARNED ) Rs.</td>
            </tr>
            {(() => {
              const visibleDeductions = deductions.filter((b) => Number(b.amount) > 0 || isStatutoryEsi(b));
              if (visibleDeductions.length === 0) {
                return (
                  <tr>
                    <td colSpan={4} className="py-3 text-center text-xs text-muted-foreground">
                      No deductions configured.
                    </td>
                  </tr>
                );
              }
              return visibleDeductions.map((b) => (
                <tr key={`d-${b.costComponentId}`}>
                  <td>
                    {b.name}
                    {hasConfiguredFormula(b) ? (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        @ formula · {b.formulaExpression?.slice(0, 80) ?? ""}{(b.formulaExpression?.length ?? 0) > 80 ? "…" : ""}
                      </span>
                    ) : b.calcType === "percentage" && (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {isStatutoryEsi(b)
                          ? `@ ${b.percentage}% · ${ESI_CONTRACT_NOTE}`
                          : `@ ${b.percentage}% of ${b.baseComponents
                              .map((x, i) => (i === 0 ? x.label : `${x.operator} ${x.label}`))
                              .join(" ") || "—"}${b.capAmount ? ` (cap ₹${b.capAmount.toLocaleString("en-IN")})` : ""}`}
                      </span>
                    )}

                  </td>
                  <td className="text-center tabular-nums">{isStatutoryEsi(b) ? esiEmployeeAmount.toFixed(2) : Number(b.amount).toFixed(2)}</td>
                  <td />
                  <td className="text-right tabular-nums">{isStatutoryEsi(b) ? earnedFor(esiEmployeeAmount).toFixed(2) : earnedFor(Number(b.amount)).toFixed(2)}</td>
                </tr>
              ));
            })()}
            <tr className="bg-rose-100 font-semibold dark:bg-rose-500/20">
              <td className="uppercase">Total Deductions Rs.</td>
              <td className="text-center tabular-nums">{deductionsTotal.toFixed(2)}</td>
              <td />
              <td className="text-right tabular-nums">{earnedDeductions.toFixed(2)}</td>
            </tr>
            <tr className="bg-cyan-100 font-bold dark:bg-cyan-500/20">
              <td className="uppercase">Total Amount (Payable) Rs.</td>
              <td className="text-center tabular-nums">{netPayable.toFixed(2)}</td>
              <td />
              <td className="text-right text-base tabular-nums">{earnedNetPayable.toFixed(2)}</td>
            </tr>
            <tr className="bg-muted/40">
              <td className="font-bold uppercase text-foreground">Employer Contribution</td>
              <td />
              <td />
              <td className="text-right font-bold tracking-wider">( EARNED ) Rs.</td>
            </tr>
            {(() => {
              const visibleEmployer = coreEmployer.filter((b) => Number(b.amount) > 0 || isStatutoryEsi(b));
              if (visibleEmployer.length === 0) {
                return (
                  <tr>
                    <td colSpan={4} className="py-3 text-center text-xs text-muted-foreground">
                      No employer contributions configured.
                    </td>
                  </tr>
                );
              }
              return visibleEmployer.map((b) => (
                <tr key={`e-${b.costComponentId}`}>
                  <td>
                    {b.name}
                    {hasConfiguredFormula(b) ? (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        @ formula · {b.formulaExpression?.slice(0, 80) ?? ""}{(b.formulaExpression?.length ?? 0) > 80 ? "…" : ""}
                      </span>
                    ) : b.calcType === "percentage" && (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {isStatutoryEsi(b)
                          ? `@ ${b.percentage}% · ${ESI_CONTRACT_NOTE}`
                          : `@ ${b.percentage}% of ${b.baseComponents
                              .map((x, i) => (i === 0 ? x.label : `${x.operator} ${x.label}`))
                              .join(" ") || "—"}${b.capAmount ? ` (cap ₹${b.capAmount.toLocaleString("en-IN")})` : ""}`}
                      </span>
                    )}

                  </td>
                  <td className="text-center tabular-nums">{isStatutoryEsi(b) ? esiEmployerAmount.toFixed(2) : Number(b.amount).toFixed(2)}</td>
                  <td />
                  <td className="text-right tabular-nums">{isStatutoryEsi(b) ? earnedFor(esiEmployerAmount).toFixed(2) : earnedFor(Number(b.amount)).toFixed(2)}</td>
                </tr>
              ));
            })()}
            <tr className="bg-emerald-100 font-bold dark:bg-emerald-500/20">
              <td className="uppercase">Total CTC Rs.</td>
              <td className="text-center tabular-nums">{totalCTC.toFixed(2)}</td>
              <td />
              <td className="text-right text-base tabular-nums">{earnedCTC.toFixed(2)}</td>
            </tr>
            {relieverItems.map((b) => (
              <tr key={`r-${b.costComponentId}`}>
                <td>
                  {b.name}
                  {b.calcType === "percentage" && (
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      @ {b.percentage}% of{" "}
                      {b.baseComponents
                        .map((x, i) => (i === 0 ? x.label : `${x.operator} ${x.label}`))
                        .join(" ") || "—"}
                      {b.capAmount ? ` (cap ₹${b.capAmount.toLocaleString("en-IN")})` : ""}
                    </span>
                  )}
                </td>
                <td className="text-center tabular-nums">{Number(b.amount).toFixed(2)}</td>
                <td />
                <td className="text-right tabular-nums">{earnedFor(Number(b.amount)).toFixed(2)}</td>
              </tr>
            ))}
            {relieverItems.length > 0 && (
              <tr className="bg-teal-100 font-bold dark:bg-teal-500/20">
                <td className="uppercase">Total Rate Rs.</td>
                <td className="text-center tabular-nums">{totalRate.toFixed(2)}</td>
                <td />
                <td className="text-right text-base tabular-nums">{earnedRate.toFixed(2)}</td>
              </tr>
            )}
            {mgmtFeeItems.map((b) => (
              <tr key={`m-${b.costComponentId}`} className="bg-amber-50 dark:bg-amber-500/10">
                <td className="font-semibold">
                  {b.name}
                  {b.calcType === "percentage" && (
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      @ {b.percentage}% of{" "}
                      {b.baseComponents
                        .map((x, i) => (i === 0 ? x.label : `${x.operator} ${x.label}`))
                        .join(" ") || "—"}
                      {b.capAmount ? ` (cap ₹${b.capAmount.toLocaleString("en-IN")})` : ""}
                    </span>
                  )}
                </td>
                <td className="text-center tabular-nums">{Number(b.amount).toFixed(2)}</td>
                <td />
                <td className="text-right tabular-nums">{earnedFor(Number(b.amount)).toFixed(2)}</td>
              </tr>
            ))}
            {mgmtFeeItems.length > 0 && (
              <tr className="bg-indigo-100 font-bold dark:bg-indigo-500/20">
                <td className="uppercase">Grand Total Rs.</td>
                <td className="text-center tabular-nums">{grandTotal.toFixed(2)}</td>
                <td />
                <td className="text-right text-base tabular-nums">{earnedGrand.toFixed(2)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
