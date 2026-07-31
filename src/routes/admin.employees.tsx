import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { NOMANS_UNIT_ID as NOMANS_UNIT_ID_CONST } from "@/lib/business-constants";
import {
  ComplianceSection,
  KnowledgeSection,
  PhysicalSection,
  IdentificationSection,
  CriminalSection,
  OtherSection,
  ListSection,
  NomineeSection,
  SectionHeaderContext,
} from "@/components/candidate-extra-sections";
import { GuardReportingManagersEditor } from "@/components/GuardReportingManagersEditor";
import { notifyOnboardingApprovers, notifyUser, createNotification } from "@/lib/notifications";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClientOnlyFn, useServerFn } from "@tanstack/react-start";
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Edit2,
  FileJson,
  FileSignature,
  FileSpreadsheet,
  FileText,
  IdCard,
  LayoutList,
  Loader2,
  Network,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadCsv, csvJoin, csvDate, csvYesNo, csvStatus } from "@/lib/csv-export";
import { SignDocumentDialog } from "@/components/SignDocumentDialog";
import type { DocType } from "@/lib/company-documents";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentPermissions } from "@/lib/rbac";
import { useCurrentUserRole } from "@/lib/use-current-user-role";
import { findCandidateByAadhaar } from "@/lib/workflows";
import { RehireRequestDialog, type ExistingCandidateMatch } from "@/components/RehireRequestDialog";

import { extractAadhaar, type AadhaarExtraction } from "@/lib/aadhaar.functions";
import { logActivity } from "@/lib/activity-log";
import { RehireApprovalsCard, useRehireByCandidate } from "@/components/RehirePipelineCard";
import { RehireEnableDialog } from "@/components/RehireEnableDialog";
import { RehireReviewDialog } from "@/components/RehireReviewDialog";
import { type RehireRequest } from "@/lib/workflows";
import { fetchWorkflowByKey, fetchWorkflowSteps, REHIRE_WORKFLOW_KEY } from "@/lib/workflows";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format as formatDateFns, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { confirmAction } from "@/components/ConfirmProvider";
import {
  QK_SCOPE_ASSIGNMENTS,
  SCOPE_TYPE_LABEL,
  useScopeAssignments,
  useCandidateUnits,
  type ScopeAssignment,
  type ScopeType,
} from "@/lib/deployment";

import { useBranches, useCustomers, useStates } from "@/lib/admin-data";
import { postMovements, type LocationType } from "@/lib/inv-helpers";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeDocumentsExportDialog } from "@/components/employee-documents-export-dialog";



type EmployeesSearch = { tab?: "employee" | "candidate"; rehire?: string };

export const Route = createFileRoute("/admin/employees")({
  validateSearch: (search: Record<string, unknown>): EmployeesSearch => ({
    tab: search.tab === "candidate" || search.tab === "employee" ? search.tab : undefined,
    rehire: typeof search.rehire === "string" ? search.rehire : undefined,
  }),
  component: EmployeesPage,
});

// ---------------- Reference lists ---------------- //
const RELIGIONS = [
  "Hindu",
  "Muslim",
  "Christian",
  "Sikh",
  "Buddhist",
  "Jain",
  "Parsi",
  "Jewish",
  "Other",
];
const CASTE_CATEGORIES = ["General", "OBC", "SC", "ST", "EWS"];
const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed", "Separated"];
const GENDERS = ["Male", "Female", "Other"];
const MOCK_OTP = "1111";

const getAadhaarOcrClient = createClientOnlyFn(() => import("@/lib/aadhaar-ocr.client"));

// ---------------- Types ---------------- //
type AddressBlock = {
  address1: string;
  address2: string;
  landmark: string;
  pincode: string;
  city: string;
  district: string;
  state: string;
  country: string;
};

type Candidate = {
  id: string;
  candidate_code: string;
  employee_code: string;
  rejection_reason: string;
  aadhaar_number: string;
  full_name: string;
  photo_url: string;
  aadhaar_image_url: string;
  signature_url: string;
  date_of_birth: string | null;
  gender: string;
  religion: string;
  caste_category: string;
  marital_status: string;
  birthplace: string;
  mobile: string;
  alt_mobile: string;
  email: string;
  // Permanent address (structured)
  permanent_address1: string;
  permanent_address2: string;
  permanent_landmark: string;
  permanent_pincode: string;
  permanent_city: string;
  permanent_district: string;
  permanent_state: string;
  permanent_country: string;
  permanent_police_station: string;
  // Present address (structured)
  present_address1: string;
  present_address2: string;
  present_landmark: string;
  present_pincode: string;
  present_city: string;
  present_district: string;
  present_state: string;
  present_country: string;
  present_police_station: string;
  same_as_permanent: boolean;
  // PAN
  pan_number: string;
  pan_image_url: string;
  // Bank Details
  bank_account_holder: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_name: string;
  bank_branch: string;
  bank_account_type: string;
  // Emergency Contact (legacy, derived from primary contact on save)
  emergency_contact_name: string;
  emergency_contact_relation: string;
  emergency_contact_mobile: string;
  // Contacts (list, one marked as emergency)
  contacts: CandidateContact[];
  // References
  references: CandidateReference[];
  // Ex-Service
  is_ex_service: boolean;
  ex_service_id: string | null;
  // Languages / Experiences / Education
  languages: string[];
  experiences: CandidateExperience[];
  educations: CandidateEducation[];
  application_date: string;
  preferred_joining_date: string | null;
  unit_id: string | null;
  designation_id: string | null;
  status: string;
  // Extended (JSONB) sections
  physical_health: Record<string, any>;
  compliance: Record<string, any>;
  identification_proofs: any[];
  criminal_history: { has_history: boolean; incidents: any[] };
  extra_curricular: any[];
  other_info: Record<string, any>;
  documents: any[];
  nominations: any[];
  kyc_completed: boolean;
  // Offboarding & HR
  assigned_asset_ids: string[];
  no_hire: boolean;
  offboarding_details: OffboardingDetails;
};

export type OffboardingAssetReturn = {
  asset_id: string;
  returned: boolean;
  remarks?: string;
};

export type OffboardingInventoryReturn = {
  item_id: string;
  item_name: string;
  size_value: string;
  unit: string;
  on_hand: number;
  qty_returned: number;
  destination_type: LocationType;
  destination_id: string;
  destination_label: string;
  remarks?: string;
};

export type OffboardingDetails = {
  date_of_offboarding?: string | null;
  date_of_resignation?: string | null;
  date_of_last_working?: string | null;
  date_of_pf_update?: string | null;
  date_of_esic_update?: string | null;
  reason_text?: string;
  review?: string;
  asset_returns?: OffboardingAssetReturn[];
  inventory_returns?: OffboardingInventoryReturn[];
  rating?: number;
  rating_remarks?: string;
  // Offboarding-collection handshake with the Field Officer
  pending_collection_fo_id?: string | null;
  pending_collection_fo_name?: string | null;
  collection_status?: "pending" | "completed" | null;
  collection_requested_at?: string | null;
  collection_completed_at?: string | null;
  collection_completed_by?: string | null;
};

export type OnboardingDetails = {
  // Onboarding-issuance handshake with the Field Officer.
  // Mirrors offboarding: on approval, if assets are assigned and a FO is
  // resolvable, the candidate stays at status='approved' until the FO
  // confirms issuance in Uniform Manager → Collections → Issuances.
  pending_issuance_fo_id?: string | null;
  pending_issuance_fo_name?: string | null;
  issuance_status?: "pending" | "completed" | null;
  issuance_requested_at?: string | null;
  issuance_completed_at?: string | null;
  issuance_completed_by?: string | null;
  issuance_asset_ids?: string[];
};


type CandidateExperience = {
  company_name: string;
  designation: string;
  location: string;
  joined_date: string;
  resigned_date: string;
  reason: string;
  remarks: string;
};

type CandidateEducation = {
  education_name: string;
  university: string;
  course: string;
  institution: string;
  year_of_passing: string;
  percentage: string;
};

type CandidateReference = {
  name: string;
  relation_type: string;
  mobile: string;
  address: string;
};

type CandidateContact = {
  name: string;
  relation: string;
  mobile: string;
  dob?: string;
  address?: string;
  guardian_name?: string;
  guardian_mobile?: string;
  guardian_address?: string;
  is_emergency: boolean;
};

const RELATION_TYPES = ["Family", "Friend", "Colleague", "Neighbor", "Other"] as const;
const REFERENCE_RELATIONS = ["Father", "Mother", "Spouse", "Brother", "Sister", "Son", "Daughter", "Friend", "Colleague", "Neighbor", "Relative", "Other"] as const;
const BANK_ACCOUNT_TYPES = ["Savings", "Current", "Salary"] as const;

type CandidateListItem = Pick<
  Candidate,
  | "id"
  | "candidate_code"
  | "rejection_reason"
  | "aadhaar_number"
  | "full_name"
  | "photo_url"
  | "mobile"
  | "email"
  | "unit_id"
  | "designation_id"
  | "status"
> & { employee_code: string; role_key: string; is_enabled: boolean; reports_to: string | null; offboarding_reason_id: string | null; offboarded_at: string | null; assigned_asset_ids: string[]; no_hire: boolean; offboarding_details: OffboardingDetails; onboarding_details: OnboardingDetails; date_of_birth: string | null; preferred_joining_date: string | null; approved_at: string | null; created_by: string | null; created_at: string | null; updated_at: string | null };

type ReactivationResult = {
  id: string;
  employee_code: string;
  full_name: string;
  status: string;
  reusedExisting?: boolean;
  mode?: "reuse" | "new";
  sourceId?: string;
};


type RoleLite = { key: string; name: string };

type UnitLite = {
  id: string;
  code: string;
  name: string;
  customer_id: string | null;
  branch_id: string | null;
  uniform_included?: boolean | null;
  uniform_fee_amount?: number | string | null;
  customer_name?: string;
};

type DesignationLite = { id: string; name: string; code: string; billable: boolean };
type ExServiceLite = { id: string; name: string; description: string };
type LanguageLite = { id: string; name: string };

const QK = ["admin", "candidates"] as const;
const QK_UNITS = ["admin", "units-lite"] as const;
const QK_DESIG = ["admin", "designations-lite"] as const;
const QK_EX_SERVICES = ["admin", "ex-services-lite"] as const;
const QK_LANGUAGES = ["admin", "languages-lite"] as const;
const QK_ESIC_BRANCHES = ["admin", "esic-branches-lite"] as const;
const QK_SIGNED_DOCS = ["admin", "signed-docs-summary"] as const;

function getMutationErrorMessage(error: unknown, fallback: string) {
  const parts: string[] = [];
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "details", "hint", "code"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) parts.push(value.trim());
    }
  }
  if (typeof error === "string" && error.trim()) parts.push(error.trim());
  const raw = parts.join(" · ");
  if (/candidates_mobile_unique|Key \(mobile\)=/i.test(raw)) {
    return "This mobile number is already used by an active candidate or employee. Open the existing profile or use a different number.";
  }
  if (/candidates_candidate_code_key|Key \(candidate_code\)=/i.test(raw)) {
    return "Candidate number generation collided with an existing record. Please retry once; the next number will be allocated automatically.";
  }
  if (/candidate_units|row-level security|infinite recursion/i.test(raw)) {
    return `Unit assignment failed: ${raw}`;
  }
  if (raw) return raw;
  return fallback;
}

function normalizeIdArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "{}") return [];
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed
        .slice(1, -1)
        .split(",")
        .map((item) => item.replace(/^"|"$/g, "").trim())
        .filter(Boolean);
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch { /* fall through */ }
    return [trimmed];
  }
  return [];
}

function toTime(value: string | null | undefined) {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function employeeCodeNumber(code: string | null | undefined) {
  const match = (code ?? "").match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function employeeLifecycleTime(candidate: CandidateListItem) {
  return (
    toTime(candidate.approved_at) ||
    toTime(candidate.created_at) ||
    toTime(candidate.updated_at) ||
    toTime(candidate.offboarded_at)
  );
}

function employeeStatusRank(candidate: CandidateListItem) {
  if (candidate.status !== "inactive" && candidate.is_enabled) return 4;
  if (candidate.status === "active") return 3;
  if (candidate.status === "approved") return 2;
  return 1;
}

function newestEmployeeRecordFirst(a: CandidateListItem, b: CandidateListItem) {
  return (
    employeeCodeNumber(b.employee_code) - employeeCodeNumber(a.employee_code) ||
    employeeLifecycleTime(b) - employeeLifecycleTime(a) ||
    toTime(b.created_at) - toTime(a.created_at) ||
    b.id.localeCompare(a.id)
  );
}

function preferredEmployeeRecordFirst(a: CandidateListItem, b: CandidateListItem) {
  return employeeStatusRank(b) - employeeStatusRank(a) || newestEmployeeRecordFirst(a, b);
}

function useSignedDocsSummary() {
  return useQuery({
    queryKey: QK_SIGNED_DOCS,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async (): Promise<Array<{ candidate_id: string; doc_type: string }>> => {
      const { data, error } = await supabase
        .from("employee_signed_documents" as never)
        .select("candidate_id,doc_type,signed_at")
        .not("signed_at", "is", null)
        .limit(5000);
      if (error) throw error;
      return ((data as unknown) as Array<{ candidate_id: string; doc_type: string }>) ?? [];
    },
  });
}

type EsicBranchLite = { id: string; location: string; esic_code: string };

function useEsicBranchesLite() {
  return useQuery({
    queryKey: QK_ESIC_BRANCHES,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async (): Promise<EsicBranchLite[]> => {
      const { data, error } = await supabase
        .from("esic_branches" as never)
        .select("id,location,esic_code,enabled")
        .eq("enabled", true)
        .order("location", { ascending: true })
        .limit(500);
      if (error) throw error;
      return ((data as unknown) as EsicBranchLite[]) ?? [];
    },
  });
}

async function runWithQueryTimeout<T>(label: string, run: (signal: AbortSignal) => Promise<T>, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${label} request timed out. Please retry.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------- Hooks ---------------- //
function useCandidates() {
  return useQuery({
    queryKey: QK,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async (): Promise<CandidateListItem[]> => {
      const { data, error } = await runWithQueryTimeout("Employees", async (signal) =>
        await supabase
          .from("candidates" as never)
          .select("id,candidate_code,employee_code,rejection_reason,aadhaar_number,full_name,photo_url,mobile,email,unit_id,designation_id,status,role_key,is_enabled,reports_to,offboarding_reason_id,offboarded_at,assigned_asset_ids,no_hire,offboarding_details,onboarding_details,date_of_birth,preferred_joining_date,approved_at,created_by,created_at,updated_at")
          .order("created_at", { ascending: false })
          .limit(250)
          .abortSignal(signal),
      );
      if (error) throw error;
      return ((data as unknown) as CandidateListItem[]) ?? [];
    },
  });
}

function useUnits() {
  return useQuery({
    queryKey: QK_UNITS,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async (): Promise<UnitLite[]> => {
      const { data, error } = await runWithQueryTimeout("Units", async (signal) =>
        await supabase
          .from("units" as never)
          .select("id,code,name,customer_id,branch_id,uniform_included,uniform_fee_amount")
          .order("name", { ascending: true })
          .limit(2000)
          .abortSignal(signal),
      );
      if (error) throw error;
      const units = ((data as unknown) as UnitLite[]) ?? [];
      const custIds = Array.from(new Set(units.map((u) => u.customer_id).filter(Boolean))) as string[];
      let custMap = new Map<string, string>();
      if (custIds.length) {
        const { data: cs } = await runWithQueryTimeout("Customers", async (signal) =>
          await supabase
            .from("customers" as never)
            .select("id,name")
            .in("id", custIds)
            .abortSignal(signal),
        );
        custMap = new Map(((cs ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
      }
      return units.map((u) => ({ ...u, customer_name: u.customer_id ? custMap.get(u.customer_id) ?? "" : "" }));
    },
  });
}

function useDesignations() {
  return useQuery({
    queryKey: QK_DESIG,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async (): Promise<DesignationLite[]> => {
      const { data, error } = await runWithQueryTimeout("Designations", async (signal) =>
        await supabase
          .from("designations" as never)
          .select("id,name,code,enabled,billable")
          .eq("enabled", true)
          .order("name", { ascending: true })
          .limit(500)
          .abortSignal(signal),
      );
      if (error) throw error;
      return ((data as unknown) as DesignationLite[]) ?? [];
    },
  });
}

function useExServices() {
  return useQuery({
    queryKey: QK_EX_SERVICES,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async (): Promise<ExServiceLite[]> => {
      const { data, error } = await runWithQueryTimeout("Ex-Services", async (signal) =>
        await supabase
          .from("ex_services" as never)
          .select("id,name,description,enabled")
          .eq("enabled", true)
          .order("name", { ascending: true })
          .limit(500)
          .abortSignal(signal),
      );
      if (error) throw error;
      return ((data as unknown) as ExServiceLite[]) ?? [];
    },
  });
}

function useLanguagesLite() {
  return useQuery({
    queryKey: QK_LANGUAGES,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async (): Promise<LanguageLite[]> => {
      const { data, error } = await runWithQueryTimeout("Languages", async (signal) =>
        await supabase
          .from("languages" as never)
          .select("id,name,enabled")
          .eq("enabled", true)
          .order("name", { ascending: true })
          .limit(500)
          .abortSignal(signal),
      );
      if (error) throw error;
      return ((data as unknown) as LanguageLite[]) ?? [];
    },
  });
}

const QK_ROLES = ["admin", "roles-lite"] as const;
function useRolesLite() {
  return useQuery({
    queryKey: QK_ROLES,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async (): Promise<RoleLite[]> => {
      const { data, error } = await supabase
        .from("roles" as never)
        .select("key,name,sort_order")
        .order("sort_order", { ascending: true })
        .limit(200);
      if (error) throw error;
      return ((data as unknown) as RoleLite[]) ?? [];
    },
  });
}

function EmployeesPage() {
  const routeSearch = useSearch({ from: "/admin/employees" });
  const candidatesQuery = useCandidates();
  const unitsQuery = useUnits();
  const designationsQuery = useDesignations();
  const exServicesQuery = useExServices();
  const languagesQuery = useLanguagesLite();
  const rolesQuery = useRolesLite();
  const esicBranchesQuery = useEsicBranchesLite();
  const signedDocsQuery = useSignedDocsSummary();
  const candidates = candidatesQuery.data ?? [];
  const units = unitsQuery.data ?? [];
  const designations = designationsQuery.data ?? [];
  const exServices = exServicesQuery.data ?? [];
  const languagesList = languagesQuery.data ?? [];
  const rolesList = rolesQuery.data ?? [];
  const esicBranches = esicBranchesQuery.data ?? [];
  const isLoading = candidatesQuery.isLoading;
  const candidatesError = candidatesQuery.error;
  const qc = useQueryClient();

  const { roleKey, isSuperAdmin, can, canSub } = useCurrentPermissions();
  const isFieldOfficer = roleKey === "field_officer" && !isSuperAdmin;
  const canAddEmployee = isSuperAdmin || ["admin", "super_admin", "hr", "leadership"].includes(roleKey ?? "");
  // Onboarding approval is scoped to the Employees → Approvals sub-module only.
  // Using the module-level `can("employees","approve")` leaked the button to any
  // role holding approve on ANY sub-module (e.g. Field Officers with Rehire approve).
  const canApproveOnboarding = isSuperAdmin || canSub("employees", "approvals", "approve");
  const { map: rehireByCandidate } = useRehireByCandidate();
  const [enableRehireTarget, setEnableRehireTarget] = useState<RehireRequest | null>(null);
  const [rehireReviewTarget, setRehireReviewTarget] = useState<RehireRequest | null>(null);
  const rehireStepsQ = useQuery({
    queryKey: ["workflows", "rehire", "steps"],
    queryFn: async () => {
      const wf = await fetchWorkflowByKey(REHIRE_WORKFLOW_KEY);
      return wf ? (await fetchWorkflowSteps(wf.id)).filter((step) => step.is_active) : [];
    },
  });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"employee" | "candidate">("employee");
  useEffect(() => { if (isFieldOfficer) setTab("candidate"); }, [isFieldOfficer]);
  useEffect(() => {
    if (routeSearch.tab) setTab(routeSearch.tab);
  }, [routeSearch.tab]);
  useEffect(() => {
    if (!routeSearch.rehire) return;
    const match = Array.from(rehireByCandidate.values()).find((info) => info.request.id === routeSearch.rehire);
    if (match) {
      setTab("candidate");
      setRehireReviewTarget(match.request);
    }
  }, [routeSearch.rehire, rehireByCandidate]);

  const [empStatusTab, setEmpStatusTab] = useState<"active" | "inactive">("active");
  const [viewMode, setViewMode] = useState<"list" | "tree">("list");
  const [openWizard, setOpenWizard] = useState(false);
  const [wizardMode, setWizardMode] = useState<"candidate" | "employee">("candidate");
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [openingCandidateId, setOpeningCandidateId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CandidateListItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<CandidateListItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approvePreview, setApprovePreview] = useState<CandidateListItem | null>(null);
  const [signTarget, setSignTarget] = useState<{ id: string; docType: DocType } | null>(null);
  const [offboardTarget, setOffboardTarget] = useState<CandidateListItem | null>(null);
  const [offboardReasonId, setOffboardReasonId] = useState<string>("");
  const [reactivateTarget, setReactivateTarget] = useState<CandidateListItem | null>(null);


  const offboardReasonsQuery = useQuery({
    queryKey: ["offboarding_reasons_lite"],
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offboarding_reasons" as never)
        .select("id,name,enabled,sort_order")
        .eq("enabled", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
        .limit(100);
      if (error) throw error;
      return ((data as unknown) as Array<{ id: string; name: string }>) ?? [];
    },
  });
  const offboardReasons = offboardReasonsQuery.data ?? [];

  const assetsQuery = useQuery({
    queryKey: ["assets_lite_available"],
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async () => {
      const [assetsRes, balRes, invItemsRes, invCatsRes] = await Promise.all([
        supabase
          .from("assets" as never)
          .select("id,name,category,enabled,unit_price")
          .eq("enabled", true)
          .order("name", { ascending: true })
          .limit(500),
        supabase
          .from("inv_stock_balances" as never)
          .select("qty,item_id,inv_items:item_id(name,enabled)"),
        supabase
          .from("inv_items" as never)
          .select("id,name,category_id,enabled,standard_issue_price,standard_cost")
          .eq("enabled", true)
          .order("name", { ascending: true })
          .limit(1000),
        supabase
          .from("inv_item_categories" as never)
          .select("id,name"),
      ]);
      if (assetsRes.error) throw assetsRes.error;
      if (balRes.error) throw balRes.error;
      if (invItemsRes.error) throw invItemsRes.error;
      if (invCatsRes.error) throw invCatsRes.error;

      const rows = ((assetsRes.data as unknown) as Array<{ id: string; name: string; category: string; unit_price: number | string | null }>) ?? [];
      const availByName = new Map<string, number>();
      const availByItemId = new Map<string, number>();
      type BalRow = { qty: number | string; item_id: string; inv_items: { name: string; enabled: boolean } | null };
      for (const b of ((balRes.data as unknown) as BalRow[]) ?? []) {
        const q = Number(b.qty ?? 0);
        if (b.item_id) availByItemId.set(b.item_id, (availByItemId.get(b.item_id) ?? 0) + q);
        const it = b.inv_items;
        if (!it || it.enabled === false) continue;
        const key = (it.name ?? "").trim().toLowerCase();
        if (!key) continue;
        availByName.set(key, (availByName.get(key) ?? 0) + q);
      }

      const catNameById = new Map(
        (((invCatsRes.data as unknown) as Array<{ id: string; name: string }>) ?? []).map((c) => [c.id, c.name]),
      );
      const assetNameSet = new Set(rows.map((r) => (r.name ?? "").trim().toLowerCase()));
      const invRows = (((invItemsRes.data as unknown) as Array<{ id: string; name: string; category_id: string | null; standard_issue_price: number | string | null; standard_cost: number | string | null }>) ?? [])
        .filter((it) => !assetNameSet.has((it.name ?? "").trim().toLowerCase()))
        .map((it) => ({
          id: it.id,
          name: it.name,
          category: (it.category_id && catNameById.get(it.category_id)) || "Inventory",
          available_qty: availByItemId.get(it.id) ?? 0,
          unit_price: Number(it.standard_issue_price ?? it.standard_cost ?? 0) || 0,
        }));

      const merged = rows.map((a) => ({
        ...a,
        available_qty: availByName.get((a.name ?? "").trim().toLowerCase()) ?? 0,
        unit_price: Number(a.unit_price ?? 0) || 0,
      }));
      return [...merged, ...invRows];
    },

  });
  const assets = assetsQuery.data ?? [];



  // Filters
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterDesignation, setFilterDesignation] = useState<string>("all");
  const [filterCustomer, setFilterCustomer] = useState<string>("all");
  const [filterUnit, setFilterUnit] = useState<string>("all");
  const [filterManager, setFilterManager] = useState<string>("all");
  const [filterEnabled, setFilterEnabled] = useState<"all" | "enabled" | "disabled">("all");
  const [filterBillable, setFilterBillable] = useState<"all" | "billable" | "nonbillable">("all");
  const [filterOffboardReason, setFilterOffboardReason] = useState<string>("all");

  const DEFAULT_FILTERS_VIS = {
    role: true,
    designation: true,
    customer: true,
    unit: true,
    manager: true,
    enabled: true,
    billable: true,
    offboardReason: true,
  };
  const [filtersVisible, setFiltersVisible] = useState<typeof DEFAULT_FILTERS_VIS>(() => {
    if (typeof window === "undefined") return DEFAULT_FILTERS_VIS;
    try {
      const raw = localStorage.getItem("employees.filterPrefs");
      if (raw) return { ...DEFAULT_FILTERS_VIS, ...JSON.parse(raw) };
    } catch {}
    return DEFAULT_FILTERS_VIS;
  });
  useEffect(() => {
    try {
      localStorage.setItem("employees.filterPrefs", JSON.stringify(filtersVisible));
    } catch {}
  }, [filtersVisible]);

  // Configurable columns for the Employees table
  const DEFAULT_COLUMNS_VIS = {
    mobile: true,
    email: false,
    unit: true,
    designation: true,
    role: true,
    dob: false,
    doj: false,
    active: true,
  };
  const [columnsVisible, setColumnsVisible] = useState<typeof DEFAULT_COLUMNS_VIS>(() => {
    if (typeof window === "undefined") return DEFAULT_COLUMNS_VIS;
    try {
      const raw = localStorage.getItem("employees.columnPrefs");
      if (raw) return { ...DEFAULT_COLUMNS_VIS, ...JSON.parse(raw) };
    } catch {}
    return DEFAULT_COLUMNS_VIS;
  });
  useEffect(() => {
    try {
      localStorage.setItem("employees.columnPrefs", JSON.stringify(columnsVisible));
    } catch {}
  }, [columnsVisible]);

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; }
  };

  // Customers (org filter) + scope assignments
  const { customers } = useCustomers();
  const { branches } = useBranches();
  const { states } = useStates();
  const scopeQuery = useScopeAssignments();
  const scopeAssignments = scopeQuery.data ?? [];

  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const desigMap = useMemo(() => new Map(designations.map((d) => [d.id, d])), [designations]);

  const { candidateId: currentCandidateId, isLoading: roleLoading } = useCurrentUserRole();
  const candidateUnitsQuery = useCandidateUnits();
  const NOMANS_UNIT_ID = NOMANS_UNIT_ID_CONST;
  const scopedUnitsForWizard = useMemo(() => {
    if (!isFieldOfficer) return units;
    if (!currentCandidateId) return [] as typeof units;
    const mine = scopeAssignments.filter((s) => s.candidate_id === currentCandidateId);
    const unitIds = new Set(
      mine.filter((s) => s.scope_type === "unit").map((s) => s.scope_id),
    );
    // NOTE: `scope_type='branch'` on a field officer is their **Home Branch**
    // (payroll/employment marker — always Radiant's own branch). It is NOT an
    // operational scope and must never be expanded into every unit of that
    // branch, otherwise the FO sees the whole organisation's units.
    const customerIds = new Set(
      mine.filter((s) => s.scope_type === "customer").map((s) => s.scope_id),
    );
    // Legacy: candidate_units mappings also count as direct unit scope.
    for (const cu of candidateUnitsQuery.data ?? []) {
      if (cu.candidate_id === currentCandidateId && cu.unit_id) unitIds.add(cu.unit_id);
    }
    // Always include "No Man's Land" as a fallback unit for FO onboarding.
    unitIds.add(NOMANS_UNIT_ID);
    return units.filter(
      (u) =>
        unitIds.has(u.id) ||
        ((u as { customer_id?: string | null }).customer_id != null &&
          customerIds.has((u as { customer_id?: string | null }).customer_id as string)),
    );
  }, [isFieldOfficer, currentCandidateId, scopeAssignments, units, candidateUnitsQuery.data]);
  const scopedUnitIdSet = useMemo(
    () => new Set(scopedUnitsForWizard.map((u) => u.id)),
    [scopedUnitsForWizard],
  );

  const scopeStillLoading = isFieldOfficer && (roleLoading || scopeQuery.isLoading || !currentCandidateId);

  const matchesSearch = (c: CandidateListItem) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [c.full_name, c.aadhaar_number, c.mobile, c.email, c.candidate_code, c.employee_code].some(
      (v) => (v ?? "").toLowerCase().includes(q),
    );
  };

  const matchesFilters = (c: CandidateListItem) => {
    if (filterRole !== "all" && c.role_key !== filterRole) return false;
    if (filterDesignation !== "all" && c.designation_id !== filterDesignation) return false;
    if (filterUnit !== "all" && c.unit_id !== filterUnit) return false;
    if (filterCustomer !== "all") {
      const unit = c.unit_id ? unitMap.get(c.unit_id) : undefined;
      if (!unit || unit.customer_id !== filterCustomer) return false;
    }
    if (filterManager !== "all" && c.reports_to !== filterManager) return false;
    if (filterEnabled === "enabled" && !c.is_enabled) return false;
    if (filterEnabled === "disabled" && c.is_enabled) return false;
    if (filterBillable !== "all") {
      const d = c.designation_id ? desigMap.get(c.designation_id) : undefined;
      const isBillable = !!d?.billable;
      if (filterBillable === "billable" && !isBillable) return false;
      if (filterBillable === "nonbillable" && isBillable) return false;
    }
    if (filterOffboardReason !== "all") {
      if (filterOffboardReason === "none") {
        if (c.offboarding_reason_id) return false;
      } else if (c.offboarding_reason_id !== filterOffboardReason) {
        return false;
      }
    }
    return true;
  };

  const isEmployeeStatus = (s: string) => s === "approved" || s === "active" || s === "inactive";

  const supersededEmployeeIds = useMemo(() => {
    const recordsByMobile = new Map<string, CandidateListItem[]>();
    for (const c of candidates) {
      const mobile = c.mobile?.trim();
      if (!mobile) continue;
      if (!recordsByMobile.has(mobile)) recordsByMobile.set(mobile, []);
      recordsByMobile.get(mobile)!.push(c);
    }

    const ids = new Set<string>();
    for (const list of recordsByMobile.values()) {
      const employeeRecords = list.filter((c) => isEmployeeStatus(c.status));
      if (employeeRecords.length <= 1) continue;

      const nonInactiveRecords = list.filter((c) => c.status !== "inactive");
      const visibleEmployee = nonInactiveRecords
        .filter((c) => isEmployeeStatus(c.status))
        .sort(preferredEmployeeRecordFirst)[0];

      if (nonInactiveRecords.length > 0 && !visibleEmployee) {
        // A pending reactivation/onboarding exists for this mobile; hide older inactive employee cards.
        for (const c of employeeRecords) ids.add(c.id);
        continue;
      }

      const keep = visibleEmployee ?? [...employeeRecords].sort(preferredEmployeeRecordFirst)[0];
      for (const c of employeeRecords) {
        if (c.id !== keep.id) ids.add(c.id);
      }
    }
    return ids;
  }, [candidates]);

  const employees = useMemo(
    () => candidates.filter((c) => {
      if (!isEmployeeStatus(c.status)) return false;
      if (rehireByCandidate.has(c.id)) return false;
      if (supersededEmployeeIds.has(c.id)) return false;
      if (!matchesSearch(c)) return false;
      if (!matchesFilters(c)) return false;
      if (isFieldOfficer) {
        // FO sees active employees only within his assigned units.
        if (!c.unit_id || !scopedUnitIdSet.has(c.unit_id)) return false;
      }
      const isActive = c.is_enabled && c.status !== "inactive";
      if (empStatusTab === "active" && !isActive) return false;
      if (empStatusTab === "inactive" && isActive) return false;
      return true;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, supersededEmployeeIds, rehireByCandidate, search, filterRole, filterDesignation, filterCustomer, filterUnit, filterManager, filterEnabled, filterBillable, filterOffboardReason, units, designations, isFieldOfficer, scopedUnitIdSet, empStatusTab],
  );
  const candidateRows = useMemo(
    () => candidates.filter((c) => {
      const hasRehire = rehireByCandidate.has(c.id);
      if (isEmployeeStatus(c.status) && !hasRehire) return false;
      if (!matchesSearch(c)) return false;
      if (isFieldOfficer) {
        // FO sees pending/rejected/draft submissions within his units,
        // plus his own submissions regardless of unit (in case unit not yet set).
        const inMyUnits = !!c.unit_id && scopedUnitIdSet.has(c.unit_id);
        const isMine = !!currentUserId && c.created_by === currentUserId;
        if (!inMyUnits && !isMine) return false;
        if (c.status === "approved" && !hasRehire) return false;
      }
      return true;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, rehireByCandidate, search, isFieldOfficer, currentUserId, scopedUnitIdSet],
  );

  // ---------------- Export ---------------- //
  const [exporting, setExporting] = useState(false);
  const [docsExportOpen, setDocsExportOpen] = useState(false);

  const roleNameOf = (key: string | null | undefined) =>
    rolesList.find((r) => r.key === key)?.name ?? key ?? "";
  const unitLabel = (id: string | null | undefined) => {
    if (!id) return "";
    const u = unitMap.get(id);
    return u ? `${u.code} — ${u.name}` : "";
  };
  const customerNameOfUnit = (id: string | null | undefined) => {
    if (!id) return "";
    const u = unitMap.get(id);
    if (!u?.customer_id) return u?.customer_name ?? "";
    return customers.find((c) => c.id === u.customer_id)?.name ?? u.customer_name ?? "";
  };
  const desigName = (id: string | null | undefined) =>
    (id && desigMap.get(id)?.name) || "";
  const managerName = (id: string | null | undefined) =>
    (id && candidates.find((c) => c.id === id)?.full_name) || "";
  const offboardReasonName = (id: string | null | undefined) =>
    (id && offboardReasons.find((r) => r.id === id)?.name) || "";

  const buildSummaryRow = (c: CandidateListItem) => ({
    employee_code: c.employee_code || "",
    candidate_code: c.candidate_code || "",
    full_name: c.full_name || "",
    aadhaar_number: c.aadhaar_number || "",
    mobile: c.mobile || "",
    email: c.email || "",
    role: roleNameOf(c.role_key),
    designation: desigName(c.designation_id),
    unit: unitLabel(c.unit_id),
    customer: customerNameOfUnit(c.unit_id),
    reports_to: managerName(c.reports_to),
    status: csvStatus(c.status),
    enabled: csvYesNo(c.is_enabled),
    no_hire: csvYesNo(c.no_hire),
    offboarding_reason: offboardReasonName(c.offboarding_reason_id),
    offboarded_at: csvDate(c.offboarded_at),
    assigned_assets: csvJoin(
      (c.assigned_asset_ids ?? []).map((aid) => assets.find((a) => a.id === aid)?.name).filter(Boolean),
    ),
    rejection_reason: c.rejection_reason || "",
  });

  const SUMMARY_COLS = [
    { key: "employee_code", header: "Employee code" },
    { key: "candidate_code", header: "Candidate code" },
    { key: "full_name", header: "Full name" },
    { key: "aadhaar_number", header: "Aadhaar" },
    { key: "mobile", header: "Mobile" },
    { key: "email", header: "Email" },
    { key: "role", header: "Role" },
    { key: "designation", header: "Designation" },
    { key: "unit", header: "Unit" },
    { key: "customer", header: "Customer" },
    { key: "reports_to", header: "Reports to" },
    { key: "status", header: "Status" },
    { key: "enabled", header: "Enabled" },
    { key: "no_hire", header: "Do not re-hire" },
    { key: "offboarding_reason", header: "Offboarding reason" },
    { key: "offboarded_at", header: "Offboarded at" },
    { key: "assigned_assets", header: "Assigned assets" },
    { key: "rejection_reason", header: "Rejection reason" },
  ];

  const flattenValue = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object") {
      try { return JSON.stringify(v); } catch { return String(v); }
    }
    return String(v);
  };

  const fetchFullCandidates = async (ids: string[]) => {
    if (ids.length === 0) return [] as Array<Record<string, unknown>>;
    const { data, error } = await supabase
      .from("candidates" as never)
      .select("*")
      .in("id", ids);
    if (error) throw error;
    return (data as unknown as Array<Record<string, unknown>>) ?? [];
  };

  const handleExport = async (kind: "summary-csv" | "full-csv" | "full-json") => {
    const sourceRows = tab === "employee" ? employees : candidateRows;
    if (sourceRows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    try {
      const prefix = tab === "employee" ? "employees" : "candidates";
      if (kind === "summary-csv") {
        downloadCsv(prefix + "-summary", sourceRows.map(buildSummaryRow), SUMMARY_COLS);
      } else {
        const full = await fetchFullCandidates(sourceRows.map((r) => r.id));
        // enrich with friendly joins
        const enriched = full.map((row) => {
          const id = row.id as string;
          const src = sourceRows.find((s) => s.id === id);
          return {
            ...row,
            _role_name: roleNameOf((row.role_key as string) ?? src?.role_key),
            _designation_name: desigName((row.designation_id as string) ?? src?.designation_id ?? null),
            _unit_label: unitLabel((row.unit_id as string) ?? src?.unit_id ?? null),
            _customer_name: customerNameOfUnit((row.unit_id as string) ?? src?.unit_id ?? null),
            _reports_to_name: managerName((row.reports_to as string) ?? src?.reports_to ?? null),
            _offboarding_reason_name: offboardReasonName(
              (row.offboarding_reason_id as string) ?? src?.offboarding_reason_id ?? null,
            ),
            _assigned_asset_names: csvJoin(
              ((row.assigned_asset_ids as string[]) ?? src?.assigned_asset_ids ?? [])
                .map((aid: string) => assets.find((a) => a.id === aid)?.name)
                .filter(Boolean),
            ),
          };
        });
        if (kind === "full-json") {
          const blob = new Blob([JSON.stringify(enriched, null, 2)], {
            type: "application/json;charset=utf-8;",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
          a.href = url;
          a.download = `${prefix}-full-${stamp}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          // full-csv: union of all keys, flatten objects to JSON strings
          const keySet = new Set<string>();
          for (const r of enriched) for (const k of Object.keys(r)) keySet.add(k);
          const keys = Array.from(keySet);
          const cols = keys.map((k) => ({ key: k, header: k }));
          const rows = enriched.map((r) => {
            const out: Record<string, string> = {};
            for (const k of keys) out[k] = flattenValue((r as Record<string, unknown>)[k]);
            return out;
          });
          downloadCsv(prefix + "-full", rows, cols);
        }
      }
      await logActivity({
        module: "Employees",
        action: "export",
        entityType: "candidate",
        entityLabel: `${sourceRows.length} ${prefix} (${kind})`,
      });
      toast.success(`Exported ${sourceRows.length} ${prefix}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };


  const fieldOfficers = useMemo(
    () => candidates.filter((c) => c.role_key === "field_officer" && isEmployeeStatus(c.status)),
    [candidates],
  );
  const scopeByCandidate = useMemo(() => {
    const m = new Map<string, ScopeAssignment[]>();
    for (const s of scopeAssignments) {
      if (!m.has(s.candidate_id)) m.set(s.candidate_id, []);
      m.get(s.candidate_id)!.push(s);
    }
    return m;
  }, [scopeAssignments]);

  const signedDocs = signedDocsQuery.data ?? [];
  const signedByCandidate = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const s of signedDocs) {
      if (!s.candidate_id) continue;
      if (!m.has(s.candidate_id)) m.set(s.candidate_id, new Set());
      m.get(s.candidate_id)!.add(s.doc_type);
    }
    return m;
  }, [signedDocs]);

  const stats = useMemo(() => {
    // Candidate-tab stats (only non-employee status records)
    const candidateOnly = candidates.filter((c) => !isEmployeeStatus(c.status) || rehireByCandidate.has(c.id));
    const candTotal = candidateOnly.length;
    const candDrafts = candidateOnly.filter((c) => c.status === "draft").length;
    const candPending = candidateOnly.filter((c) => c.status === "pending").length;
    const candRejected = candidateOnly.filter((c) => c.status === "rejected").length;

    // Employee-tab stats (employees only)
    const employeeOnly = candidates.filter((c) => isEmployeeStatus(c.status) && !supersededEmployeeIds.has(c.id) && !rehireByCandidate.has(c.id));
    const empTotal = employeeOnly.length;
    const empActive = employeeOnly.filter((c) => c.is_enabled && c.status !== "inactive").length;
    const empInactive = empTotal - empActive;
    const empNdaSigned = employeeOnly.filter((c) => signedByCandidate.get(c.id)?.has("nda")).length;
    const empAlSigned = employeeOnly.filter((c) => signedByCandidate.get(c.id)?.has("appointment_letter")).length;

    return {
      candTotal, candDrafts, candPending, candRejected,
      empTotal, empActive, empInactive, empNdaSigned, empAlSigned,
    };
  }, [candidates, signedByCandidate, supersededEmployeeIds, rehireByCandidate]);

  const deleteMut = useMutation({
    mutationFn: async (c: CandidateListItem) => {
      const { data, error } = await supabase
        .from("candidates" as never)
        .delete()
        .eq("id", c.id)
        .select("id");
      if (error) throw error;
      if (!data || (data as unknown as { id: string }[]).length === 0) {
        throw new Error("You don't have permission to delete this candidate.");
      }
      await logActivity({
        module: "Employees",
        action: "delete",
        entityType: "candidate",
        entityId: c.id,
        entityLabel: c.full_name || c.aadhaar_number,
        before: c as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      toast.success("Candidate deleted");
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const assignRoleMut = useMutation({
    mutationFn: async ({ candidate, roleKey }: { candidate: CandidateListItem; roleKey: string }) => {
      const { error } = await supabase
        .from("candidates" as never)
        .update({ role_key: roleKey } as unknown as never)
        .eq("id", candidate.id);
      if (error) throw error;
      await logActivity({
        module: "Employees",
        action: "assign_role",
        entityType: "candidate",
        entityId: candidate.id,
        entityLabel: candidate.full_name || candidate.employee_code,
        after: { role_key: roleKey },
        before: { role_key: candidate.role_key },
      });
    },
    onSuccess: (_d, vars) => {
      const roleName = rolesList.find((r) => r.key === vars.roleKey)?.name ?? vars.roleKey;
      toast.success(`Role set to ${roleName}`);
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to assign role"),
  });

  const toggleEnabledMut = useMutation({
    mutationFn: async ({ candidate, enabled }: { candidate: CandidateListItem; enabled: boolean }) => {
      if (enabled && candidate.no_hire) {
        throw new Error("Employee is flagged Do not re-hire and cannot be reactivated.");
      }
      const patch: Record<string, unknown> = { is_enabled: enabled, status: enabled ? "active" : "inactive" };
      if (enabled) {
        patch.offboarding_reason_id = null;
        patch.offboarded_at = null;
      }
      const { error } = await supabase
        .from("candidates" as never)
        .update(patch as unknown as never)
        .eq("id", candidate.id);
      if (error) throw error;
      await logActivity({
        module: "Employees",
        action: enabled ? "enable" : "disable",
        entityType: "candidate",
        entityId: candidate.id,
        entityLabel: candidate.full_name || candidate.employee_code,
        before: { is_enabled: candidate.is_enabled, status: candidate.status },
        after: { is_enabled: enabled, status: enabled ? "active" : "inactive" },
      });
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.enabled ? "Employee activated" : "Employee deactivated");
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Toggle failed"),
  });

  const reactivateMut = useMutation({
    mutationFn: async ({ candidate, mode }: { candidate: CandidateListItem; mode: "reuse" | "new" }) => {
      // Fetch fresh source row so we don't act on stale cache (e.g. no_hire just toggled)
      const { data: src, error: fetchErr } = await supabase
        .from("candidates" as never)
        .select("*")
        .eq("id", candidate.id)
        .single();
      if (fetchErr) throw fetchErr;
      const source = src as unknown as Record<string, unknown>;
      if (source.no_hire === true) {
        throw new Error("Employee is flagged Do not re-hire. Uncheck it on the profile and save before reactivating.");
      }

      const canDirectActivate = isSuperAdmin || ["admin", "super_admin", "hr", "leadership"].includes(roleKey ?? "");
      const newStatus = canDirectActivate ? "active" : "pending";
      const today = new Date().toISOString().slice(0, 10);
      const sourceMobile = typeof source.mobile === "string" ? source.mobile.trim() : "";

      // Check if a non-inactive record already exists for this mobile (pending reactivation
      // or an active employee). If so we cannot create/keep another one alongside it.
      let existingReactivation: { id: string; employee_code: string; full_name: string; status: string } | null = null;
      if (sourceMobile) {
        const { data: existing, error: existingErr } = await supabase
          .from("candidates" as never)
          .select("id,employee_code,full_name,status")
          .eq("mobile", sourceMobile)
          .neq("id", candidate.id)
          .neq("status", "inactive")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingErr) throw existingErr;
        existingReactivation = (existing as typeof existingReactivation) ?? null;
      }
      if (existingReactivation) {
        const existing = existingReactivation as { id: string; employee_code: string; full_name: string; status: string };
        if (mode === "reuse") {
          // A pending/active record already exists — surface it instead of creating a duplicate.
          return { ...existing, reusedExisting: true, mode } as ReactivationResult;
        }
        // mode === "new": user explicitly wants a fresh employee ID.
        if (existing.status === "active") {
          throw new Error("This person already has an active employee record. Offboard it first before creating a new one.");
        }
        // Supersede the previous pending reactivation so the mobile unique index frees up.
        const { error: supersedeErr } = await supabase
          .from("candidates" as never)
          .delete()
          .eq("id", existing.id);
        if (supersedeErr) {
          throw new Error(getMutationErrorMessage(supersedeErr, "Could not clear previous pending reactivation"));
        }
      }


      if (mode === "reuse") {
        // Update the existing (inactive) record in place — keep the same employee_code / id.
        const patch: Record<string, unknown> = {
          status: newStatus,
          is_enabled: canDirectActivate,
          no_hire: false,
          offboarding_reason_id: null,
          offboarded_at: null,
          rejection_reason: "",
          rejected_at: null,
          preferred_joining_date: today,
        };
        const { data: updated, error: updateErr } = await supabase
          .from("candidates" as never)
          .update(patch as never)
          .eq("id", candidate.id)
          .select("id,employee_code,full_name,status")
          .single();
        if (updateErr) throw new Error(getMutationErrorMessage(updateErr, "Reactivation failed"));
        const rec = updated as unknown as ReactivationResult;
        await logActivity({
          module: "Employees",
          action: "reactivate",
          entityType: "candidate",
          entityId: rec.id,
          entityLabel: rec.full_name || rec.employee_code,
          before: { status: "inactive", employee_code: candidate.employee_code },
          after: { status: rec.status, employee_code: rec.employee_code, mode: "reuse" },
        });
        return { ...rec, mode } as ReactivationResult;
      }

      // mode === "new": clone into a fresh record (new employee_code will be generated on approval)
      const stripped: Record<string, unknown> = { ...source };
      [
        "id",
        "created_at",
        "updated_at",
        "employee_code",
        "candidate_code",
        "approved_at",
        "approved_by",
        "rejected_at",
        "rejection_reason",
      ].forEach((k) => delete stripped[k]);

      stripped.status = newStatus;
      stripped.is_enabled = canDirectActivate;
      stripped.no_hire = false;
      stripped.offboarding_reason_id = null;
      stripped.offboarded_at = null;
      stripped.application_date = today;
      stripped.preferred_joining_date = today;
      stripped.employee_code = "";
      stripped.candidate_code = "";
      stripped.created_by = currentUserId ?? source.created_by ?? null;

      const { data: inserted, error: insertErr } = await supabase
        .from("candidates" as never)
        .insert(stripped as unknown as never)
        .select("id,employee_code,full_name,status")
        .single();
      if (insertErr) {
        const message = getMutationErrorMessage(insertErr, "Reactivation failed");
        if (message.includes("candidates_mobile_unique") || message.toLowerCase().includes("duplicate key")) {
          throw new Error("This phone number is already used by another active employee or pending onboarding record.");
        }
        throw new Error(message);
      }
      const newRec = inserted as unknown as ReactivationResult;

      const { data: units } = await supabase
        .from("candidate_units" as never)
        .select("unit_id,is_primary,sort_order")
        .eq("candidate_id", candidate.id);
      const unitsArr = (units as unknown as { unit_id: string; is_primary: boolean; sort_order: number }[] | null) ?? [];
      if (unitsArr.length > 0) {
        const { error: unitsErr } = await supabase
          .from("candidate_units" as never)
          .insert(
            unitsArr.map((u) => ({
              candidate_id: newRec.id,
              unit_id: u.unit_id,
              is_primary: u.is_primary,
              sort_order: u.sort_order,
            })) as unknown as never,
          );
        if (unitsErr) throw new Error(getMutationErrorMessage(unitsErr, "Reactivation created the employee record but failed to copy unit assignments."));
      }

      await logActivity({
        module: "Employees",
        action: "reactivate",
        entityType: "candidate",
        entityId: newRec.id,
        entityLabel: newRec.full_name || newRec.employee_code,
        before: { source_id: candidate.id, source_employee_code: candidate.employee_code },
        after: { new_employee_code: newRec.employee_code, joining_date: today, status: newRec.status, mode: "new" },
      });
      return { ...newRec, mode, sourceId: candidate.id } as ReactivationResult;
    },
    onSuccess: (rec) => {
      const reuseLabel = rec.mode === "reuse" ? " (same employee ID)" : " (new employee ID)";
      if (rec.reusedExisting) {
        toast.success(`Reactivation is already pending HR/Admin approval for ${rec.full_name || rec.employee_code}`);
        setTab("candidate");
      } else if (rec.status === "pending") {
        toast.success(`Reactivation submitted for HR/Admin approval${reuseLabel}`);
        setTab("candidate");
      } else {
        toast.success(`Reactivated as ${rec.employee_code || "new employee"}${reuseLabel}`);
        setTab("employee");
      }
      if (rec.sourceId) {
        qc.setQueryData<CandidateListItem[]>(QK, (old) => old?.filter((row) => row.id !== rec.sourceId) ?? old);
      }
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(getMutationErrorMessage(e, "Reactivation failed")),
  });


  const offboardMut = useMutation({
    mutationFn: async ({
      candidate,
      reasonId,
      reasonName,
      details,
      noHire,
    }: {
      candidate: CandidateListItem;
      reasonId: string;
      reasonName: string;
      details: OffboardingDetails;
      noHire: boolean;
    }) => {
      const returns = (details.inventory_returns ?? []).filter((r) => r.qty_returned > 0);
      const pendingFoId =
        returns.length > 0 && returns[0].destination_type === "field_officer"
          ? returns[0].destination_id
          : null;
      const isDeferred = !!pendingFoId;
      const nowIso = new Date().toISOString();

      // Look up FO name for the offboarding_details record (nice-to-have for UI).
      let foName: string | null = null;
      if (pendingFoId) {
        const { data: foRow } = await supabase
          .from("candidates" as never)
          .select("full_name,employee_code")
          .eq("id", pendingFoId)
          .maybeSingle();
        const fo = foRow as { full_name?: string; employee_code?: string } | null;
        foName = fo?.full_name || fo?.employee_code || null;
      }

      const enrichedDetails: OffboardingDetails = {
        ...details,
        pending_collection_fo_id: pendingFoId,
        pending_collection_fo_name: foName,
        collection_status: isDeferred ? "pending" : returns.length > 0 ? "completed" : null,
        collection_requested_at: isDeferred ? nowIso : details.collection_requested_at ?? null,
        collection_completed_at: isDeferred ? null : returns.length > 0 ? nowIso : null,
      };

      const updatePayload: Record<string, unknown> = {
        offboarding_reason_id: reasonId,
        offboarding_details: enrichedDetails,
        no_hire: noHire,
      };
      if (isDeferred) {
        // Keep the employee active/enabled until the FO confirms collection.
        // Do NOT set offboarded_at here — finalisation happens on FO confirmation.
      } else {
        updatePayload.is_enabled = false;
        updatePayload.status = "inactive";
        updatePayload.offboarded_at = nowIso;
      }

      const { data: updated, error } = await supabase
        .from("candidates" as never)
        .update(updatePayload as unknown as never)
        .eq("id", candidate.id)
        .select("id");
      if (error) throw error;
      if (!updated || (updated as unknown as unknown[]).length === 0) {
        throw new Error("You don't have permission to offboard this employee, or the record could not be updated.");
      }

      if (isDeferred) {
        // Do NOT post inventory movements yet — the FO will confirm and then movements post.
        // Notify the selected Field Officer.
        try {
          const { data: uidRow } = await supabase.rpc(
            "get_user_id_by_candidate_id" as never,
            { _candidate_id: pendingFoId } as never,
          );
          const foUserId = (uidRow as unknown as string | null) ?? null;
          if (foUserId) {
            const itemsSummary = returns
              .map((r) => `${r.item_name}${r.size_value ? " (" + r.size_value + ")" : ""} × ${r.qty_returned}`)
              .join(", ");
            await createNotification({
              userId: foUserId,
              type: "offboarding_collection_pending",
              title: `Collection pending · ${candidate.full_name || candidate.employee_code}`,
              message: `HR has initiated offboarding. Please recover ${returns.length} item${returns.length === 1 ? "" : "s"}: ${itemsSummary}. Confirm in Uniform Manager → Collections.`,
              link: "/admin/inventory/collections",
              entityType: "candidate",
              entityId: candidate.id,
            });
          }
        } catch (e) {
          console.warn("Failed to notify field officer of pending collection", e);
        }
      } else if (returns.length) {
        // No pending FO handshake — post movements directly (e.g. no items, or non-FO path).
        const moves = returns.flatMap((r) => [
          {
            movement_type: "offboarding_return",
            location_type: "guard" as LocationType,
            location_id: candidate.id,
            item_id: r.item_id,
            size_value: r.size_value ?? "",
            qty_change: -Math.abs(r.qty_returned),
            reference_type: "offboarding_return",
            reference_id: candidate.id,
            notes: r.remarks ?? `Returned on offboarding · ${r.item_name}`,
          },
          {
            movement_type: "offboarding_return",
            location_type: r.destination_type,
            location_id: r.destination_id,
            item_id: r.item_id,
            size_value: r.size_value ?? "",
            qty_change: Math.abs(r.qty_returned),
            reference_type: "offboarding_return",
            reference_id: candidate.id,
            notes: r.remarks ?? `Received back from ${candidate.full_name || candidate.employee_code}`,
          },
        ]);
        try {
          await postMovements(moves);
        } catch (e) {
          console.error("Inventory return movement failed", e);
          toast.error("Employee offboarded, but inventory return failed to post. Please review Stock Ledger.");
        }
      }

      await logActivity({
        module: "Employees",
        action: isDeferred ? "offboard_requested" : "offboard",
        entityType: "candidate",
        entityId: candidate.id,
        entityLabel: candidate.full_name || candidate.employee_code,
        before: { is_enabled: candidate.is_enabled, status: candidate.status },
        after: {
          is_enabled: isDeferred ? candidate.is_enabled : false,
          status: isDeferred ? candidate.status : "inactive",
          offboarding_reason: reasonName,
          no_hire: noHire,
          offboarding_details: enrichedDetails,
          inventory_returns_count: returns.length,
          pending_collection_fo_id: pendingFoId,
        },
      });

      return { isDeferred, pendingFoName: foName };
    },
    onSuccess: (res) => {
      if (res?.isDeferred) {
        toast.success(
          `Offboarding submitted — awaiting inventory collection by ${res.pendingFoName ?? "field officer"}.`,
        );
      } else {
        toast.success("Employee offboarded");
      }
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: ["inv_stock_balances"] });
      qc.invalidateQueries({ queryKey: ["inv_stock_movements"] });
      setOffboardTarget(null);
      setOffboardReasonId("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Offboarding failed"),
  });


  const assignManagerMut = useMutation({
    mutationFn: async ({ candidate, managerId }: { candidate: CandidateListItem; managerId: string | null }) => {
      const { error } = await supabase
        .from("candidates" as never)
        .update({ reports_to: managerId } as unknown as never)
        .eq("id", candidate.id);
      if (error) throw error;
      await logActivity({
        module: "Employees",
        action: "assign_manager",
        entityType: "candidate",
        entityId: candidate.id,
        entityLabel: candidate.full_name || candidate.employee_code,
        before: { reports_to: candidate.reports_to },
        after: { reports_to: managerId },
      });
    },
    onSuccess: () => {
      toast.success("Reporting manager updated");
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to set manager"),
  });

  const addScopeMut = useMutation({
    mutationFn: async (input: { candidate: CandidateListItem; scope_type: ScopeType; scope_id: string; scope_label: string }) => {
      const { error } = await supabase
        .from("employee_scope_assignments" as never)
        .insert({
          candidate_id: input.candidate.id,
          scope_type: input.scope_type,
          scope_id: input.scope_id,
          scope_label: input.scope_label,
        } as unknown as never);
      if (error) throw error;
      await logActivity({
        module: "Employees",
        action: "add_scope",
        entityType: "candidate",
        entityId: input.candidate.id,
        entityLabel: input.candidate.full_name || input.candidate.employee_code,
        after: { scope_type: input.scope_type, scope_id: input.scope_id, scope_label: input.scope_label },
      });
    },
    onSuccess: () => {
      toast.success("Scope added");
      qc.invalidateQueries({ queryKey: QK_SCOPE_ASSIGNMENTS });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add scope"),
  });

  const removeScopeMut = useMutation({
    mutationFn: async ({ scope, candidate }: { scope: ScopeAssignment; candidate: CandidateListItem }) => {
      const { error } = await supabase
        .from("employee_scope_assignments" as never)
        .delete()
        .eq("id", scope.id);
      if (error) throw error;
      await logActivity({
        module: "Employees",
        action: "remove_scope",
        entityType: "candidate",
        entityId: candidate.id,
        entityLabel: candidate.full_name || candidate.employee_code,
        before: { scope_type: scope.scope_type, scope_id: scope.scope_id, scope_label: scope.scope_label },
      });
    },
    onSuccess: () => {
      toast.success("Scope removed");
      qc.invalidateQueries({ queryKey: QK_SCOPE_ASSIGNMENTS });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove scope"),
  });

  const [scopeTarget, setScopeTarget] = useState<CandidateListItem | null>(null);

  const approveMut = useMutation({
    mutationFn: async (cIn: CandidateListItem) => {
      // Refetch the candidate live — the list snapshot can be stale on
      // assigned_asset_ids / reports_to / unit_id, which silently skipped
      // the issuance handshake and the FO push.
      let c: CandidateListItem = cIn;
      try {
        const { data: fresh } = await supabase
          .from("candidates" as never)
          .select("id,full_name,role_key,unit_id,reports_to,assigned_asset_ids,aadhaar_number,designation_id,created_by")
          .eq("id", cIn.id)
          .maybeSingle();
        if (fresh) {
          const f = fresh as Partial<CandidateListItem>;
          c = { ...cIn, ...f, assigned_asset_ids: normalizeIdArray(f.assigned_asset_ids ?? cIn.assigned_asset_ids) };
        }
      } catch { /* fall back to snapshot */ }

      // Onboarding-issuance handshake (mirrors offboarding-collection):
      // If the candidate has assets to be issued and a Field Officer we can
      // resolve, we mark them "approved" with a pending-issuance flag. The FO
      // then uses the standard Issuances flow, and guard OTP acknowledgement
      // flips the row to "active".
      const guardRoles = new Set(["guard", "security_guard"]);
      const assignedAssetIds = normalizeIdArray(c.assigned_asset_ids);
      const hasAssets = assignedAssetIds.length > 0;
      const isGuardRole = guardRoles.has((c.role_key || "").toLowerCase());

      let foCandidateId: string | null = c.reports_to;
      if (!foCandidateId && c.unit_id) {
        try {
          const { data: cu } = await supabase
            .from("candidate_units" as never)
            .select("candidate_id, candidates:candidate_id(role_key,status)")
            .eq("unit_id", c.unit_id);
          const first = ((cu as unknown) as Array<{ candidate_id: string; candidates: { role_key?: string; status?: string } | null }> | null)
            ?.find((r) => r.candidates?.role_key === "field_officer" && ["active", "approved"].includes(String(r.candidates?.status ?? "")));
          foCandidateId = first?.candidate_id ?? null;
        } catch { /* ignore */ }
      }

      let foUserId: string | null = null;
      let foName = "";
      if (foCandidateId) {
        try {
          const { data: uid } = await supabase.rpc("get_user_id_by_candidate" as never, { _candidate_id: foCandidateId } as never);
          foUserId = uid ? String(uid) : null;
        } catch { /* ignore */ }
        try {
          const { data: foRow } = await supabase
            .from("candidates" as never)
            .select("full_name")
            .eq("id", foCandidateId)
            .maybeSingle();
          foName = String(((foRow as { full_name?: string } | null)?.full_name) ?? "");
        } catch { /* ignore */ }
      }

      if (!foUserId && isGuardRole && hasAssets) {
        try {
          const { data: resolved } = await supabase.rpc(
            "resolve_candidate_issuance_field_officer" as never,
            { _candidate_id: c.id, _unit_id: c.unit_id, _reports_to: c.reports_to } as never,
          );
          const row = (((resolved as unknown) as Array<{ fo_user_id?: string | null; fo_name?: string | null }> | null) ?? [])[0];
          foUserId = row?.fo_user_id ?? null;
          foName = row?.fo_name ?? foName;
        } catch { /* trigger still resolves this server-side */ }
      }

      const deferForIssuance = hasAssets && isGuardRole && !!foUserId;

      const nextStatus = deferForIssuance ? "approved" : "active";
      const nextOnboardingDetails: OnboardingDetails = deferForIssuance
        ? {
            pending_issuance_fo_id: foUserId,
            pending_issuance_fo_name: foName || null,
            issuance_status: "pending",
            issuance_requested_at: new Date().toISOString(),
            issuance_asset_ids: assignedAssetIds,
          }
        : {};

      const { data, error } = await supabase
        .from("candidates" as never)
        .update({
          status: nextStatus,
          // Keep the account enabled while awaiting issuance so the guard can log in
          // and acknowledge the hand-over (OTP) to complete the cycle.
          is_enabled: true,
          rejection_reason: "",
          rejected_at: null,
          offboarding_reason_id: null,
          offboarded_at: null,
          onboarding_details: nextOnboardingDetails,
        } as unknown as never)
        .eq("id", c.id)
        .select("id,employee_code,full_name")
        .single();
      if (error) throw error;
      const empCode = (data as { employee_code?: string })?.employee_code ?? "";
      const label = c.full_name || c.aadhaar_number || "Candidate";
      // Auto-attach Form VII (nomination form) to the newly approved employee.
      void (async () => {
        try {
          const { ensureFormViiForCandidate } = await import("@/lib/company-documents");
          await ensureFormViiForCandidate(c.id);
        } catch (e) {
          console.error("Form VII generation failed", e);
        }
      })();
      // Fire-and-forget: activity log + notifications should not block the UI.
      void (async () => {
        try {
          const unit = c.unit_id ? unitMap.get(c.unit_id) : undefined;
          const unitName = unit?.name ?? "";
          const clientName = unit?.customer_name ?? "";
          const desig = c.designation_id ? desigMap.get(c.designation_id) : undefined;
          const desigName = desig?.name ?? "";
          const joinDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
          let empUserId: string | null = null;
          try {
            const { data: uid } = await supabase.rpc("get_user_id_by_candidate" as never, { _candidate_id: c.id } as never);
            empUserId = uid ? String(uid) : null;
          } catch { /* ignore */ }

          const firstName = (c.full_name || "").split(" ")[0] || "there";
          const welcomeTitle = `Welcome to Radiant Guard Services${empCode ? ` — ${empCode}` : ""}`;
          const welcomeLines = [
            `Hi ${firstName}, we're thrilled to have you on board!`,
            "",
            "Here are your onboarding details:",
            empCode ? `• Employee ID: ${empCode}` : null,
            desigName ? `• Designation: ${desigName}` : null,
            unitName ? `• Job Location: ${unitName}${clientName ? ` (${clientName})` : ""}` : null,
            `• Date of Joining: ${joinDate}`,
            foName ? `• Field Officer: ${foName}` : null,
            "",
            "Thank you for choosing to grow with us — wishing you a proud, safe, and successful journey ahead. 🎉",
          ].filter(Boolean).join("\n");

          const tasks: Array<Promise<unknown>> = [
            logActivity({
              module: "Employees",
              action: deferForIssuance ? "approve_awaiting_issuance" : "approve",
              entityType: "candidate",
              entityId: c.id,
              entityLabel: c.full_name || c.aadhaar_number,
              after: data as unknown as Record<string, unknown>,
            }),
            notifyOnboardingApprovers({
              type: "candidate_approved",
              title: deferForIssuance ? "Candidate approved — awaiting issuance" : "Candidate approved",
              message: deferForIssuance
                ? `${label} approved${empCode ? ` (${empCode})` : ""} — waiting for ${foName || "Field Officer"} to issue assets.`
                : `${label} was approved${empCode ? ` (${empCode})` : ""}.`,
              link: "/admin/employees",
              entityType: "candidate",
              entityId: c.id,
            }),
            c.created_by
              ? notifyUser(c.created_by, {
                  type: "candidate_approved",
                  title: deferForIssuance ? "Candidate approved — awaiting your issuance" : "Your candidate was approved",
                  message: deferForIssuance
                    ? `${label} approved${empCode ? ` — ${empCode}` : ""}. Issue assets in Uniform Manager → Issuances to activate.`
                    : `${label} was approved${empCode ? ` — Employee Code ${empCode}` : ""}.`,
                  link: deferForIssuance ? `/admin/inventory/issuances?candidate=${c.id}&action=issue` : "/admin/employees",
                  entityType: "candidate",
                  entityId: c.id,
                })
              : Promise.resolve(),
          ];

          if (!deferForIssuance) {
            if (foUserId) {
              tasks.push(
                notifyUser(foUserId, {
                  type: "candidate_approved_for_fo",
                  title: "New team member approved",
                  message: `${label}${empCode ? ` (${empCode})` : ""} is now active under you${unitName ? ` at ${unitName}` : ""}.`,
                  link: "/admin/field-dashboard",
                  entityType: "candidate",
                  entityId: c.id,
                }),
              );
            }
            if (empUserId) {
              tasks.push(
                createNotification({
                  userId: empUserId,
                  type: "welcome_onboarded",
                  title: welcomeTitle,
                  message: welcomeLines,
                  link: "/admin/employee-dashboard",
                  entityType: "candidate",
                  entityId: c.id,
                }),
              );
            }
          }

          await Promise.allSettled(tasks);
        } catch (e) {
          console.error("post-approve side effects failed", e);
        }
      })();
      return { ...(data as { employee_code: string }), deferForIssuance, foName };
    },
    onSuccess: (data) => {
      if (data?.deferForIssuance) {
        toast.success(`Approved — awaiting ${data.foName || "Field Officer"} to issue assets`);
      } else {
        toast.success(`Approved — ${data?.employee_code ?? "Employee code assigned"}`);
      }
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Approve failed"),
  });

  const rejectMut = useMutation({
    mutationFn: async ({ c, reason }: { c: CandidateListItem; reason: string }) => {
      const { error } = await supabase
        .from("candidates" as never)
        .update({ status: "rejected", rejection_reason: reason } as unknown as never)
        .eq("id", c.id);
      if (error) throw error;
      const label = c.full_name || c.aadhaar_number || "Candidate";
      void (async () => {
        try {
          await Promise.allSettled([
            logActivity({
              module: "Employees",
              action: "reject",
              entityType: "candidate",
              entityId: c.id,
              entityLabel: c.full_name || c.aadhaar_number,
              after: { rejection_reason: reason },
            }),
            notifyOnboardingApprovers({
              type: "candidate_rejected",
              title: "Candidate rejected",
              message: `${label} was rejected. Reason: ${reason}`,
              link: "/admin/employees",
              entityType: "candidate",
              entityId: c.id,
            }),
            c.created_by
              ? notifyUser(c.created_by, {
                  type: "candidate_rejected",
                  title: "Your candidate needs changes",
                  message: `${label} was rejected. Reason: ${reason}`,
                  link: "/admin/employees",
                  entityType: "candidate",
                  entityId: c.id,
                })
              : Promise.resolve(),
          ]);
        } catch (e) {
          console.error("post-reject side effects failed", e);
        }
      })();
    },
    onSuccess: () => {
      toast.success("Candidate rejected");
      qc.invalidateQueries({ queryKey: QK });
      setRejectTarget(null);
      setRejectReason("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reject failed"),
  });

  const canEditInactiveProfile = isSuperAdmin || roleKey === "leadership" || roleKey === "super_admin";

  const openEditor = async (candidateId: string) => {
    setOpeningCandidateId(candidateId);
    try {
      const { data, error } = await supabase
        .from("candidates" as never)
        .select("*")
        .eq("id", candidateId)
        .single();
      if (error) throw error;
      const record = (data as Candidate) ?? null;
      if (record && record.status === "inactive" && !canEditInactiveProfile) {
        toast.error("Only leadership or super admin can edit an inactive employee's profile.");
        return;
      }
      setEditing(record);
      setOpenWizard(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open candidate");
    } finally {
      setOpeningCandidateId(null);
    }
  };


  const renderRows = (rows: CandidateListItem[], mode: "employee" | "candidate") => {
    const empCols = 4 + Object.values(columnsVisible).filter(Boolean).length;
    const candCols = 7;
    if (isLoading) {
      const cols = mode === "employee" ? empCols : candCols;
      return (
        <>
          {Array.from({ length: 6 }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="px-4 py-3">
                  <Skeleton className={c === 0 ? "h-8 w-8 rounded-full" : "h-4 w-full"} />
                </td>
              ))}
            </tr>
          ))}
        </>
      );
    }

    if (candidatesError) {
      return (
        <tr>
          <td colSpan={mode === "employee" ? empCols : candCols} className="px-4 py-10 text-center text-muted-foreground">
            {candidatesError instanceof Error
              ? candidatesError.message
              : "Could not load employees right now. Please retry."}
          </td>
        </tr>
      );
    }
    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={mode === "employee" ? empCols : candCols} className="px-4 py-10 text-center text-muted-foreground">
            {mode === "employee"
              ? "No employees yet. Approve a candidate to generate an Employee ID."
              : "No candidates here. Click "}
            {mode === "candidate" && <b>Add Candidate</b>}
            {mode === "candidate" && " to start."}
          </td>
        </tr>
      );
    }
    return rows.map((c) => {
      const unit = c.unit_id ? unitMap.get(c.unit_id) : undefined;
      const desig = c.designation_id ? desigMap.get(c.designation_id) : undefined;
      const code = mode === "employee" ? c.employee_code || "—" : c.candidate_code || "—";
      const isDisabled = mode === "employee" && !c.is_enabled;
      const isPendingOffboarding =
        c.offboarding_details?.collection_status === "pending" &&
        !!c.offboarding_details?.pending_collection_fo_id;
      const pendingFoName = c.offboarding_details?.pending_collection_fo_name;
      const isPendingIssuance =
        c.onboarding_details?.issuance_status === "pending" &&
        !!c.onboarding_details?.pending_issuance_fo_id;
      const pendingIssuanceFoName = c.onboarding_details?.pending_issuance_fo_name;
      const rehire = rehireByCandidate.get(c.id);
      return (
        <tr key={c.id} className={cn(
          "group transition-colors hover:bg-amber-50/30 dark:hover:bg-amber-500/5",
          isDisabled && "opacity-60",
          (isPendingOffboarding || isPendingIssuance) && "bg-amber-500/[0.04] hover:bg-amber-500/[0.07]"
        )}>

          <td className="px-2.5 py-2.5 align-top">
            <span className="inline-flex items-center whitespace-nowrap rounded-md bg-secondary px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide tabular-nums text-muted-foreground">
              {code}
            </span>
          </td>
          <td className="px-2.5 py-2.5 align-top">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
              {c.photo_url ? (
                <img
                  src={c.photo_url}
                  alt=""
                  className="h-8 w-8 flex-shrink-0 rounded-full object-cover shadow-sm ring-2 ring-card"
                />
              ) : (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground shadow-sm ring-2 ring-card">
                  <UserPlus className="h-3.5 w-3.5" />
                </div>
              )}

              <div className="min-w-0">
                <div className="truncate font-semibold leading-tight text-foreground group-hover:text-amber-900 dark:group-hover:text-amber-300">
                  {c.full_name || "—"}
                </div>
                <div className="truncate text-xs text-muted-foreground">{c.email || "—"}</div>
                <div className="mt-1 grid gap-x-5 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 2xl:hidden">
                  {(mode === "candidate" || columnsVisible.mobile) && (
                    <div className="truncate">
                      <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">Mobile</span>
                      {c.mobile || "—"}
                    </div>
                  )}
                  {(mode === "candidate" || columnsVisible.unit) && (
                    <div className="truncate" title={unit?.name ?? ""}>
                      <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">Unit</span>
                      {unit?.name || "—"}
                    </div>
                  )}
                  {(mode === "candidate" || columnsVisible.designation) && (
                    <div className="truncate" title={desig?.name ?? ""}>
                      <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">Designation</span>
                      {desig?.name || "—"}
                    </div>
                  )}
                  {mode === "employee" && columnsVisible.role && (
                    <div className="truncate">
                      <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">Role</span>
                      {rolesList.find((r) => r.key === c.role_key)?.name ?? c.role_key ?? "—"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </td>
          {(mode === "candidate" || columnsVisible.mobile) && (
            <td className="hidden px-2.5 py-2.5 text-center text-sm font-medium text-muted-foreground 2xl:table-cell">{c.mobile || "—"}</td>
          )}
          {mode === "employee" && columnsVisible.email && (
            <td className="hidden max-w-[180px] px-2.5 py-2.5 text-sm text-muted-foreground 2xl:table-cell"><span className="block truncate" title={c.email ?? ""}>{c.email || "—"}</span></td>
          )}
          {(mode === "candidate" || columnsVisible.unit) && (
            <td className="hidden max-w-[150px] px-2.5 py-2.5 2xl:table-cell">
              {unit ? (
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground" title={unit.name}>{unit.name}</div>
                  <div className="truncate text-xs text-muted-foreground" title={unit.customer_name}>{unit.customer_name}</div>
                </div>
              ) : (
                "—"
              )}
            </td>
          )}
          {(mode === "candidate" || columnsVisible.designation) && (
            <td className="hidden max-w-[130px] px-2.5 py-2.5 text-sm text-muted-foreground 2xl:table-cell"><span className="block truncate" title={desig?.name ?? ""}>{desig?.name ?? "—"}</span></td>
          )}
          {mode === "employee" && columnsVisible.dob && (
            <td className="hidden px-2.5 py-2.5 text-sm whitespace-nowrap text-muted-foreground 2xl:table-cell">{fmtDate(c.date_of_birth)}</td>
          )}
          {mode === "employee" && columnsVisible.doj && (
            <td className="hidden px-2.5 py-2.5 text-sm whitespace-nowrap text-muted-foreground 2xl:table-cell">{fmtDate(c.approved_at ?? c.preferred_joining_date)}</td>
          )}
          {mode === "employee" && columnsVisible.role && (
            <td className="hidden px-2.5 py-2.5 md:table-cell">

              {c.role_key ? (
                <Select
                  value={c.role_key}
                  onValueChange={async (v) => {
                    if (v === c.role_key) return;
                    const ok = await confirmAction({
                      title: "Change role?",
                      description: `Change role for ${c.full_name || c.employee_code} to ${rolesList.find((r) => r.key === v)?.name ?? v}?`,
                      confirmText: "Change role",
                    });
                    if (!ok) return;
                    assignRoleMut.mutate({ candidate: c, roleKey: v });
                  }}
                >
                  <SelectTrigger className="h-8 w-[108px] rounded-lg border-border/60 bg-card text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rolesList.map((r) => (
                      <SelectItem key={r.key} value={r.key} className="text-xs">
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                    No role assigned
                  </Badge>
                  <Select
                    value=""
                    onValueChange={async (v) => {
                      const ok = await confirmAction({
                        title: "Assign role?",
                        description: `Assign role ${rolesList.find((r) => r.key === v)?.name ?? v} to ${c.full_name || c.employee_code}?`,
                        confirmText: "Assign",
                      });
                      if (!ok) return;
                      assignRoleMut.mutate({ candidate: c, roleKey: v });
                    }}
                  >
                    <SelectTrigger className="h-7 w-[120px] rounded-lg border-dashed border-border/60 bg-transparent text-xs text-muted-foreground">
                      <SelectValue placeholder="Map role" />
                    </SelectTrigger>
                    <SelectContent>
                      {rolesList.map((r) => (
                        <SelectItem key={r.key} value={r.key} className="text-xs">
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </td>
          )}
          {mode === "employee" && columnsVisible.active && (
            <td className="hidden px-2.5 py-2.5 2xl:table-cell">
              <Switch
                checked={c.is_enabled && c.status !== "inactive"}
                onCheckedChange={async (v) => {
                  if (!v) {
                    // Disabling → start offboarding workflow
                    setOffboardTarget(c);
                    setOffboardReasonId("");
                    return;
                  }
                  if (c.no_hire) {
                    toast.error("This employee is flagged Do not re-hire and cannot be reactivated.");
                    return;
                  }
                  // If previously offboarded, ask whether to reuse the same record or create a new one
                  const wasOffboarded = !!c.offboarding_reason_id || !!c.offboarded_at;
                  if (wasOffboarded) {
                    setReactivateTarget(c);
                    return;
                  }

                  const ok = await confirmAction({
                    title: "Activate employee?",
                    description: `${c.full_name || c.employee_code} will be marked active again.`,
                    confirmText: "Activate",
                  });
                  if (!ok) return;
                  toggleEnabledMut.mutate({ candidate: c, enabled: true });
                }}
                disabled={!c.is_enabled && c.no_hire}
              />
            </td>
          )}
          <td className="w-[110px] min-w-[100px] whitespace-nowrap px-2.5 py-2.5 align-middle" data-col="status">
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex flex-nowrap items-center justify-end gap-2">
                <StatusBadge status={c.status} />
                {rehire && (
                  <span
                    className="inline-flex shrink-0 cursor-help items-center gap-1 rounded-full border border-violet-300/70 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300"
                    title={rehire.isFinal
                      ? "Rehire approved — awaiting enablement. Enable to issue a new employee ID."
                      : `Rehire in progress · ${rehire.stepName}`}
                  >
                    <Clock className="h-3 w-3" />
                    <span className="hidden sm:inline">{rehire.isFinal ? "Awaiting enablement" : "Rehire in progress"}</span>
                  </span>
                )}
                {isPendingOffboarding && (
                  <span
                    className="inline-flex shrink-0 cursor-help items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
                    title={`Offboarding in progress — awaiting inventory collection${pendingFoName ? ` by ${pendingFoName}` : ""}. Employee stays active until the Field Officer confirms recovery.`}
                  >
                    <Clock className="h-3 w-3" />
                    <span className="hidden sm:inline">Awaiting collection</span>
                  </span>
                )}
                {isPendingIssuance && (
                  <span
                    className="inline-flex shrink-0 cursor-help items-center gap-1 rounded-full border border-sky-300/70 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300"
                    title={`Approved — awaiting Field Officer${pendingIssuanceFoName ? ` (${pendingIssuanceFoName})` : ""} to issue assets. Activates once issuance is confirmed.`}
                  >
                    <Clock className="h-3 w-3" />
                    <span className="hidden sm:inline">Awaiting issuance</span>
                  </span>
                )}
                {mode === "employee" && columnsVisible.active && (
                  <Switch
                    className="2xl:hidden"
                    checked={c.is_enabled && c.status !== "inactive"}
                    onCheckedChange={async (v) => {
                      if (!v) {
                        setOffboardTarget(c);
                        setOffboardReasonId("");
                        return;
                      }
                      if (c.no_hire) {
                        toast.error("This employee is flagged Do not re-hire and cannot be reactivated.");
                        return;
                      }
                      const wasOffboarded = !!c.offboarding_reason_id || !!c.offboarded_at;
                      if (wasOffboarded) {
                        setReactivateTarget(c);
                        return;
                      }

                      const ok = await confirmAction({
                        title: "Activate employee?",
                        description: `${c.full_name || c.employee_code} will be marked active again.`,
                        confirmText: "Activate",
                      });
                      if (!ok) return;
                      toggleEnabledMut.mutate({ candidate: c, enabled: true });
                    }}
                    disabled={!c.is_enabled && c.no_hire}
                  />
                )}
              </div>
              {c.status === "rejected" && c.rejection_reason && (
                <div className="max-w-[220px] truncate text-right text-xs text-muted-foreground" title={c.rejection_reason}>
                  {c.rejection_reason}
                </div>
              )}
              {c.status === "inactive" && c.offboarding_reason_id && (() => {
                const r = offboardReasons.find((x) => x.id === c.offboarding_reason_id);
                const date = c.offboarded_at ? new Date(c.offboarded_at).toLocaleDateString() : null;
                const label = r?.name || "Offboarded";
                return (
                  <div className="max-w-[220px] truncate text-right text-xs text-muted-foreground" title={`${label}${date ? " · " + date : ""}`}>
                    {label}{date ? ` · ${date}` : ""}
                  </div>
                );
              })()}
              {isPendingOffboarding && (
                <div
                  className="max-w-[220px] truncate text-right text-[11px] text-amber-700 dark:text-amber-300"
                  title={`Offboarding in progress — awaiting inventory collection${pendingFoName ? ` by ${pendingFoName}` : ""}. Employee stays active until the Field Officer confirms recovery.`}
                >
                  Offboarding in progress
                </div>
              )}
            </div>
          </td>

          <td className="w-[200px] min-w-[180px] whitespace-nowrap px-3 py-2.5 align-middle" data-col="actions">
            <div className="flex flex-nowrap items-center justify-end gap-1.5">



              {mode === "candidate" && rehire?.canAct && (
                <Button
                  size="sm"
                  onClick={() => setRehireReviewTarget(rehire.request)}
                  className="h-8 rounded-full bg-violet-600 px-3 text-[11px] font-semibold text-white hover:bg-violet-700"
                  title={rehire.isFinal ? "Enable this rehire" : "Review this rehire approval"}
                >
                  {rehire.isFinal ? "Enable" : "Review"}
                </Button>
              )}
              {mode === "employee" && rehire?.isFinal && rehire.canAct && (
                <Button
                  size="sm"
                  onClick={() => setEnableRehireTarget(rehire.request)}
                  className="h-8 rounded-full bg-violet-600 px-3 text-[11px] font-semibold text-white hover:bg-violet-700"
                  title="Enable this rehire and issue a new employee ID"
                >
                  Enable
                </Button>
              )}
              {mode === "candidate" && c.status === "pending" && canApproveOnboarding && (
                <>
                  <Button
                    size="icon"
                    data-variant="success"
                    onClick={() => setApprovePreview(c)}
                    disabled={approveMut.isPending}
                    className="h-8 w-8 rounded-full bg-emerald-600 text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95"
                    title="Review & approve"
                    aria-label="Review & approve"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    data-variant="danger"
                    variant="outline"
                    onClick={() => {
                      setRejectTarget(c);
                      setRejectReason("");
                    }}
                    className="h-8 w-8 rounded-full border-rose-200 bg-rose-50 text-rose-600 transition-all hover:bg-rose-100 hover:text-rose-700 active:scale-95 dark:border-rose-500/40 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                    title="Reject candidate"
                    aria-label="Reject"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              )}
              {mode === "employee" && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    data-variant="warn"
                    onClick={() => setSignTarget({ id: c.id, docType: "nda" })}
                    className="h-8 w-8 rounded-full border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 dark:border-amber-500/40 dark:bg-transparent dark:text-amber-300 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                    title="Sign NDA"
                    aria-label="Sign NDA"
                  >
                    <FileSignature className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    data-variant="warn"
                    onClick={() => setSignTarget({ id: c.id, docType: "appointment_letter" })}
                    className="h-8 w-8 rounded-full border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:border-sky-500/40 dark:bg-transparent dark:text-sky-300 dark:hover:bg-sky-500/10 dark:hover:text-sky-300"
                    title="Sign Appointment Letter"
                    aria-label="Sign Appointment Letter"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                </>
              )}
              <div className="flex flex-nowrap items-center gap-1">
                {(() => {
                  const editLocked = c.status === "inactive" && !canEditInactiveProfile;
                  const lockedTitle = "Inactive profile — only leadership or super admin can edit.";
                  return (
                    <>
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                        title={editLocked ? "View profile & offboarding docs (read-only)" : "Open the full 10-section editor"}
                      >
                        <Link
                          to="/admin/candidates/$id/details"
                          params={{ id: c.id }}
                          search={c.offboarding_details && Object.keys(c.offboarding_details).length > 0 ? { section: "offboarding" } : undefined}
                        >
                          <FileText className="h-4 w-4" />
                        </Link>
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void openEditor(c.id)}
                        disabled={openingCandidateId === c.id || editLocked}
                        className="h-7 w-7 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                        title={editLocked ? lockedTitle : "Quick edit"}
                        aria-label={editLocked ? lockedTitle : "Quick edit"}
                      >
                        {openingCandidateId === c.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Edit2 className="h-4 w-4" />
                        )}
                      </Button>
                    </>
                  );
                })()}

                {mode === "candidate" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setConfirmDelete(c)}
                    className="h-7 w-7 rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </td>
        </tr>
      );
    });
  };

  const renderMobileCards = (rows: CandidateListItem[], mode: "employee" | "candidate") => {
    if (isLoading) {
      return (
        <div className="space-y-2.5 md:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/70 bg-card p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (candidatesError) {
      return (
        <div className="rounded-2xl border border-border/70 bg-card p-6 text-center text-sm text-muted-foreground md:hidden">
          {candidatesError instanceof Error ? candidatesError.message : "Could not load employees right now. Please retry."}
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <div className="rounded-2xl border border-border/70 bg-card p-6 text-center text-sm text-muted-foreground md:hidden">
          {mode === "employee" ? "No employees yet. Approve a candidate to generate an Employee ID." : "No candidates here. Add Candidate to start."}
        </div>
      );
    }

    return (
      <div className="grid gap-2.5 md:hidden">
        {rows.map((c) => {
          const unit = c.unit_id ? unitMap.get(c.unit_id) : undefined;
          const desig = c.designation_id ? desigMap.get(c.designation_id) : undefined;
          const code = mode === "employee" ? c.employee_code || "—" : c.candidate_code || "—";
          const isDisabled = mode === "employee" && !c.is_enabled;
          const isPendingOffboarding =
            c.offboarding_details?.collection_status === "pending" &&
            !!c.offboarding_details?.pending_collection_fo_id;
          const pendingFoName = c.offboarding_details?.pending_collection_fo_name;
          const isPendingIssuance =
            c.onboarding_details?.issuance_status === "pending" &&
            !!c.onboarding_details?.pending_issuance_fo_id;
          const pendingIssuanceFoName = c.onboarding_details?.pending_issuance_fo_name;
          const editLocked = c.status === "inactive" && !canEditInactiveProfile;
          const lockedTitle = "Inactive profile — only leadership or super admin can edit.";
          const rehire = rehireByCandidate.get(c.id);
          const roleName = rolesList.find((r) => r.key === c.role_key)?.name ?? c.role_key ?? "No role";

          return (
            <article
              key={c.id}
              className={cn(
                "rounded-2xl border border-border/70 bg-card p-3 shadow-sm",
                isDisabled && "opacity-65",
                isPendingOffboarding && "border-amber-300/70 bg-amber-500/[0.05]",
              )}
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5">
                {c.photo_url ? (
                  <img src={c.photo_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover shadow-sm ring-1 ring-border/70" />
                ) : (
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground shadow-sm ring-1 ring-border/70">
                    <UserPlus className="h-4 w-4" />
                  </div>
                )}

                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <h3 className="max-w-full truncate text-sm font-semibold leading-tight text-foreground">{c.full_name || "—"}</h3>
                    <span className="inline-flex shrink-0 items-center rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                      {code}
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="truncate">{c.mobile || "No mobile"}</span>
                    <span className="truncate text-right">{roleName}</span>
                    <span className="truncate" title={unit?.name ?? ""}>{unit?.name || "No unit"}</span>
                    <span className="truncate text-right" title={desig?.name ?? ""}>{desig?.name || "No designation"}</span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusBadge status={c.status} />
                  {mode === "employee" && columnsVisible.active && (
                    <Switch
                      checked={c.is_enabled && c.status !== "inactive"}
                      onCheckedChange={async (v) => {
                        if (!v) {
                          setOffboardTarget(c);
                          setOffboardReasonId("");
                          return;
                        }
                        if (c.no_hire) {
                          toast.error("This employee is flagged Do not re-hire and cannot be reactivated.");
                          return;
                        }
                        const wasOffboarded = !!c.offboarding_reason_id || !!c.offboarded_at;
                        if (wasOffboarded) {
                          setReactivateTarget(c);
                          return;
                        }
                        const ok = await confirmAction({
                          title: "Activate employee?",
                          description: `${c.full_name || c.employee_code} will be marked active again.`,
                          confirmText: "Activate",
                        });
                        if (!ok) return;
                        toggleEnabledMut.mutate({ candidate: c, enabled: true });
                      }}
                      disabled={!c.is_enabled && c.no_hire}
                    />
                  )}
                </div>
              </div>

              {rehire && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-violet-300/70 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span className="truncate">{rehire.isFinal ? "Awaiting enablement" : `Rehire · ${rehire.stepName}`}</span>
                  </span>
                  {mode === "candidate" && rehire.canAct && (
                    <Button
                      size="sm"
                      onClick={() => setRehireReviewTarget(rehire.request)}
                      className="h-7 rounded-full bg-violet-600 px-3 text-[11px] font-semibold text-white hover:bg-violet-700"
                    >
                      {rehire.isFinal ? "Enable" : "Review"}
                    </Button>
                  )}
                  {mode === "employee" && rehire.isFinal && rehire.canAct && (
                    <Button
                      size="sm"
                      onClick={() => setEnableRehireTarget(rehire.request)}
                      className="h-7 rounded-full bg-violet-600 px-3 text-[11px] font-semibold text-white hover:bg-violet-700"
                    >
                      Enable
                    </Button>
                  )}
                </div>
              )}
              {isPendingOffboarding && (
                <div
                  className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
                  title={`Offboarding in progress — awaiting inventory collection${pendingFoName ? ` by ${pendingFoName}` : ""}. Employee stays active until the Field Officer confirms recovery.`}
                >
                  <Clock className="h-3 w-3 shrink-0" />
                  <span className="truncate">Awaiting collection{pendingFoName ? ` · ${pendingFoName}` : ""}</span>
                </div>
              )}
              {isPendingIssuance && (
                <div
                  className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full border border-sky-300/70 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300"
                  title={`Approved — awaiting Field Officer${pendingIssuanceFoName ? ` (${pendingIssuanceFoName})` : ""} to issue assets. Activates once issuance is confirmed.`}
                >
                  <Clock className="h-3 w-3 shrink-0" />
                  <span className="truncate">Awaiting issuance{pendingIssuanceFoName ? ` · ${pendingIssuanceFoName}` : ""}</span>
                </div>
              )}

              {mode === "employee" && columnsVisible.role && (
                <div className="mt-2">
                  {c.role_key ? (
                    <Select
                      value={c.role_key}
                      onValueChange={async (v) => {
                        if (v === c.role_key) return;
                        const ok = await confirmAction({
                          title: "Change role?",
                          description: `Change role for ${c.full_name || c.employee_code} to ${rolesList.find((r) => r.key === v)?.name ?? v}?`,
                          confirmText: "Change role",
                        });
                        if (!ok) return;
                        assignRoleMut.mutate({ candidate: c, roleKey: v });
                      }}
                    >
                      <SelectTrigger className="h-8 w-full rounded-lg border-border/60 bg-card text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {rolesList.map((r) => (
                          <SelectItem key={r.key} value={r.key} className="text-xs">{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value=""
                      onValueChange={async (v) => {
                        const ok = await confirmAction({
                          title: "Assign role?",
                          description: `Assign role ${rolesList.find((r) => r.key === v)?.name ?? v} to ${c.full_name || c.employee_code}?`,
                          confirmText: "Assign",
                        });
                        if (!ok) return;
                        assignRoleMut.mutate({ candidate: c, roleKey: v });
                      }}
                    >
                      <SelectTrigger className="h-8 w-full rounded-lg border-dashed border-border/60 bg-card text-xs text-muted-foreground">
                        <SelectValue placeholder="Map role" />
                      </SelectTrigger>
                      <SelectContent>
                        {rolesList.map((r) => (
                          <SelectItem key={r.key} value={r.key} className="text-xs">{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-border/50 pt-2">
                {mode === "candidate" && c.status === "pending" && canApproveOnboarding && (
                  <>
                    <Button size="icon" data-variant="success" onClick={() => setApprovePreview(c)} disabled={approveMut.isPending} className="h-8 w-8 rounded-full bg-emerald-600 text-white hover:bg-emerald-700" title="Review & approve" aria-label="Review & approve">
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" data-variant="danger" variant="outline" onClick={() => { setRejectTarget(c); setRejectReason(""); }} className="h-8 w-8 rounded-full border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100" title="Reject" aria-label="Reject">
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {mode === "employee" && (
                  <>
                    <Button variant="outline" size="icon" data-variant="warn" onClick={() => setSignTarget({ id: c.id, docType: "nda" })} className="h-8 w-8 rounded-full border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" title="Sign NDA" aria-label="Sign NDA">
                      <FileSignature className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" data-variant="warn" onClick={() => setSignTarget({ id: c.id, docType: "appointment_letter" })} className="h-8 w-8 rounded-full border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100" title="Sign Appointment Letter" aria-label="Sign Appointment Letter">
                      <FileText className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" title={editLocked ? "View profile & offboarding docs (read-only)" : "Open full editor"}>
                  <Link
                    to="/admin/candidates/$id/details"
                    params={{ id: c.id }}
                    search={c.offboarding_details && Object.keys(c.offboarding_details).length > 0 ? { section: "offboarding" } : undefined}
                  ><FileText className="h-4 w-4" /></Link>
                </Button>

                <Button variant="ghost" size="icon" onClick={() => void openEditor(c.id)} disabled={openingCandidateId === c.id || editLocked} className="h-8 w-8 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50" title={editLocked ? lockedTitle : "Quick edit"} aria-label={editLocked ? lockedTitle : "Quick edit"}>
                  {openingCandidateId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit2 className="h-4 w-4" />}
                </Button>
                {mode === "candidate" && (
                  <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(c)} className="h-8 w-8 rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600" title="Delete" aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  const renderTable = (rows: CandidateListItem[], mode: "employee" | "candidate") => (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm shadow-stone-200/40 dark:shadow-black/20 sm:rounded-3xl">
      <div className="flex items-center justify-between border-b border-border bg-accent/10 px-3 py-2 text-xs font-medium text-foreground sm:px-5 sm:py-2.5">
        <span className="inline-flex items-center gap-2"><span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{rows.length}</span><span className="uppercase tracking-[0.14em] text-muted-foreground">Total {rows.length === 1 ? "row" : "rows"}</span></span>
      </div>
      <div className="p-2.5 md:hidden">
        {renderMobileCards(rows, mode)}
      </div>
      <div className="hidden w-full overflow-x-auto md:block">
        <table className="ios-table w-full table-auto text-sm 2xl:min-w-[1480px]">

          <thead className="border-b border-border/60 bg-secondary/40">
            <tr>
              <th className="w-[112px] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {mode === "employee" ? "Emp ID" : "Code"}
              </th>
              <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {mode === "employee" ? "Employee" : "Candidate"}
              </th>
              {(mode === "candidate" || columnsVisible.mobile) && (
                <th className="hidden w-[132px] px-3 py-3 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground 2xl:table-cell">
                  Mobile
                </th>
              )}
              {mode === "employee" && columnsVisible.email && (
                <th className="hidden w-[176px] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground 2xl:table-cell">
                  Email
                </th>
              )}
              {(mode === "candidate" || columnsVisible.unit) && (
                <th className="hidden w-[188px] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground 2xl:table-cell">
                  Unit
                </th>
              )}
              {(mode === "candidate" || columnsVisible.designation) && (
                <th className="hidden w-[154px] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground 2xl:table-cell">
                  Designation
                </th>
              )}
              {mode === "employee" && columnsVisible.dob && (
                <th className="hidden w-[124px] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground 2xl:table-cell">
                  Date of Birth
                </th>
              )}
              {mode === "employee" && columnsVisible.doj && (
                <th className="hidden w-[124px] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground 2xl:table-cell">
                  Date of Joining
                </th>
              )}
              {mode === "employee" && columnsVisible.role && (
                <th className="hidden w-[128px] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground md:table-cell">
                  Role
                </th>
              )}

              {mode === "employee" && columnsVisible.active && (
                <th className="hidden w-[92px] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground 2xl:table-cell">
                  Active
                </th>
              )}
              <th className="w-[110px] min-w-[100px] whitespace-nowrap px-3 py-3 text-right text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground" data-col="status">
                Status
              </th>
              <th className="w-[200px] min-w-[180px] whitespace-nowrap px-3 py-3 text-right text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground" data-col="actions">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">{renderRows(rows, mode)}</tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Employees"
        description="Onboard and manage candidates joining client units."
        crumbs={[{ label: "Employees" }]}
      />

      <RehireEnableDialog
        request={enableRehireTarget}
        onClose={() => setEnableRehireTarget(null)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: QK });
          qc.invalidateQueries({ queryKey: ["rehire-pipeline"] });
        }}
      />

      <RehireReviewDialog
        request={rehireReviewTarget}
        steps={rehireStepsQ.data ?? []}
        roleKey={roleKey}
        isSuperAdmin={isSuperAdmin}
        onClose={() => setRehireReviewTarget(null)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: QK });
          qc.invalidateQueries({ queryKey: ["rehire-pipeline"] });
          qc.invalidateQueries({ queryKey: ["workflows", "rehire"] });
        }}
      />

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {(tab === "employee" && !isFieldOfficer
          ? [
              { label: "Total", value: stats.empTotal, accent: false as const, dot: "bg-stone-400", tone: "neutral" as const },
              { label: "Active", value: stats.empActive, accent: false as const, dot: "bg-emerald-500", tone: "neutral" as const },
              { label: "Inactive", value: stats.empInactive, accent: false as const, dot: "bg-slate-400", tone: "neutral" as const },
              {
                label: "NDA Signed",
                value: stats.empNdaSigned,
                accent: stats.empTotal > 0 && stats.empNdaSigned < stats.empTotal,
                dot: "bg-rose-500",
                tone: (stats.empTotal > 0 && stats.empNdaSigned < stats.empTotal ? "alert" : "neutral") as "alert" | "neutral",
                suffix: `/ ${stats.empTotal}`,
              },
              {
                label: "Appt. Letter Signed",
                value: stats.empAlSigned,
                accent: stats.empTotal > 0 && stats.empAlSigned < stats.empTotal,
                dot: "bg-rose-500",
                tone: (stats.empTotal > 0 && stats.empAlSigned < stats.empTotal ? "alert" : "neutral") as "alert" | "neutral",
                suffix: `/ ${stats.empTotal}`,
              },
            ]
          : [
              { label: "Total", value: stats.candTotal, accent: false as const, dot: "bg-stone-400", tone: "neutral" as const },
              { label: "Drafts", value: stats.candDrafts, accent: false as const, dot: "bg-slate-400", tone: "neutral" as const },
              { label: "Pending", value: stats.candPending, accent: stats.candPending > 0, dot: "bg-amber-500", tone: "neutral" as const },
              { label: "Rejected", value: stats.candRejected, accent: false as const, dot: "bg-rose-500", tone: "neutral" as const },
            ]
        ).map((s) => {
          const isAlert = (s as { tone?: string }).tone === "alert";
          const suffix = (s as { suffix?: string }).suffix;
          return (
          <div
            key={s.label}
            className={cn(
              "group relative overflow-hidden rounded-2xl border p-3 shadow-sm transition-all hover:shadow-md sm:p-4",
              isAlert
                ? "border-rose-300/70 bg-rose-50/70 backdrop-blur-md"
                : s.accent
                ? "border-amber-200/60 bg-amber-50/60 backdrop-blur-md"
                : "border-border/60 bg-card/80 backdrop-blur-md",
            )}
          >
            <div className="relative z-10 flex items-start justify-between gap-2">
              <p
                className={cn(
                    "truncate text-[9px] font-bold uppercase tracking-[0.12em] transition-colors sm:text-[10px] sm:tracking-[0.18em]",
                  isAlert
                    ? "text-rose-700"
                    : s.accent
                    ? "text-amber-700"
                    : "text-muted-foreground group-hover:text-amber-600",
                )}
              >
                {s.label}
              </p>
              {(isAlert || (s.accent && s.value > 0)) && (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", isAlert ? "bg-rose-400" : "bg-amber-400")} />
                  <span className={cn("relative inline-flex h-2 w-2 rounded-full", s.dot)} />
                </span>
              )}
            </div>
            <p className="relative z-10 mt-1 text-[20px] font-bold leading-none tabular-nums text-foreground sm:mt-2 sm:text-[24px]">
              {s.value}
              {suffix && <span className="ml-1 text-xs font-medium text-muted-foreground">{suffix}</span>}
            </p>
            {(isAlert || s.accent) && (
              <div className={cn("pointer-events-none absolute -right-4 -bottom-4 h-16 w-16 rounded-full blur-2xl", isAlert ? "bg-rose-200/40" : "bg-amber-200/30")} />
            )}
          </div>

          );
        })}
      </div>


      <Tabs value={tab} onValueChange={(v) => setTab(v as "employee" | "candidate")} className="space-y-4 sm:space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <TabsList className="inline-flex h-auto w-full rounded-xl border border-border/60 bg-secondary/40 p-1 backdrop-blur-sm sm:w-auto">
            {!isFieldOfficer && (
              <TabsTrigger
                value="employee"
                className="flex-1 rounded-lg px-3 py-2 text-xs font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:flex-none sm:px-6 sm:text-sm"
              >
                Employees <span className="ml-1.5 text-xs opacity-60">({stats.empTotal})</span>
              </TabsTrigger>
            )}
            <TabsTrigger
              value="candidate"
              className="flex-1 rounded-lg px-3 py-2 text-xs font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:flex-none sm:px-6 sm:text-sm"
            >
              {isFieldOfficer ? "My Candidates" : "Candidates"} <span className="ml-1.5 text-xs opacity-60">({candidateRows.length})</span>
            </TabsTrigger>
          </TabsList>


          <div className={cn(
            "grid w-full items-center gap-2 md:flex md:w-auto md:gap-3",
            isFieldOfficer ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto_auto]",
          )}>
            <div className="relative flex-1 md:w-80">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, Aadhaar, mobile, code…"
                className="h-10 rounded-xl border-border/70 bg-card pl-11 text-sm shadow-sm focus-visible:ring-4 focus-visible:ring-amber-500/10 focus-visible:border-amber-500/60 sm:h-11"
              />
            </div>
            {isFieldOfficer ? (
              <Button
                className="h-10 whitespace-nowrap rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-none sm:h-11 sm:px-5 sm:text-sm"
                onClick={() => {
                  setEditing(null);
                  setWizardMode("candidate");
                  setOpenWizard(true);
                }}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden min-[360px]:inline">Add Candidate</span>
                <span className="min-[360px]:hidden">Add</span>
              </Button>
            ) : (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={exporting || (tab === "employee" ? employees.length === 0 : candidateRows.length === 0)}
                      className="h-10 whitespace-nowrap rounded-xl border-border/70 bg-card px-3 font-semibold shadow-sm sm:h-11 sm:px-4"
                    >
                      {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                      <span className="hidden sm:inline">Export</span>
                      <ChevronDown className="ml-1.5 h-4 w-4 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Export {tab === "employee" ? "employees" : "candidates"}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleExport("summary-csv")} className="gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">Summary</span>
                        <span className="text-[11px] text-muted-foreground">Visible list columns</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("full-csv")} className="gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-amber-600" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">All details</span>
                        <span className="text-[11px] text-muted-foreground">Every field, flattened</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("full-json")} className="gap-2">
                      <FileJson className="h-4 w-4 text-sky-600" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">All details (JSON)</span>
                        <span className="text-[11px] text-muted-foreground">Full record incl. nested</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setDocsExportOpen(true)} className="gap-2">
                      <FileText className="h-4 w-4 text-violet-600" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">Documents</span>
                        <span className="text-[11px] text-muted-foreground">Aadhaar, PAN & all files as one PDF</span>
                      </div>
                    </DropdownMenuItem>

                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="h-10 whitespace-nowrap rounded-xl bg-primary px-3 font-semibold text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 sm:h-11 sm:px-6"
                    >
                      <Plus className="mr-1.5 h-4 w-4" />
                      <span className="hidden sm:inline">Add Candidate</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Choose type
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setEditing(null);
                        setWizardMode("candidate");
                        setOpenWizard(true);
                      }}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">Billable</span>
                        <span className="text-[11px] text-muted-foreground">Client-facing guards / field staff</span>
                      </div>
                    </DropdownMenuItem>
                    {canAddEmployee && (
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(null);
                          setWizardMode("employee");
                          setOpenWizard(true);
                        }}
                        className="gap-2"
                      >
                        <UserPlus className="h-4 w-4" />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">Non-billable</span>
                          <span className="text-[11px] text-muted-foreground">Internal Radiant employee</span>
                        </div>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}


          </div>
        </div>

        {/* Active / Inactive sub-tabs (Employees tab only) */}
        {tab === "employee" && (
          <div className="flex items-center gap-2">
            <div className="inline-flex h-auto w-full rounded-xl border border-border/60 bg-secondary/40 p-1 backdrop-blur-sm sm:w-auto">
              <button
                type="button"
                onClick={() => setEmpStatusTab("active")}
                className={cn(
                  "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:flex-none sm:px-4",
                  empStatusTab === "active"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Active <span className="ml-1 opacity-60">({stats.empActive})</span>
              </button>
              <button
                type="button"
                onClick={() => setEmpStatusTab("inactive")}
                className={cn(
                  "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:flex-none sm:px-4",
                  empStatusTab === "inactive"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Inactive <span className="ml-1 opacity-60">({stats.empInactive})</span>
              </button>
            </div>
          </div>
        )}

        {/* Filter bar (Employees tab only) */}
        {tab === "employee" && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/60 p-2.5 shadow-sm sm:p-3">

            {filtersVisible.role && (
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All roles</SelectItem>
                  {rolesList.map((r) => (<SelectItem key={r.key} value={r.key} className="text-xs">{r.name}</SelectItem>))}
                </SelectContent>
              </Select>
            )}
            {filtersVisible.designation && (
              <Select value={filterDesignation} onValueChange={setFilterDesignation}>
                <SelectTrigger className="h-9 w-[170px] text-xs"><SelectValue placeholder="Designation" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All designations</SelectItem>
                  {designations.map((d) => (<SelectItem key={d.id} value={d.id} className="text-xs">{d.name}</SelectItem>))}
                </SelectContent>
              </Select>
            )}
            {filtersVisible.customer && (
              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger className="h-9 w-[180px] text-xs"><SelectValue placeholder="Organization" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All organizations</SelectItem>
                  {customers.map((c) => (<SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            )}
            {filtersVisible.unit && (
              <Select value={filterUnit} onValueChange={setFilterUnit}>
                <SelectTrigger className="h-9 w-[180px] text-xs"><SelectValue placeholder="Unit" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All units</SelectItem>
                  {units.map((u) => (<SelectItem key={u.id} value={u.id} className="text-xs">{u.name}</SelectItem>))}
                </SelectContent>
              </Select>
            )}
            {filtersVisible.manager && (
              <Select value={filterManager} onValueChange={setFilterManager}>
                <SelectTrigger className="h-9 w-[180px] text-xs"><SelectValue placeholder="Reports to" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Any manager</SelectItem>
                  {fieldOfficers.map((m) => (<SelectItem key={m.id} value={m.id} className="text-xs">{m.full_name} ({m.employee_code})</SelectItem>))}
                </SelectContent>
              </Select>
            )}
            {filtersVisible.enabled && (
              <Select value={filterEnabled} onValueChange={(v) => setFilterEnabled(v as "all" | "enabled" | "disabled")}>
                <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue placeholder="Active/Inactive" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All employees</SelectItem>
                  <SelectItem value="enabled" className="text-xs">Active only</SelectItem>
                  <SelectItem value="disabled" className="text-xs">Inactive only</SelectItem>
                </SelectContent>
              </Select>
            )}
            {filtersVisible.billable && (
              <Select value={filterBillable} onValueChange={(v) => setFilterBillable(v as "all" | "billable" | "nonbillable")}>
                <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All billing</SelectItem>
                  <SelectItem value="billable" className="text-xs">Billable only</SelectItem>
                  <SelectItem value="nonbillable" className="text-xs">Non-billable only</SelectItem>
                </SelectContent>
              </Select>
            )}
            {filtersVisible.offboardReason && (
              <Select value={filterOffboardReason} onValueChange={setFilterOffboardReason}>
                <SelectTrigger className="h-9 w-[170px] text-xs"><SelectValue placeholder="Any offboarding" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Any offboarding</SelectItem>
                  <SelectItem value="none" className="text-xs">No offboarding</SelectItem>
                  {offboardReasons.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterRole("all"); setFilterDesignation("all"); setFilterCustomer("all");
                setFilterUnit("all"); setFilterManager("all"); setFilterEnabled("all"); setFilterBillable("all"); setFilterOffboardReason("all");
              }}
              className="h-9 text-xs text-muted-foreground"
            >
              Reset
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex rounded-lg border border-border/60 bg-secondary/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs", viewMode === "list" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}
                >
                  <LayoutList className="h-3.5 w-3.5" /> List
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("tree")}
                  className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs", viewMode === "tree" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}
                >
                  <Network className="h-3.5 w-3.5" /> Tree
                </button>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9" title="Configure filters & columns">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 max-h-[70vh] overflow-y-auto">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Show filters</div>
                    {([
                      ["role", "Role"], ["designation", "Designation"], ["customer", "Organization"],
                      ["unit", "Unit"], ["manager", "Reports to"], ["enabled", "Active / Inactive"], ["billable", "Billable"], ["offboardReason", "Offboarding reason"],
                    ] as const).map(([k, label]) => (
                      <label key={k} className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-secondary">
                        <span>{label}</span>
                        <Switch
                          checked={filtersVisible[k]}
                          onCheckedChange={(v) => setFiltersVisible((s) => ({ ...s, [k]: v }))}
                        />
                      </label>
                    ))}
                    <div className="pt-2 mt-2 border-t border-border/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Show columns</div>
                    {([
                      ["mobile", "Mobile"], ["email", "Email"], ["unit", "Unit"], ["designation", "Designation"],
                      ["dob", "Date of Birth"], ["doj", "Date of Joining"], ["role", "Role"], ["active", "Active toggle"],
                    ] as const).map(([k, label]) => (
                      <label key={`col-${k}`} className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-secondary">
                        <span>{label}</span>
                        <Switch
                          checked={columnsVisible[k]}
                          onCheckedChange={(v) => setColumnsVisible((s) => ({ ...s, [k]: v }))}
                        />
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}

        <TabsContent value="employee" className="mt-0">
          {viewMode === "tree" ? (
            <ManagerTree
              employees={employees}
              fieldOfficers={fieldOfficers}
              scopeByCandidate={scopeByCandidate}
              unitMap={unitMap}
            />
          ) : (
            renderTable(employees, "employee")
          )}
        </TabsContent>
        <TabsContent value="candidate" className="mt-0">
          <div className="mb-4">
            <RehireApprovalsCard onReview={(request) => setRehireReviewTarget(request)} />
          </div>
          {renderTable(candidateRows, "candidate")}
        </TabsContent>
      </Tabs>

      <CandidateWizard
        open={openWizard}
        onOpenChange={(v) => {
          setOpenWizard(v);
          if (!v) setEditing(null);
        }}
        editing={editing}
        mode={wizardMode}
        units={scopedUnitsForWizard}
        unitsLoading={unitsQuery.isLoading || scopeStillLoading}
        unitsError={
          unitsQuery.error instanceof Error
            ? unitsQuery.error.message
            : isFieldOfficer && !scopeStillLoading && scopedUnitsForWizard.length === 0
              ? "You have no units assigned. Ask your admin to assign a branch or unit before onboarding."
              : null
        }
        designations={designations}
        designationsLoading={designationsQuery.isLoading}
        designationsError={designationsQuery.error instanceof Error ? designationsQuery.error.message : null}
        exServices={exServices}
        languagesList={languagesList}
        esicBranches={esicBranches}
        offboardReasons={offboardReasons}
        assets={assets}
        canReview={!!editing && editing.status === "pending" && canApproveOnboarding}
        isApproving={approveMut.isPending}
        onApprove={() => {
          if (!editing) return;
          approveMut.mutate(editing as unknown as CandidateListItem, {
            onSuccess: () => {
              setOpenWizard(false);
              setEditing(null);
            },
          });
        }}
        onReject={() => {
          if (!editing) return;
          setRejectTarget(editing as unknown as CandidateListItem);
          setRejectReason("");
          setOpenWizard(false);
        }}
        onRequestOffboard={() => {
          if (!editing) return;
          setOffboardTarget(editing as unknown as CandidateListItem);
          setOffboardReasonId("");
          setOpenWizard(false);
        }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete candidate?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {confirmDelete?.full_name || "this candidate"} from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) deleteMut.mutate(confirmDelete);
                setConfirmDelete(null);
              }}
              className="bg-rose-500 hover:bg-rose-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Offboarding workflow */}
      <OffboardingDialog
        target={offboardTarget}
        reasons={offboardReasons}
        reasonsLoading={offboardReasonsQuery.isLoading}
        assets={assets}
        initialReasonId={offboardReasonId}
        isSubmitting={offboardMut.isPending}
        currentUserCandidateId={currentCandidateId}
        isFieldOfficer={isFieldOfficer}
        onClose={() => { setOffboardTarget(null); setOffboardReasonId(""); }}
        onSubmit={({ reasonId, details, noHire }) => {
          if (!offboardTarget) return;
          const reason = offboardReasons.find((r) => r.id === reasonId);
          offboardMut.mutate({
            candidate: offboardTarget,
            reasonId,
            reasonName: reason?.name ?? "",
            details,
            noHire,
          });
        }}
      />

      {/* Reactivation chooser: reuse the archived record vs create a fresh one */}
      <Dialog open={!!reactivateTarget} onOpenChange={(o) => !o && setReactivateTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reactivate {reactivateTarget?.full_name || reactivateTarget?.employee_code}?</DialogTitle>
            <DialogDescription>
              This employee was previously offboarded ({reactivateTarget?.employee_code}). Choose how to bring them back.
              {!(isSuperAdmin || ["admin", "super_admin", "hr", "leadership"].includes(roleKey ?? "")) && (
                <span className="mt-2 block text-xs">Your request will be sent to HR / Admin for approval before the employee becomes active.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <button
              type="button"
              data-force-enabled="true"
              disabled={reactivateMut.isPending}
              style={{ pointerEvents: reactivateMut.isPending ? "none" : "auto", opacity: reactivateMut.isPending ? 0.5 : 1 }}
              className="rounded-lg border-2 border-border bg-background p-3 text-left transition hover:border-primary hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed"
              onClick={() => {
                if (!reactivateTarget) return;
                const target = reactivateTarget;
                setReactivateTarget(null);
                reactivateMut.mutate({ candidate: target, mode: "new" });
              }}
            >
              <div className="font-semibold text-foreground">1. Create a new employee record</div>
              <div className="mt-1 text-xs text-muted-foreground">
                A brand-new employee ID will be generated. All KYC/documents are copied over; the original record ({reactivateTarget?.employee_code || "—"}) stays archived for audit.
              </div>
            </button>
            <button
              type="button"
              data-force-enabled="true"
              disabled={reactivateMut.isPending}
              style={{ pointerEvents: reactivateMut.isPending ? "none" : "auto", opacity: reactivateMut.isPending ? 0.5 : 1 }}
              className="rounded-lg border-2 border-border bg-background p-3 text-left transition hover:border-primary hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed"
              onClick={() => {
                if (!reactivateTarget) return;
                const target = reactivateTarget;
                setReactivateTarget(null);
                reactivateMut.mutate({ candidate: target, mode: "reuse" });
              }}
            >
              <div className="font-semibold text-foreground">2. Reactivate the same record</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Keeps the existing employee ID <span className="font-mono">{reactivateTarget?.employee_code || "—"}</span>. Reactivates the same profile while retaining offboarding history.
              </div>
            </button>


          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReactivateTarget(null)} disabled={reactivateMut.isPending}>Cancel</Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      <Dialog open={!!approvePreview} onOpenChange={(o) => { if (!o) setApprovePreview(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review candidate before approval</DialogTitle>
            <DialogDescription>
              Confirm the details below. Approving assigns an Employee ID and activates access.
            </DialogDescription>
          </DialogHeader>
          {approvePreview && (() => {
            const c = approvePreview;
            const roleName = rolesList.find((r) => r.key === c.role_key)?.name ?? c.role_key ?? "—";
            const unit = units.find((u) => u.id === c.unit_id);
            const unitLabel = unit ? `${unit.customer_name ? unit.customer_name + " — " : ""}${unit.name}${unit.code ? ` (${unit.code})` : ""}` : "—";
            const desig = designations.find((d) => d.id === c.designation_id);
            const desigLabel = desig ? `${desig.name}${desig.billable ? "" : " · Non-billable"}` : "—";
            const aad = c.aadhaar_number ? `•••• •••• ${String(c.aadhaar_number).slice(-4)}` : "—";
            const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
              <div className="flex items-start justify-between gap-3 py-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</span>
                <span className="text-right text-sm font-medium text-foreground">{v || "—"}</span>
              </div>
            );
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/40 p-3">
                  {c.photo_url ? (
                    <img src={c.photo_url} alt={c.full_name ?? ""} className="h-14 w-14 rounded-full object-cover ring-2 ring-border" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                      {(c.full_name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-display text-base font-semibold text-foreground">{c.full_name || "Unnamed"}</div>
                    <div className="text-[11px] font-mono text-muted-foreground">{c.candidate_code ?? "—"}</div>
                  </div>
                </div>
                <div className="divide-y divide-border/50 rounded-xl border border-border/60 px-3">
                  <Row k="Role" v={roleName} />
                  <Row k="Designation" v={desigLabel} />
                  <Row k="Unit" v={unitLabel} />
                  <Row k="Mobile" v={c.mobile ?? "—"} />
                  <Row k="Email" v={c.email ?? "—"} />
                  <Row k="Aadhaar" v={aad} />
                  <Row k="DOB" v={fmtDate(c.date_of_birth)} />
                  <Row k="Joining date" v={fmtDate(c.preferred_joining_date)} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Need to change something? Cancel and open the candidate to edit, or reject with a reason for the field officer.
                </p>
              </div>
            );
          })()}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setApprovePreview(null)} disabled={approveMut.isPending}>
              Cancel
            </Button>
            <Button
              variant="outline"
              className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              data-force-enabled="true"
              onClick={() => {
                const c = approvePreview;
                if (!c) return;
                setApprovePreview(null);
                setRejectTarget(c);
                setRejectReason("");
              }}
              disabled={approveMut.isPending}
            >
              <X className="mr-1 h-4 w-4" /> Reject
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              data-force-enabled="true"
              onClick={() => {
                const c = approvePreview;
                if (!c) return;
                approveMut.mutate(c, { onSuccess: () => setApprovePreview(null) });
              }}
              disabled={approveMut.isPending}
            >
              {approveMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              Confirm approval
            </Button>

          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => {
          if (!o) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject candidate</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting {rejectTarget?.full_name || "this candidate"}. They will see this note.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Rejection reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Aadhaar details could not be verified…"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Explain what needs to be corrected so the field officer can fix it (min 5 characters).
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!rejectTarget) return;
                if (rejectReason.trim().length < 5) {
                  toast.error("Please enter a rejection reason (min 5 characters)");
                  return;
                }
                rejectMut.mutate({ c: rejectTarget, reason: rejectReason.trim() });
              }}
              disabled={rejectMut.isPending || rejectReason.trim().length < 5}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {rejectMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <X className="mr-1 h-4 w-4" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SignDocumentDialog
        open={!!signTarget}
        onOpenChange={(o) => !o && setSignTarget(null)}
        candidateId={signTarget?.id ?? null}
        docType={signTarget?.docType ?? "nda"}
      />

      <EmployeeDocumentsExportDialog
        open={docsExportOpen}
        onOpenChange={setDocsExportOpen}
        people={candidates
          .filter((c) =>
            tab === "employee" ? isEmployeeStatus(c.status) && !supersededEmployeeIds.has(c.id) : !isEmployeeStatus(c.status),
          )
          .filter((c) => (isFieldOfficer ? !!c.unit_id && scopedUnitIdSet.has(c.unit_id) : true))
          .map((c) => ({
            id: c.id,
            full_name: c.full_name,
            employee_code: c.employee_code,
            candidate_code: c.candidate_code,
            mobile: c.mobile,
            role_key: c.role_key,
            designation_id: c.designation_id,
            unit_id: c.unit_id,
            reports_to: c.reports_to,
            status: c.status,
            is_enabled: c.is_enabled,
          }))}
        roles={rolesList.map((r) => ({ value: r.key, label: r.name }))}
        designations={designations.map((d) => ({ value: d.id, label: d.name }))}
        organizations={customers.map((c) => ({ value: c.id, label: c.name }))}
        units={units.map((u) => ({ value: u.id, label: `${u.code} — ${u.name}`, customerId: u.customer_id }))}
        managers={candidates
          .filter((c) => candidates.some((x) => x.reports_to === c.id))
          .map((c) => ({ value: c.id, label: `${c.full_name ?? "—"}${c.employee_code ? ` · ${c.employee_code}` : ""}` }))}
        organizationOfUnit={(unitId) => (unitId ? unitMap.get(unitId)?.customer_id ?? "" : "")}
        labelFor={(p) => ({
          role: roleNameOf(p.role_key),
          designation: desigName(p.designation_id),
          organization: customerNameOfUnit(p.unit_id),
          unit: unitLabel(p.unit_id),
          manager: managerName(p.reports_to),
        })}
        onExported={(count) => {
          void logActivity({
            module: "Employees",
            action: "export",
            entityType: "candidate",
            entityLabel: `${count} employee document pack (PDF)`,
          });
        }}
      />

      <ScopeAddDialog

        target={scopeTarget}
        onClose={() => setScopeTarget(null)}
        customers={customers}
        branches={branches}
        states={states}
        units={units}
        existing={scopeTarget ? scopeByCandidate.get(scopeTarget.id) ?? [] : []}
        onAdd={(payload) => {
          if (!scopeTarget) return;
          addScopeMut.mutate({ candidate: scopeTarget, ...payload });
        }}
      />
    </div>
  );
}

function ManagerTree({
  employees,
  fieldOfficers,
  scopeByCandidate,
  unitMap,
}: {
  employees: CandidateListItem[];
  fieldOfficers: CandidateListItem[];
  scopeByCandidate: Map<string, ScopeAssignment[]>;
  unitMap: Map<string, UnitLite>;
}) {
  const guards = employees.filter((e) => e.role_key === "guard");
  const others = employees.filter((e) => e.role_key !== "guard" && e.role_key !== "field_officer");
  const guardsByMgr = new Map<string, CandidateListItem[]>();
  const unassigned: CandidateListItem[] = [];
  for (const g of guards) {
    if (g.reports_to) {
      if (!guardsByMgr.has(g.reports_to)) guardsByMgr.set(g.reports_to, []);
      guardsByMgr.get(g.reports_to)!.push(g);
    } else unassigned.push(g);
  }
  return (
    <div className="space-y-4">
      {fieldOfficers.length === 0 && (
        <div className="rounded-2xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
          No field officers yet. Assign the Field Officer role to an employee to build the tree.
        </div>
      )}
      {fieldOfficers.map((fm) => {
        const team = guardsByMgr.get(fm.id) ?? [];
        const scopes = scopeByCandidate.get(fm.id) ?? [];
        return (
          <div key={fm.id} className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Network className="h-4 w-4 text-sky-600" />
              <div className="flex-1">
                <div className="font-semibold">{fm.full_name} <span className="ml-1 text-xs font-mono text-muted-foreground">{fm.employee_code}</span></div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {scopes.length === 0 && <span className="text-xs text-muted-foreground">No scope assigned</span>}
                  {scopes.map((s) => (
                    <Badge key={s.id} variant="outline" className="text-[10px]">{SCOPE_TYPE_LABEL[s.scope_type]}: {s.scope_label}</Badge>
                  ))}
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">{team.length} guard{team.length === 1 ? "" : "s"}</Badge>
            </div>
            {team.length > 0 && (
              <div className="mt-3 space-y-1.5 border-l-2 border-sky-200 pl-4">
                {team.map((g) => {
                  const u = g.unit_id ? unitMap.get(g.unit_id) : undefined;
                  return (
                    <div key={g.id} className="flex items-center gap-2 text-sm">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-mono text-[10px] text-muted-foreground">{g.employee_code}</span>
                      <span className="font-medium">{g.full_name}</span>
                      {u && <span className="text-xs text-muted-foreground">· {u.name}</span>}
                      {!g.is_enabled && <Badge variant="outline" className="ml-1 text-[10px]">Disabled</Badge>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {unassigned.length > 0 && (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/60 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unassigned guards ({unassigned.length})</div>
          {unassigned.map((g) => (
            <div key={g.id} className="flex items-center gap-2 text-sm">
              <span className="font-mono text-[10px] text-muted-foreground">{g.employee_code}</span>
              <span>{g.full_name}</span>
            </div>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {others.length} other employee{others.length === 1 ? "" : "s"} not shown in the manager tree.
        </div>
      )}
    </div>
  );
}

function ScopeAddDialog({
  target,
  onClose,
  customers,
  branches,
  states,
  units,
  existing,
  onAdd,
}: {
  target: CandidateListItem | null;
  onClose: () => void;
  customers: Array<{ id: string; name: string }>;
  branches: Array<{ id: string; code: string }>;
  states: Array<{ id: string; name: string }>;
  units: UnitLite[];
  existing: ScopeAssignment[];
  onAdd: (payload: { scope_type: ScopeType; scope_id: string; scope_label: string }) => void;
}) {
  const [scopeType, setScopeType] = useState<ScopeType>("unit");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (target) { setScopeType("unit"); setSelectedIds(new Set()); setSearch(""); }
  }, [target]);
  useEffect(() => { setSelectedIds(new Set()); setSearch(""); }, [scopeType]);
  const allOptions: Array<{ id: string; label: string }> = useMemo(() => {
    if (scopeType === "unit") return units.map((u) => ({ id: u.id, label: `${u.name}${u.customer_name ? " · " + u.customer_name : ""}` }));
    if (scopeType === "customer") return customers.map((c) => ({ id: c.id, label: c.name }));
    if (scopeType === "branch") return branches.map((b) => ({ id: b.id, label: b.code }));
    return states.map((s) => ({ id: s.name, label: s.name }));
  }, [scopeType, units, customers, branches, states]);
  const existingIds = useMemo(
    () => new Set(existing.filter((e) => e.scope_type === scopeType).map((e) => e.scope_id)),
    [existing, scopeType],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [allOptions, search]);
  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectableFiltered = filtered.filter((o) => !existingIds.has(o.id));
  const allFilteredSelected = selectableFiltered.length > 0 && selectableFiltered.every((o) => selectedIds.has(o.id));
  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) selectableFiltered.forEach((o) => next.delete(o.id));
      else selectableFiltered.forEach((o) => next.add(o.id));
      return next;
    });
  };
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Map scope · {target?.full_name}</DialogTitle>
          <DialogDescription>Pick a scope type, then select one or more entries. Guards in the chosen scope get linked automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1 rounded-lg border border-border/60 bg-muted/40 p-1">
            {(["state","customer","branch","unit"] as ScopeType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setScopeType(t)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs font-medium transition",
                  scopeType === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {SCOPE_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${SCOPE_TYPE_LABEL[scopeType].toLowerCase()}…`} className="h-9 pl-8" />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{selectedIds.size} selected · {selectableFiltered.length} available</span>
            <button type="button" onClick={toggleAll} disabled={selectableFiltered.length === 0} className="text-primary hover:underline disabled:opacity-40">
              {allFilteredSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
            {filtered.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">No {SCOPE_TYPE_LABEL[scopeType].toLowerCase()} found.</div>
            )}
            {filtered.map((o) => {
              const already = existingIds.has(o.id);
              const checked = selectedIds.has(o.id);
              return (
                <label
                  key={o.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm transition",
                    already ? "bg-muted/40 cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/40",
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary"
                    disabled={already}
                    checked={already || checked}
                    onChange={() => !already && toggleId(o.id)}
                  />
                  <span className="flex-1 truncate">{o.label}</span>
                  {already && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Mapped</span>}
                </label>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={selectedIds.size === 0}
            onClick={async () => {
              const picks = Array.from(selectedIds)
                .map((id) => allOptions.find((o) => o.id === id))
                .filter((o): o is { id: string; label: string } => !!o);
              if (picks.length === 0) return;
              const ok = await confirmAction({
                title: `Map ${picks.length} ${SCOPE_TYPE_LABEL[scopeType].toLowerCase()}${picks.length === 1 ? "" : "s"}?`,
                description: `Assign ${picks.map((p) => `"${p.label}"`).join(", ")} to ${target?.full_name}.`,
                confirmText: "Map",
              });
              if (!ok) return;
              for (const p of picks) {
                onAdd({ scope_type: scopeType, scope_id: p.id, scope_label: p.label });
              }
              onClose();
            }}
          >
            Map {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-slate-500/15 text-slate-600",
    approved: "bg-emerald-500/15 text-emerald-600",
    active: "bg-emerald-500/15 text-emerald-600",
    inactive: "bg-slate-500/15 text-slate-600",
    pending: "bg-amber-500/15 text-amber-600",
    rejected: "bg-rose-500/15 text-rose-600",
  };
  const label = status === "approved" ? "active" : status;
  return <Badge className={cn("inline-flex shrink-0 border-0 font-semibold capitalize whitespace-nowrap", map[status] ?? "bg-secondary text-foreground")}>{label}</Badge>;
}

function maskAadhaar(n: string) {
  const d = (n ?? "").replace(/\D/g, "");
  if (d.length < 4) return d || "—";
  return `XXXX XXXX ${d.slice(-4)}`;
}

// ---------------- Wizard ---------------- //
type WizardStep = "aadhaar" | "otp" | "form";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

type CandidateForm = Omit<Candidate, "id"> & {
  /** All units assigned to this candidate. First entry is the primary unit (mirrored to candidates.unit_id). */
  unit_ids: string[];
  /** Primary reporting manager (mirrored to candidates.reports_to). */
  reports_to?: string | null;
};

function emptyForm(): CandidateForm {
  return {
    candidate_code: "",
    employee_code: "",
    rejection_reason: "",
    aadhaar_number: "",
    full_name: "",
    photo_url: "",
    aadhaar_image_url: "",
    signature_url: "",
    date_of_birth: null,
    gender: "",
    religion: "",
    caste_category: "",
    marital_status: "",
    birthplace: "",
    mobile: "",
    alt_mobile: "",
    email: "",
    permanent_address1: "",
    permanent_address2: "",
    permanent_landmark: "",
    permanent_pincode: "",
    permanent_city: "",
    permanent_district: "",
    permanent_state: "",
    permanent_country: "India",
    permanent_police_station: "",
    present_address1: "",
    present_address2: "",
    present_landmark: "",
    present_pincode: "",
    present_city: "",
    present_district: "",
    present_state: "",
    present_country: "India",
    present_police_station: "",
    same_as_permanent: true,
    pan_number: "",
    pan_image_url: "",
    bank_account_holder: "",
    bank_account_number: "",
    bank_ifsc: "",
    bank_name: "",
    bank_branch: "",
    bank_account_type: "",
    emergency_contact_name: "",
    emergency_contact_relation: "",
    emergency_contact_mobile: "",
    contacts: [],
    references: [],
    is_ex_service: false,
    ex_service_id: null,
    languages: [],
    experiences: [],
    educations: [],
    application_date: new Date().toISOString().slice(0, 10),
    preferred_joining_date: null,
    unit_id: null,
    unit_ids: [],
    designation_id: null,
    status: "pending",
    physical_health: {},
    compliance: {},
    identification_proofs: [],
    criminal_history: { has_history: false, incidents: [] },
    extra_curricular: [],
    other_info: {},
    documents: [],
    nominations: [],
    kyc_completed: false,
    assigned_asset_ids: [],
    no_hire: false,
    offboarding_details: {},
  };
}

const RADIANT_BILLING_UNIT_ID = "92541381-14d3-4be6-ae8c-078b79c2e0f1";
const DEFAULT_HOME_BRANCH_ID = "8897587c-e532-47ad-af01-353409cc6b23"; // PUNE — Radiant HQ branch

function CandidateWizard({
  open,
  onOpenChange,
  editing,
  mode = "candidate",
  units,
  unitsLoading,
  unitsError,
  designations,
  designationsLoading,
  designationsError,
  exServices,
  languagesList,
  esicBranches,
  offboardReasons = [],
  assets = [],
  canReview = false,
  isApproving = false,
  onApprove,
  onReject,
  onRequestOffboard,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Candidate | null;
  mode?: "candidate" | "employee";
  units: UnitLite[];
  unitsLoading: boolean;
  unitsError: string | null;
  designations: DesignationLite[];
  designationsLoading: boolean;
  designationsError: string | null;
  exServices: ExServiceLite[];
  languagesList: LanguageLite[];
  esicBranches: EsicBranchLite[];
  offboardReasons?: { id: string; name: string }[];
  assets?: { id: string; name: string; category: string; available_qty?: number }[];
  canReview?: boolean;
  isApproving?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onRequestOffboard?: () => void;
}) {
  const isEmployeeMode = mode === "employee" || (!!editing && (editing as any).billable === false);
  const qc = useQueryClient();
  const extractFn = useServerFn(extractAadhaar);
  const { branches } = useBranches();
  const [form, setForm] = useState<CandidateForm>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [saveError, setSaveError] = useState<{ title: string; detail?: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  // Aadhaar is the unique person key — a hit here means this person already
  // exists and must go through the configurable rehire approval chain.
  const [aadhaarChecking, setAadhaarChecking] = useState(false);
  const [rehireOpen, setRehireOpen] = useState(false);
  const [rehireMatch, setRehireMatch] = useState<ExistingCandidateMatch | null>(null);
  const lastAadhaarLookupRef = useRef("");
  const checkAadhaarForRehire = async (value: string) => {
    const clean = (value ?? "").replace(/\D/g, "");
    if (clean.length !== 12) return;
    if (editing && (editing as any).aadhaar_number === clean) return;
    if (lastAadhaarLookupRef.current === clean) return;
    lastAadhaarLookupRef.current = clean;
    setAadhaarChecking(true);
    try {
      const found = await findCandidateByAadhaar(clean);
      if (!found || (editing && found.id === editing.id)) {
        setRehireMatch(null);
        return;
      }
      setRehireMatch(found as ExistingCandidateMatch);
      setRehireOpen(true);
    } catch (e) {
      console.error("aadhaar duplicate check failed", e);
      lastAadhaarLookupRef.current = "";
      toast.error("Could not check Aadhaar against existing records. Please retry.");
    } finally {
      setAadhaarChecking(false);
    }
  };

  const [initialUnitIds, setInitialUnitIds] = useState<string[]>([]);
  const [homeBranchId, setHomeBranchId] = useState<string>(DEFAULT_HOME_BRANCH_ID);
  const isEditingEmployeeProfile =
    !!editing && (editing.status === "approved" || editing.status === "active" || editing.status === "inactive");

  useEffect(() => {
    if (!open) return;
    setSaveError(null);
    lastAadhaarLookupRef.current = "";
    setRehireMatch(null);
    setRehireOpen(false);
    if (editing) {
      const { id: _id, ...rest } = editing;
      void _id;
      const restAny = rest as unknown as Partial<CandidateForm> & { contacts?: CandidateContact[] };
      const existing = Array.isArray(restAny.contacts) ? restAny.contacts : [];
      let contacts = existing;
      if (contacts.length === 0 && (rest.emergency_contact_name || rest.emergency_contact_mobile)) {
        contacts = [{
          name: rest.emergency_contact_name || "",
          relation: rest.emergency_contact_relation || "",
          mobile: rest.emergency_contact_mobile || "",
          is_emergency: true,
        }];
      }
      // Optimistically seed with the single mirrored unit_id so the picker isn't empty during fetch.
      const initialUnitIds = rest.unit_id ? [rest.unit_id] : [];
      const normalizedStatus = rest.status === "approved" ? "active" : rest.status;
      setInitialUnitIds(initialUnitIds);
      setForm({ ...(rest as CandidateForm), status: normalizedStatus, contacts, unit_ids: initialUnitIds });
      // Load full multi-unit assignment from junction table.
      (async () => {
        const { data, error } = await supabase
          .from("candidate_units" as never)
          .select("unit_id,is_primary,sort_order")
          .eq("candidate_id", editing.id)
          .order("is_primary", { ascending: false })
          .order("sort_order", { ascending: true });
        if (error) return;
        const rows = (data ?? []) as { unit_id: string; is_primary: boolean; sort_order: number }[];
        if (rows.length === 0) return;
        const ids = rows.map((r) => r.unit_id);
        setInitialUnitIds(ids);
        setForm((f) => ({ ...f, unit_ids: ids, unit_id: ids[0] ?? null }));
      })();
    } else {
      setInitialUnitIds([]);
      setForm(emptyForm());
      setHomeBranchId(DEFAULT_HOME_BRANCH_ID);
    }
  }, [open, editing, isEmployeeMode]);

  // Load existing Home Branch (employee_scope_assignments · scope_type='branch') for edit mode.
  useEffect(() => {
    if (!open || !editing) return;
    (async () => {
      const { data, error } = await supabase
        .from("employee_scope_assignments" as never)
        .select("scope_id")
        .eq("candidate_id", editing.id)
        .eq("scope_type", "branch")
        .limit(1)
        .maybeSingle();
      if (error || !data) return;
      const sid = (data as { scope_id?: string }).scope_id;
      if (sid) setHomeBranchId(sid);
    })();
  }, [open, editing]);

  const set = <K extends keyof CandidateForm>(k: K, v: CandidateForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const setAny = (k: string, v: any) =>
    setForm((f) => ({ ...f, [k]: v }) as CandidateForm);
  const setSection = (k: string, v: any) =>
    setForm((f) => ({ ...f, [k]: { ...((f as any)[k] ?? {}), ...v } }) as CandidateForm);

  const primaryUnitId = form.unit_ids[0] ?? null;
  const unit = primaryUnitId ? units.find((u) => u.id === primaryUnitId) : undefined;

  // Restrict the Designation dropdown to designations present in the contracts
  // of the selected units. Field officer or not — a unit's contract resources
  // define the valid designations for that unit.
  const desigLookupUnitIds = useMemo(() => {
    const ids = new Set(form.unit_ids);
    if (isEmployeeMode) ids.add(RADIANT_BILLING_UNIT_ID);
    return Array.from(ids);
  }, [form.unit_ids, isEmployeeMode]);
  const selectedUnitIdsKey = desigLookupUnitIds.slice().sort().join(",");
  const contractDesigQuery = useQuery({
    queryKey: ["wizard-contract-designations", selectedUnitIdsKey],
    enabled: desigLookupUnitIds.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      const { data: contracts, error: cErr } = await supabase
        .from("client_contracts" as never)
        .select("id,unit_id,status")
        .in("unit_id", desigLookupUnitIds)
        .eq("status", "active");
      if (cErr) throw cErr;
      const contractIds = ((contracts ?? []) as { id: string }[]).map((c) => c.id);
      if (contractIds.length === 0) return [];
      const { data: res, error: rErr } = await supabase
        .from("contract_resources" as never)
        .select("designation_id")
        .in("contract_id", contractIds);
      if (rErr) throw rErr;
      const ids = Array.from(
        new Set(
          ((res ?? []) as { designation_id: string | null }[])
            .map((r) => r.designation_id)
            .filter((x): x is string => !!x),
        ),
      );
      return ids;
    },
  });
  const allowedDesignationIds = contractDesigQuery.data ?? [];
  const filteredDesignations = useMemo(() => {
    let base = designations;
    if (isEmployeeMode) base = base.filter((d) => d.billable === false);
    if (desigLookupUnitIds.length === 0) return base;
    if (contractDesigQuery.isLoading) return base;
    const allow = new Set(allowedDesignationIds);
    return base.filter((d) => allow.has(d.id));
  }, [designations, desigLookupUnitIds.length, contractDesigQuery.isLoading, allowedDesignationIds, isEmployeeMode]);

  // If the currently selected designation is no longer allowed by the units'
  // contracts, clear it so the user picks a valid one.
  useEffect(() => {
    if (form.unit_ids.length === 0) return;
    if (contractDesigQuery.isLoading) return;
    if (!form.designation_id) return;
    if (!allowedDesignationIds.includes(form.designation_id)) {
      setForm((f) => ({ ...f, designation_id: null }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnitIdsKey, contractDesigQuery.isLoading, allowedDesignationIds.join(",")]);


  // ----- File upload helper ----- //
  const uploadFile = async (file: File, slot: "photo" | "signature" | "aadhaar" | "pan"): Promise<string> => {
    const ext = file.name.split(".").pop() || "png";
    const path = `${slot}/${form.aadhaar_number || "NEW"}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("candidate-files")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    // Bucket is private — generate a long-lived signed URL (≈10 years)
    const { data: signed, error: signErr } = await supabase.storage
      .from("candidate-files")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (signErr) throw signErr;
    return signed.signedUrl;
  };

  const handleFile = async (file: File | null, slot: "photo" | "signature" | "aadhaar" | "pan") => {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (slot === "photo" && !isImage) {
      toast.error("Photograph must be an image");
      return;
    }
    if ((slot === "aadhaar" || slot === "signature" || slot === "pan") && !isImage && !isPdf) {
      toast.error("Only image or PDF files are allowed");
      return;
    }
    setUploading(slot);
    try {
      const uploadPromise = uploadFile(file, slot);
      if (slot === "photo" || slot === "signature" || slot === "pan") {
        const url = await uploadPromise;
        if (slot === "photo") set("photo_url", url);
        else if (slot === "signature") set("signature_url", url);
        else set("pan_image_url", url);
        toast.success(`${slot[0].toUpperCase() + slot.slice(1)} uploaded`);
        return;
      }

      if (slot === "aadhaar") {
        const clientOcr = await getAadhaarOcrClient();
        setScanning(true);
        try {
          // Read file as data URL. For PDFs we also rasterize pages so the AI
          // gets actual image content (UIDAI PDFs use scrambled fonts).
          const pageImageDataUrlsPromise = isPdf
            ? clientOcr.renderPdfPagesAsDataUrls(file).catch(() => [])
            : Promise.resolve<string[]>([]);

          const [uploadedUrl, pageImageDataUrls] = await Promise.all([
            uploadPromise,
            pageImageDataUrlsPromise,
          ]);
          set("aadhaar_image_url", uploadedUrl);
          toast.success("Aadhaar uploaded — scanning…");

          let extraction: AadhaarExtraction;
          try {
            extraction = await withTimeout(
              extractFn({
                data: {
                  fileUrl: uploadedUrl,
                  mimeType: file.type || (isPdf ? "application/pdf" : "image/jpeg"),
                  pageImageDataUrls,
                },
              }) as Promise<AadhaarExtraction>,
              45_000,
              "Aadhaar scan timed out — please try again or fill the form manually",
            );
          } catch (serverScanError) {
            console.warn("Server Aadhaar scan failed, falling back to client OCR", serverScanError);
            extraction = await withTimeout(
              clientOcr.extractAadhaarClient(file),
              45_000,
              "Aadhaar scan timed out — please try again or fill the form manually",
            );
            toast.warning("Server scan unavailable — used local OCR fallback. Please review the extracted fields.");
          }

          // If the user already typed an Aadhaar number and the AI couldn't read one, keep theirs.
          const finalExtraction: AadhaarExtraction =
            form.aadhaar_number && !/^\d{12}$/.test(extraction.aadhaar_number)
              ? { ...extraction, aadhaar_number: form.aadhaar_number }
              : extraction;

          applyExtraction(finalExtraction);
          const extractedAadhaar = (finalExtraction.aadhaar_number || "").replace(/\D/g, "");
          if (extractedAadhaar.length === 12) void checkAadhaarForRehire(extractedAadhaar);
          const filled = clientOcr.countExtractedFields(finalExtraction);
          if (filled === 0) {
            toast.warning("Scan complete but no fields could be read. Please fill manually or upload a clearer scan.");
          } else if (filled >= 8) {
            toast.success(`Aadhaar scanned — ${filled} field(s) auto-filled. Please review.`);
          } else {
            toast.success(`Aadhaar scanned — ${filled} field(s) auto-filled. Please review and complete the rest.`);
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Aadhaar scan failed");
        } finally {
          setScanning(false);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const applyExtraction = (x: AadhaarExtraction) => {
    const cleanValue = (incoming: string) => incoming?.trim() ?? "";
    const looksSuspicious = (value: string) => {
      const next = cleanValue(value);
      if (!next) return false;
      return /[`~^*_={}|<>]/.test(next) || /[;:]{2,}/.test(next) || /\b[il1|]\s*[;:=]\s*/i.test(next);
    };
    const looksUseful = (value: string, kind: "name" | "address" | "place" | "pin" | "aadhaar" | "gender") => {
      const next = cleanValue(value);
      if (!next) return false;
      if ((kind === "name" || kind === "address" || kind === "place") && looksSuspicious(next)) return false;
      switch (kind) {
        case "name": {
          if (!/^[A-Za-z][A-Za-z .'-]{1,79}$/.test(next)) return false;
          const parts = next.match(/[A-Za-z]+/g) ?? [];
          const meaningfulParts = parts.filter((part) => part.length >= 2);
          const longestPart = meaningfulParts.reduce((max, part) => Math.max(max, part.length), 0);
          return parts.join("").length >= 4 && (meaningfulParts.length >= 2 || longestPart >= 4);
        }
        case "address":
          return /[A-Za-z]{3,}/.test(next) && !/[`~^*_={}|<>]{2,}/.test(next);
        case "place":
          return /^[A-Za-z][A-Za-z .'-]{1,79}$/.test(next);
        case "pin":
          return /^\d{6}$/.test(next);
        case "aadhaar":
          return /^\d{12}$/.test(next);
        case "gender":
          return /^(male|female|other)$/i.test(next);
        default:
          return false;
      }
    };
    const pick = (incoming: string, current: string, kind: Parameters<typeof looksUseful>[1]) => {
      const next = cleanValue(incoming);
      return looksUseful(next, kind) ? next : current;
    };
    setForm((f) => {
      const resolvedName = pick(x.full_name, f.full_name, "name");
      const next: CandidateForm = {
        ...f,
        full_name: resolvedName,
        date_of_birth: /^\d{4}-\d{2}-\d{2}$/.test(x.date_of_birth) ? x.date_of_birth : f.date_of_birth,
        gender: looksUseful(x.gender, "gender") ? toTitle(x.gender) : f.gender,
        aadhaar_number: pick(x.aadhaar_number, f.aadhaar_number, "aadhaar"),
        birthplace: pick(x.birthplace, f.birthplace, "place"),
        permanent_address1: pick(x.address_line1, f.permanent_address1, "address"),
        permanent_address2: pick(x.address_line2, f.permanent_address2, "address"),
        permanent_landmark: pick(x.landmark, f.permanent_landmark, "address"),
        permanent_pincode: pick(x.pincode, f.permanent_pincode, "pin"),
        permanent_city: pick(x.city, f.permanent_city, "place"),
        permanent_district: pick(x.district, f.permanent_district, "place"),
        permanent_state: pick(x.state, f.permanent_state, "place"),
        permanent_country: cleanValue(x.country) || f.permanent_country || "India",
      };
      if (next.same_as_permanent) {
        next.present_address1 = next.permanent_address1;
        next.present_address2 = next.permanent_address2;
        next.present_landmark = next.permanent_landmark;
        next.present_pincode = next.permanent_pincode;
        next.present_city = next.permanent_city;
        next.present_district = next.permanent_district;
        next.present_state = next.permanent_state;
        next.present_country = next.permanent_country;
        next.present_police_station = next.permanent_police_station;
      }
      return next;
    });
  };

  // ----- Profile completion meter ----- //
  const completionChecks: Array<{ key: string; ok: boolean }> = [
    { key: "Photograph", ok: !!form.photo_url },
    { key: "Aadhaar upload", ok: !!form.aadhaar_image_url },
    { key: "PAN upload", ok: !!form.pan_image_url },
    { key: "Signature", ok: !!form.signature_url },
    { key: "Full name", ok: !!form.full_name.trim() },
    { key: "Aadhaar number", ok: /^\d{12}$/.test(form.aadhaar_number) },
    { key: "Date of birth", ok: !!form.date_of_birth },
    { key: "Gender", ok: !!form.gender },
    
    
    { key: "Permanent address", ok: !!form.permanent_address1.trim() && !!form.permanent_pincode },
    { key: "District", ok: !!form.permanent_district.trim() && (form.same_as_permanent || !!form.present_district.trim()) },
    {
      key: "UAN",
      ok: /^1\d{11}$/.test(String(((form.compliance ?? {}) as Record<string, unknown>).uan ?? "").trim()),
    },
    {
      key: "Emergency contact",
      ok: (() => {
        const e = form.contacts.find((c) => c.is_emergency) ?? form.contacts[0];
        if (!e) return false;
        const base =
          !!e.name.trim() &&
          !!e.relation.trim() &&
          /^[6-9]\d{9}$/.test(e.mobile.trim()) &&
          !!(e.address ?? "").trim() &&
          !!e.dob;
        if (!base) return false;
        const age = Math.floor((Date.now() - new Date(e.dob as string).getTime()) / 31557600000);
        if (Number.isFinite(age) && age < 18) {
          return (
            !!(e.guardian_name ?? "").trim() &&
            !!(e.guardian_address ?? "").trim() &&
            /^[6-9]\d{9}$/.test((e.guardian_mobile ?? "").trim())
          );
        }
        return true;
      })(),
    },

    { key: "Bank account", ok: !!form.bank_account_number.trim() && !!form.bank_ifsc.trim() },
    { key: "PAN number", ok: /^[A-Z]{5}[0-9]{4}[A-Z]$/.test((form.pan_number || "").trim().toUpperCase()) },
    { key: "Unit assignment", ok: form.unit_ids.length > 0 },
    { key: "Designation", ok: !!form.designation_id },
    { key: "ESIC family Aadhaar", ok: esicFamilyAadhaarComplete(form.compliance) },

  ];
  const completionDone = completionChecks.filter((c) => c.ok).length;
  const completionTotal = completionChecks.length;
  const completionPct = Math.round((completionDone / completionTotal) * 100);
  const profileComplete = completionDone === completionTotal;

  const uploadsComplete =
    !!form.photo_url && !!form.aadhaar_image_url && !!form.signature_url && !!form.pan_image_url;

  // ----- Build payload helper ----- //
  const buildPayload = (status: string) => {
    const emergencyContact = form.contacts.find((c) => c.is_emergency) ?? form.contacts[0] ?? null;
    // Strip the form-only field unit_ids; mirror primary into unit_id for backward compat.
    const { unit_ids, ...rest } = form;
    const mirroredPrimary = unit_ids[0] ?? null;
    const basePayload = form.same_as_permanent
      ? {
          ...rest,
          unit_id: mirroredPrimary,
          present_address1: form.permanent_address1,
          present_address2: form.permanent_address2,
          present_landmark: form.permanent_landmark,
          present_pincode: form.permanent_pincode,
          present_city: form.permanent_city,
          present_district: form.permanent_district,
          present_state: form.permanent_state,
          present_country: form.permanent_country,
          present_police_station: form.permanent_police_station,
        }
      : { ...rest, unit_id: mirroredPrimary };
    return {
      ...basePayload,
      status,
      emergency_contact_name: emergencyContact?.name ?? "",
      emergency_contact_relation: emergencyContact?.relation ?? "",
      emergency_contact_mobile: emergencyContact?.mobile ?? "",
    };
  };

  /** Replace the candidate's entries in candidate_units with the current form selection. */
  const syncCandidateUnits = async (candidateId: string) => {
    // Wipe existing rows then re-insert. Simpler & atomic enough for typical 1-5 units.
    const { error: deleteError } = await supabase.from("candidate_units" as never).delete().eq("candidate_id", candidateId);
    if (deleteError) throw new Error(`Unit assignment sync failed: ${deleteError.message}`);
    if (form.unit_ids.length === 0) return;
    const rows = form.unit_ids.map((unit_id, idx) => ({
      candidate_id: candidateId,
      unit_id,
      is_primary: idx === 0,
      sort_order: idx,
    }));
    const { error } = await supabase.from("candidate_units" as never).insert(rows as never);
    if (error) throw new Error(`Unit assignment sync failed: ${error.message}`);
  };

  const unitAssignmentsChanged = () => {
    if (!editing) return true;
    if (form.unit_ids.length !== initialUnitIds.length) return true;
    return form.unit_ids.some((id, idx) => id !== initialUnitIds[idx]);
  };

  const persist = async (status: string, successMsg: string) => {
    const payload = buildPayload(status);
    const normalizedAadhaar = String((payload as { aadhaar_number?: unknown }).aadhaar_number ?? "").replace(/\D/g, "");
    if (!editing && normalizedAadhaar.length === 12) {
      const existingCandidate = await findCandidateByAadhaar(normalizedAadhaar);
      if (existingCandidate) {
        setRehireMatch(existingCandidate as ExistingCandidateMatch);
        setRehireOpen(true);
        throw new Error("This Aadhaar already exists. Please continue through the rehire approval process.");
      }
    }
    const normalizedMobile = String((payload as { mobile?: unknown }).mobile ?? "").replace(/\D/g, "");
    if (normalizedMobile) {
      const duplicateQuery = supabase
        .from("candidates" as never)
        .select("id,full_name,status,candidate_code,employee_code")
        .eq("mobile", normalizedMobile)
        .neq("status", "inactive")
        .limit(1);
      if (editing?.id) duplicateQuery.neq("id", editing.id);
      const { data: duplicateMobileRows, error: duplicateMobileError } = await duplicateQuery;
      if (duplicateMobileError) throw duplicateMobileError;
      const duplicate = ((duplicateMobileRows as unknown) as Array<{
        id: string;
        full_name: string | null;
        status: string | null;
        candidate_code: string | null;
        employee_code: string | null;
      }> | null)?.[0];
      if (duplicate) {
        const recordCode = duplicate.employee_code || duplicate.candidate_code || "existing record";
        throw new Error(`Mobile ${normalizedMobile} is already linked to ${duplicate.full_name || recordCode} (${recordCode}, ${duplicate.status || "active"}). Open that profile or use a different mobile number.`);
      }
    }
    let createdCandidateId: string | null = null;
    if (editing) {
      const wasRejected = editing.status === "rejected";
      const isResubmit = wasRejected && status === "pending";
      const patched = isResubmit
        ? { ...(payload as Record<string, unknown>), rejection_reason: "", rejected_at: null }
        : (payload as Record<string, unknown>);
      const { data: before } = await supabase
        .from("candidates" as never)
        .select("*")
        .eq("id", editing.id)
        .maybeSingle();
      const { error } = await supabase
        .from("candidates" as never)
        .update(patched as never)
        .eq("id", editing.id);
      if (error) throw error;
      if (unitAssignmentsChanged()) {
        await syncCandidateUnits(editing.id);
        setInitialUnitIds([...form.unit_ids]);
      }
      await logActivity({
        module: "Employees",
        action: isResubmit ? "resubmit" : "update",
        entityType: "candidate",
        entityId: editing.id,
        entityLabel: payload.full_name,
        before: (before as unknown as Record<string, unknown>) ?? null,
        after: { ...(patched as Record<string, unknown>), unit_ids: form.unit_ids },
      });
      if (isResubmit) {
        await notifyOnboardingApprovers({
          type: "candidate_pending_approval",
          title: "Candidate re-submitted after fixes",
          message: `${payload.full_name || "A candidate"} has been updated and re-submitted for approval.`,
          link: "/admin/employees",
          entityType: "candidate",
          entityId: editing.id,
        }).catch((e: unknown) => console.error("notifyOnboardingApprovers resubmit failed", e));
      }
    } else {
      const { data: authData } = await supabase.auth.getUser();
      const creatorId = authData.user?.id ?? null;
      // Auto-derive role_key from the contract_resource mapped to this designation
      // (used primarily by the non-billable "Add Employee" flow).
      let derivedRoleKey = (payload as { role_key?: string | null }).role_key ?? "";
      if (!derivedRoleKey && (payload as { designation_id?: string | null }).designation_id) {
        const { data: cr } = await supabase
          .from("contract_resources" as never)
          .select("role_key")
          .eq("designation_id", (payload as { designation_id: string }).designation_id)
          .not("role_key", "is", null)
          .limit(1)
          .maybeSingle();
        const roleFromContract = (cr as { role_key?: string | null } | null)?.role_key ?? "";
        if (roleFromContract) derivedRoleKey = roleFromContract;
      }
      const insertPayload = { ...(payload as Record<string, unknown>), created_by: creatorId, role_key: derivedRoleKey || null };
      const { data, error } = await supabase
        .from("candidates" as never)
        .insert(insertPayload as never)
        .select("id")
        .single();
      if (error) throw error;

      const newId = (data as { id: string }).id;
      createdCandidateId = newId;
      await syncCandidateUnits(newId);
      setInitialUnitIds([...form.unit_ids]);
      await logActivity({
        module: "Employees",
        action: "create",
        entityType: "candidate",
        entityId: newId,
        entityLabel: payload.full_name,
        after: { ...(payload as unknown as Record<string, unknown>), unit_ids: form.unit_ids },
      });
      if (status === "pending") {
        await notifyOnboardingApprovers({
          type: "candidate_pending_approval",
          title: "New candidate awaiting approval",
          message: `${payload.full_name || "A new candidate"} has been submitted and needs your approval.`,
          link: "/admin/employees",
          entityType: "candidate",
          entityId: newId,
        }).catch((e: unknown) => console.error("notifyOnboardingApprovers submit failed", e));
      }
    }

    // Sync Home Branch → employee_scope_assignments (non-billable employees only).
    const cidForBranch = editing?.id ?? createdCandidateId;
    if (isEmployeeMode && homeBranchId && cidForBranch) {
      const branchLabel = branches.find((b) => b.id === homeBranchId)?.name ?? "";
      await supabase
        .from("employee_scope_assignments" as never)
        .delete()
        .eq("candidate_id", cidForBranch)
        .eq("scope_type", "branch");
      const { error: esaErr } = await supabase
        .from("employee_scope_assignments" as never)
        .insert({
          candidate_id: cidForBranch,
          scope_type: "branch",
          scope_id: homeBranchId,
          scope_label: branchLabel,
        } as never);
      if (esaErr) console.error("home branch sync failed", esaErr);
    }

    toast.success(successMsg);
    // Await so the caller (Save/Send-to-Approval handlers) can close the
    // wizard AFTER the list has refetched — prevents the "count went up
    // but I don't see my row" flash.
    await qc.invalidateQueries({ queryKey: QK, refetchType: "active" });
    await qc.invalidateQueries({ queryKey: ["candidate_units"], refetchType: "active" });
  };


  const saveDraft = async () => {
    setSavingDraft(true);
    setSaveError(null);
    try {
      // Drafts have no strict validation — let user save partial work.
      await persist(editing && editing.status !== "draft" ? form.status : "draft", "Draft saved");
      onOpenChange(false);
    } catch (e) {
      const msg = getMutationErrorMessage(e, "Could not save draft");
      setSaveError({ title: "Draft not saved", detail: msg });
      toast.error(msg);
    } finally {
      setSavingDraft(false);
    }
  };

  const failValidation = (message: string) => {
    setSaveError({ title: "Missing required information", detail: message });
    toast.error(message);
  };

  const submit = async () => {
    setSaveError(null);
    if (!isEditingEmployeeProfile) {
      if (!form.photo_url) return failValidation("Photograph is required");
      if (!form.aadhaar_image_url) return failValidation("Aadhaar upload is required");
      if (!form.signature_url) return failValidation("Signature is required");
      if (!form.pan_image_url) return failValidation("PAN card upload is required");
      if (!form.full_name.trim()) return failValidation("Name is required");
      if (!form.mobile.trim()) return failValidation("Mobile is required");
      if (!form.permanent_district.trim()) return failValidation("District is required in the permanent address");
      if (!form.same_as_permanent && !form.present_district.trim())
        return failValidation("District is required in the present address");
      const uanValue = String(((form.compliance ?? {}) as Record<string, unknown>).uan ?? "").trim();
      if (!uanValue) return failValidation("UAN is required (Compliance section)");
      if (!/^1\d{11}$/.test(uanValue))
        return failValidation("UAN must be 12 digits and must start with 1");
      const emergency = form.contacts.find((c) => c.is_emergency);
      if (!emergency)
        return failValidation("An emergency contact is required — add a contact and tick Emergency");
      if (!emergency.name.trim() || !emergency.relation.trim() || !emergency.mobile.trim())
        return failValidation("Emergency contact name, relationship and mobile are all required");
      if (!/^[6-9]\d{9}$/.test(emergency.mobile.trim()))
        return failValidation("Emergency contact mobile must be a valid 10-digit number");
      const compliance = (form.compliance ?? {}) as Record<string, unknown>;
      const esicEnabled = compliance.esic_enabled !== false; // default true
      if (esicEnabled && !compliance.esic_branch_id) {
        return failValidation("ESIC Branch is missing. Please map a branch from ESIC Branch Manager (Compliance section).");
      }
      if (form.pan_number && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan_number.trim().toUpperCase()))
        return failValidation("PAN number format is invalid (e.g. ABCDE1234F)");
      if (form.bank_ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.bank_ifsc.trim().toUpperCase()))
        return failValidation("IFSC code format is invalid (e.g. SBIN0001234)");
      if (form.bank_account_number && !/^\d{6,18}$/.test(form.bank_account_number.trim()))
        return failValidation("Bank account number must be 6–18 digits");
    }
    setSubmitting(true);
    try {
      // Creating / re-submitting moves to "pending" so the admin can approve.
      // For employees, preserve the chosen status (active/inactive). New/candidate edits go to pending.
      const nextStatus = isEditingEmployeeProfile
        ? (form.status === "inactive" ? "inactive" : "active")
        : "pending";
      const successMsg = editing
        ? (isEditingEmployeeProfile ? "Employee updated" : "Candidate updated")
        : "Candidate submitted for approval";
      await persist(nextStatus, successMsg);
      onOpenChange(false);
    } catch (e) {
      const msg = getMutationErrorMessage(e, "Save failed");
      setSaveError({ title: "Could not save candidate", detail: msg });
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };



  const wizardScrollRef = useRef<HTMLDivElement>(null);
  const wizardBodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const scrollToTop = () => {
      wizardScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      wizardBodyRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      try { window.scrollTo({ top: 0, behavior: "auto" }); } catch { /* noop */ }
    };
    scrollToTop();
    const t1 = window.setTimeout(scrollToTop, 50);
    const t2 = window.setTimeout(scrollToTop, 200);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={wizardScrollRef} className="candidate-wizard-page z-[100] flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-y-auto overscroll-contain rounded-none border-0 p-0 sm:h-auto sm:max-h-[92dvh] sm:w-[96vw] sm:max-w-4xl sm:overflow-hidden sm:rounded-lg sm:border">


        <DialogHeader className="shrink-0 border-b border-border bg-secondary/30 px-4 py-3 pr-14 sm:px-6 sm:py-4 sm:pr-6">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <UserPlus className="h-5 w-5 shrink-0" />
            <span className="truncate">{editing
              ? (editing.status === "approved" || editing.status === "active" || editing.status === "inactive")
                ? "Edit Employee"
                : "Edit Candidate"
              : isEmployeeMode ? "Add Employee" : "Add Candidate"}</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {isEmployeeMode
              ? "Non-billable internal hire. Billing unit is auto-set to Radiant; salary follows the Radiant contract for the chosen designation. Client unit mapping is optional."
              : "Complete the candidate profile. Save a draft any time; only submit when 100% complete."}
          </DialogDescription>
          {isEmployeeMode && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-0 bg-amber-500/15 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Non-billable</Badge>
                <Badge variant="outline" className="border-border/70 bg-card text-[11px] font-medium">Billing Unit · Radiant Guards - Pune Office</Badge>
              </div>
              <div className="grid gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Home Branch</label>
                <Select value={homeBranchId} onValueChange={setHomeBranchId}>
                  <SelectTrigger className="h-10 w-full text-xs sm:w-[280px]">
                    <SelectValue placeholder="Select home branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((b) => (
                        <SelectItem key={b.id} value={b.id} className="text-xs">
                          {b.name} {b.code ? <span className="ml-1 text-muted-foreground">· {b.code}</span> : null}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-muted-foreground">Where this employee reports for stock, transfers &amp; demands.</span>
              </div>
            </div>
          )}

          {editing && (editing.status === "approved" || editing.status === "active" || editing.status === "inactive") && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={form.status || editing.status} />
              {(editing as { employee_code?: string }).employee_code && (
                <Badge className="border-0 bg-primary/10 font-mono text-[11px] font-semibold text-primary">
                  {(editing as { employee_code?: string }).employee_code}
                </Badge>
              )}
              {(() => {
                const unitId = form.unit_id || editing.unit_id;
                const unit = unitId ? units.find((u) => u.id === unitId) : null;
                return unit ? (
                  <Badge variant="outline" className="border-border/70 bg-card text-[11px] font-medium">
                    Unit · {unit.name}
                  </Badge>
                ) : null;
              })()}
              {(() => {
                const desigId = form.designation_id || editing.designation_id;
                const desig = desigId ? designations.find((d) => d.id === desigId) : null;
                return desig ? (
                  <Badge variant="outline" className="border-border/70 bg-card text-[11px] font-medium">
                    {desig.name}
                    <span className={cn(
                      "ml-2 rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                      desig.billable
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-slate-500/15 text-slate-600 dark:text-slate-300",
                    )}>
                      {desig.billable ? "Billable" : "Non-billable"}
                    </span>
                  </Badge>
                ) : null;
              })()}
              {form.mobile && (
                <Badge variant="outline" className="border-border/70 bg-card text-[11px] font-medium">
                  {form.mobile}
                </Badge>
              )}
              {(() => {
                const eAny = editing as unknown as { offboarding_reason_id?: string | null; offboarded_at?: string | null; no_hire?: boolean };
                if (eAny.no_hire) {
                  return (
                    <Badge variant="outline" className="border-rose-300/60 bg-rose-500/10 text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                      Do not re-hire
                    </Badge>
                  );
                }
                return null;
              })()}
              {(() => {
                const eAny = editing as unknown as { offboarding_reason_id?: string | null; offboarded_at?: string | null };
                if (!eAny.offboarding_reason_id) return null;
                const r = offboardReasons.find((x) => x.id === eAny.offboarding_reason_id);
                const date = eAny.offboarded_at ? new Date(eAny.offboarded_at).toLocaleDateString() : null;
                return (
                  <Badge variant="outline" className="border-rose-300/60 bg-rose-500/10 text-[11px] font-medium text-rose-700 dark:text-rose-300">
                    Offboarded · {r?.name || "Reason"}{date ? ` · ${date}` : ""}
                  </Badge>
                );
              })()}
            </div>
          )}
        </DialogHeader>

        {/* Profile completion meter */}
        <div className="border-b border-border bg-card px-4 py-3 sm:px-6 sm:py-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Profile Completion
              </span>
              {editing?.candidate_code && (
                <Badge className="border-0 bg-primary/10 font-mono text-[11px] font-semibold text-primary">
                  {editing.candidate_code}
                </Badge>
              )}
            </div>
            <span className={cn(
              "text-sm font-bold tabular-nums",
              completionPct === 100 ? "text-emerald-600" : completionPct >= 60 ? "text-amber-600" : "text-rose-500",
            )}>
              {completionPct}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                "h-full transition-all",
                completionPct === 100
                  ? "bg-emerald-500"
                  : completionPct >= 60
                    ? "bg-amber-500"
                    : "bg-rose-500",
              )}
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {completionDone} of {completionTotal} required fields complete
            {!profileComplete && " — Save as draft to come back later."}
          </p>
          {!profileComplete && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Still missing:
              </span>
              {completionChecks.filter((c) => !c.ok).map((c) => (
                <Badge
                  key={c.key}
                  variant="outline"
                  className="border-rose-300 bg-rose-50 text-[10px] font-medium text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                >
                  {c.key}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div ref={wizardBodyRef} className="shrink-0 px-3 py-2.5 sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:overscroll-contain sm:px-4">
          {/* ----- Full form (single page) ----- */}
          {true && (
            <div className="space-y-4 sm:space-y-6">
              {/* Uploads strip */}
              <Section title={`Uploads — all required${uploadsComplete ? "" : " (incomplete)"}`}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <UploadTile
                    label="Photograph"
                    required
                    url={form.photo_url}
                    accept="image/*"
                    allowCamera
                    onPick={(f) => handleFile(f, "photo")}
                    uploading={uploading === "photo"}
                  />
                  <UploadTile
                    label="Aadhaar Card"
                    required
                    url={form.aadhaar_image_url}
                    accept="image/*,application/pdf"
                    onPick={(f) => handleFile(f, "aadhaar")}
                    uploading={uploading === "aadhaar" || scanning}
                    badge={scanning ? "Scanning…" : undefined}
                  />
                  <UploadTile
                    label="PAN Card"
                    required
                    url={form.pan_image_url}
                    accept="image/*,application/pdf"
                    onPick={(f) => handleFile(f, "pan")}
                    uploading={uploading === "pan"}
                  />
                  <UploadTile
                    label="Signature"
                    required
                    url={form.signature_url}
                    accept="image/*,application/pdf"
                    onPick={(f) => handleFile(f, "signature")}
                    uploading={uploading === "signature"}
                  />
                </div>
              </Section>

              {(unitsLoading || unitsError || designationsLoading || designationsError) && (
                <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
                  {unitsLoading || designationsLoading
                    ? "Loading units and designations…"
                    : unitsError || designationsError || "Reference data is unavailable right now."}
                </div>
              )}

              <Section title="Basic Information">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Full Name" required>
                    <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
                  </Field>
                  <Field label="Date of Birth">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !form.date_of_birth && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.date_of_birth
                            ? formatDateFns(parseISO(form.date_of_birth), "dd MMM yyyy")
                            : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[210]" align="start">
                        <Calendar
                          mode="single"
                          captionLayout="dropdown"
                          selected={form.date_of_birth ? parseISO(form.date_of_birth) : undefined}
                          defaultMonth={form.date_of_birth ? parseISO(form.date_of_birth) : new Date(2000, 0, 1)}
                          startMonth={new Date(1940, 0)}
                          endMonth={new Date()}
                          disabled={(d) => d > new Date()}
                          onSelect={(d) =>
                            set("date_of_birth", d ? formatDateFns(d, "yyyy-MM-dd") : null)
                          }
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </Field>
                  <Field label="Gender">
                    <Select value={form.gender || undefined} onValueChange={(v) => set("gender", v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Religion">
                    <Select value={form.religion || undefined} onValueChange={(v) => set("religion", v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {RELIGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Caste Category">
                    <Select value={form.caste_category || undefined} onValueChange={(v) => set("caste_category", v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {CASTE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Marital Status">
                    <Select value={form.marital_status || undefined} onValueChange={(v) => set("marital_status", v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {MARITAL_STATUSES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Birthplace">
                    <Input value={form.birthplace} onChange={(e) => set("birthplace", e.target.value)} />
                  </Field>
                  <Field label="Aadhaar Number">
                    <Input
                      format="aadhaar"
                      value={form.aadhaar_number}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/\D/g, "").slice(0, 12);
                        set("aadhaar_number", clean);
                        if (clean.length < 12) {
                          lastAadhaarLookupRef.current = "";
                          setRehireMatch(null);
                          setRehireOpen(false);
                        } else {
                          void checkAadhaarForRehire(clean);
                        }
                      }}
                      onBlur={() => void checkAadhaarForRehire(form.aadhaar_number)}
                    />
                    {aadhaarChecking && (
                      <div className="mt-1 text-[11px] text-muted-foreground">Checking existing records…</div>
                    )}
                    <RehireRequestDialog
                      open={rehireOpen}
                      match={rehireMatch}
                      onOpenChange={(nextOpen) => {
                        if (!nextOpen) lastAadhaarLookupRef.current = "";
                        setRehireOpen(nextOpen);
                      }}
                      onSubmitted={() => onOpenChange(false)}
                    />
                  </Field>

                  <Field label={isEmployeeMode ? "Employee Code" : "Candidate Number"}>
                    <Input
                      value={isEmployeeMode ? form.employee_code : form.candidate_code}
                      placeholder={isEmployeeMode ? "EMP-001" : "CAN-001"}
                      className="font-mono"
                      onChange={(e) => set(isEmployeeMode ? "employee_code" : "candidate_code", e.target.value)}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Emergency Contact">
                <div>

                  {(() => {
                    const ct: CandidateContact =
                      form.contacts[0] ?? { name: "", relation: "", mobile: "", is_emergency: true };
                    const upd = (patch: Partial<CandidateContact>) =>
                      setForm((f) => {
                        const base: CandidateContact =
                          f.contacts[0] ?? { name: "", relation: "", mobile: "", is_emergency: true };
                        return { ...f, contacts: [{ ...base, ...patch, is_emergency: true }] };
                      });
                    const presentAddress = [
                      form.present_address1,
                      form.present_address2,
                      form.present_landmark,
                      form.present_city,
                      form.present_state,
                      form.present_pincode,
                    ]
                      .filter((x) => x && String(x).trim())
                      .join(", ");
                    const age = ct.dob ? Math.floor((Date.now() - new Date(ct.dob).getTime()) / 31557600000) : null;
                    const isMinor = age !== null && Number.isFinite(age) && age < 18;
                    return (
                      <>
                        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                          Emergency Contact *
                        </div>
                        <div className="rounded-lg border border-border bg-secondary/30 p-2.5 sm:p-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <Field label="Name" required>
                              <Input value={ct.name} onChange={(e) => upd({ name: e.target.value })} />
                            </Field>
                            <Field label="Relationship" required>
                              <Select value={ct.relation || undefined} onValueChange={(v) => upd({ relation: v })}>
                                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                <SelectContent>
                                  {REFERENCE_RELATIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </Field>
                            <Field label="Mobile" required>
                              <Input
                                value={ct.mobile}
                                inputMode="numeric"
                                maxLength={10}
                                placeholder="10-digit mobile"
                                onChange={(e) => upd({ mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                              />
                            </Field>
                            <Field label="Date of Birth" required>
                              <DatePickerInput
                                value={ct.dob ?? ""}
                                onChange={(v) => upd({ dob: v ?? "" })}
                                placeholder="Select date of birth"
                                startYear={1930}
                                disableFuture
                              />

                            </Field>
                            <div className="sm:col-span-2">
                              <div className="mb-1.5 flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground">Address *</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-[11px]"
                                  disabled={!presentAddress}
                                  onClick={() => upd({ address: presentAddress })}
                                >
                                  Same as candidate's present address
                                </Button>
                              </div>
                              <Input
                                value={ct.address ?? ""}
                                placeholder="House / street, landmark, city, state, pincode"
                                onChange={(e) => upd({ address: e.target.value })}
                              />
                            </div>
                          </div>

                          {isMinor && (
                            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                              <p className="mb-2 text-xs font-semibold text-amber-800">
                                The emergency contact is a minor ({age} yrs). Guardian details are required.
                              </p>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <Field label="Guardian Name" required>
                                  <Input
                                    value={ct.guardian_name ?? ""}
                                    onChange={(e) => upd({ guardian_name: e.target.value })}
                                  />
                                </Field>
                                <Field label="Guardian Mobile" required>
                                  <Input
                                    value={ct.guardian_mobile ?? ""}
                                    inputMode="numeric"
                                    maxLength={10}
                                    placeholder="10-digit mobile"
                                    onChange={(e) =>
                                      upd({ guardian_mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })
                                    }
                                  />
                                </Field>
                                <Field label="Guardian Address" required>
                                  <Input
                                    value={ct.guardian_address ?? ""}
                                    onChange={(e) => upd({ guardian_address: e.target.value })}
                                  />
                                </Field>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>


                <div className="mt-5 border-t border-border pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      References
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          references: [
                            ...f.references,
                            { name: "", relation_type: "", mobile: "", address: "" },
                          ],
                        }))
                      }
                    >
                      <Plus className="mr-1 h-4 w-4" /> Add Reference
                    </Button>
                  </div>
                  {form.references.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No references added. Click "Add Reference" to include one.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {form.references.map((ref, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-border bg-secondary/30 p-2.5 sm:p-3"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground">
                              Reference #{i + 1}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  references: f.references.filter((_, idx) => idx !== i),
                                }))
                              }
                            >
                              <Trash2 className="h-4 w-4 text-rose-500" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Name">
                              <Input
                                value={ref.name}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    references: f.references.map((r, idx) =>
                                      idx === i ? { ...r, name: e.target.value } : r,
                                    ),
                                  }))
                                }
                              />
                            </Field>
                            <Field label="Relation Type">
                              <Select
                                value={ref.relation_type || undefined}
                                onValueChange={(v) =>
                                  setForm((f) => ({
                                    ...f,
                                    references: f.references.map((r, idx) =>
                                      idx === i ? { ...r, relation_type: v } : r,
                                    ),
                                  }))
                                }
                              >
                                <SelectTrigger><SelectValue placeholder="Family / Friend / …" /></SelectTrigger>
                                <SelectContent>
                                  {RELATION_TYPES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </Field>
                            <Field label="Mobile">
                              <Input
                                value={ref.mobile}
                                inputMode="numeric"
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    references: f.references.map((r, idx) =>
                                      idx === i
                                        ? { ...r, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) }
                                        : r,
                                    ),
                                  }))
                                }
                              />
                            </Field>
                            <Field label="Address">
                              <Input
                                value={ref.address}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    references: f.references.map((r, idx) =>
                                      idx === i ? { ...r, address: e.target.value } : r,
                                    ),
                                  }))
                                }
                              />
                            </Field>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Section>

              <Section title="Bank Details">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Account Holder Name">
                    <Input
                      value={form.bank_account_holder}
                      onChange={(e) => set("bank_account_holder", e.target.value)}
                      placeholder="As per bank records"
                    />
                  </Field>
                  <Field label="Account Number">
                    <Input
                      value={form.bank_account_number}
                      inputMode="numeric"
                      onChange={(e) =>
                        set("bank_account_number", e.target.value.replace(/\D/g, "").slice(0, 18))
                      }
                      className="font-mono"
                    />
                  </Field>
                  <Field label="IFSC Code">
                    <Input
                      value={form.bank_ifsc}
                      onChange={(e) => set("bank_ifsc", e.target.value.toUpperCase().slice(0, 11))}
                      placeholder="e.g. SBIN0001234"
                      className="font-mono uppercase"
                    />
                  </Field>
                  <Field label="Bank Name">
                    <Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} />
                  </Field>
                  <Field label="Branch">
                    <Input value={form.bank_branch} onChange={(e) => set("bank_branch", e.target.value)} />
                  </Field>
                  <Field label="Account Type">
                    <Select
                      value={form.bank_account_type || undefined}
                      onValueChange={(v) => set("bank_account_type", v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {BANK_ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="PAN Number">
                    <Input
                      format="pan"
                      value={form.pan_number}
                      onChange={(e) => set("pan_number", e.target.value)}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Permanent Address (auto-filled from Aadhaar)">
                <CandidateAddressFields
                  block={{
                    address1: form.permanent_address1,
                    address2: form.permanent_address2,
                    landmark: form.permanent_landmark,
                    pincode: form.permanent_pincode,
                    city: form.permanent_city,
                    district: form.permanent_district,
                    state: form.permanent_state,
                    country: form.permanent_country,
                  }}
                  onChange={(patch) => {
                    setForm((f) => {
                      const next = { ...f };
                      for (const [k, v] of Object.entries(patch)) {
                        const key = `permanent_${k}` as keyof CandidateForm;
                        (next as Record<string, unknown>)[key] = v;
                      }
                      if (f.same_as_permanent) {
                        for (const [k, v] of Object.entries(patch)) {
                          const key = `present_${k}` as keyof CandidateForm;
                          (next as Record<string, unknown>)[key] = v;
                        }
                      }
                      return next;
                    });
                  }}
                />
              </Section>

              <Section title="Present Address">
                <label className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-3 cursor-pointer">
                  <span className="text-sm font-medium leading-snug">Same as permanent address</span>
                  <Switch
                    className="shrink-0"
                    checked={form.same_as_permanent}
                    onCheckedChange={(v) => set("same_as_permanent", v)}
                  />
                </label>

                {!form.same_as_permanent && (
                  <>
                    <CandidateAddressFields
                      block={{
                        address1: form.present_address1,
                        address2: form.present_address2,
                        landmark: form.present_landmark,
                        pincode: form.present_pincode,
                        city: form.present_city,
                        district: form.present_district,
                        state: form.present_state,
                        country: form.present_country,
                      }}
                      onChange={(patch) =>
                        setForm((f) => {
                          const next = { ...f };
                          for (const [k, v] of Object.entries(patch)) {
                            const key = `present_${k}` as keyof CandidateForm;
                            (next as Record<string, unknown>)[key] = v;
                          }
                          return next;
                        })
                      }
                    />
                  </>
                )}
              </Section>

              <Section title="Assignment">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Application Date">
                    <DatePickerInput
                      value={form.application_date}
                      onChange={(v) => set("application_date", v ?? "")}
                    />
                  </Field>
                  <Field label="Preferred Joining Date">
                    <DatePickerInput
                      value={form.preferred_joining_date ?? ""}
                      onChange={(v) => set("preferred_joining_date", v)}
                      startYear={2000}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label={`Units (Client) — select one or more${form.unit_ids.length > 0 ? ` · ${form.unit_ids.length} selected` : ""}`}>
                      <MultiUnitPicker
                        units={units}
                        value={form.unit_ids}
                        onChange={(ids) => setForm((f) => ({ ...f, unit_ids: ids }))}
                        disabled={unitsLoading || !!unitsError}
                        emptyMessage={unitsError ? `Could not load units: ${unitsError}` : "No units found."}
                      />
                    </Field>
                  </div>
                  {editing && ['guard','security_guard'].includes((editing as { role_key?: string })?.role_key ?? '') && (
                    <div className="sm:col-span-2">
                      <GuardReportingManagersEditor
                        candidateId={editing.id}
                        candidateName={editing.full_name || editing.employee_code || ''}
                      />
                    </div>
                  )}
                  {editing && !['guard','security_guard','admin','super_admin'].includes((editing as { role_key?: string })?.role_key ?? '') && (
                    <div className="sm:col-span-2">
                      <ReportsToPicker
                        value={form.reports_to ?? null}
                        selfId={editing.id}
                        onChange={(id) => setForm((f) => ({ ...f, reports_to: id }))}
                      />
                    </div>
                  )}

                  <div className="sm:col-span-2">
                    <Field label={`Organizations${(() => {
                      const orgs = Array.from(new Set(form.unit_ids.map((id) => units.find((u) => u.id === id)?.customer_name).filter(Boolean) as string[]));
                      return orgs.length > 0 ? ` · ${orgs.length}` : "";
                    })()}`}>
                      <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-muted/30 p-2 min-h-[44px]">
                        {(() => {
                          const orgs = Array.from(new Set(form.unit_ids.map((id) => units.find((u) => u.id === id)?.customer_name).filter(Boolean) as string[]));
                          if (orgs.length === 0) {
                            return <span className="self-center px-1 text-sm text-muted-foreground">Select a unit to see its organization.</span>;
                          }
                          return orgs.map((org) => (
                            <Badge key={org} variant="secondary" className="font-normal">{org}</Badge>
                          ));
                        })()}
                      </div>
                    </Field>
                  </div>
                  <Field
                    label={
                      form.unit_ids.length === 0
                        ? "Designation (Primary) — select a unit first"
                        : `Designation (Primary) — ${filteredDesignations.length} available in unit contract${form.unit_ids.length > 1 ? "s" : ""}`
                    }
                  >
                    <DesignationPicker
                      designations={filteredDesignations}
                      value={form.designation_id}
                      onChange={(id) => set("designation_id", id)}
                      disabled={
                        designationsLoading ||
                        !!designationsError ||
                        form.unit_ids.length === 0 ||
                        contractDesigQuery.isLoading
                      }
                      emptyMessage={
                        designationsError
                          ? `Could not load designations: ${designationsError}`
                          : form.unit_ids.length === 0
                            ? "Select a unit above to see the designations available in that unit's contract."
                            : contractDesigQuery.isLoading
                              ? "Loading designations from unit contract…"
                              : "No designations found in the selected unit's contract. Ask an admin to add resources to the contract."
                      }
                    />
                  </Field>
                  {editing?.id ? (
                    <Field label="Additional Designations">
                      <CandidateDesignationsEditor
                        candidateId={editing.id}
                        primaryDesignationId={form.designation_id}
                        designations={designations}
                      />
                    </Field>
                  ) : null}

                  {editing && (editing.status === "approved" || editing.status === "active" || editing.status === "inactive") ? (
                    <Field label="Status">
                      <Select value={form.status} onValueChange={(v) => {
                        if (v === "inactive" && form.status !== "inactive" && onRequestOffboard) {
                          onRequestOffboard();
                          return;
                        }
                        if (v === "active" && form.status === "inactive" && form.no_hire) {
                          toast.error("This employee is flagged Do not re-hire and cannot be reactivated.");
                          return;
                        }
                        set("status", v);
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active" disabled={form.status === "inactive" && form.no_hire}>Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : (
                    <Field label="Approval status">
                      <div className="flex h-10 items-center rounded-md border border-border bg-secondary/40 px-3 text-sm text-muted-foreground">
                        Will be sent to approval
                      </div>
                    </Field>
                  )}
                  <div className="sm:col-span-2">
                    <Field label={`Assigned Assets${form.assigned_asset_ids.length > 0 ? ` · ${form.assigned_asset_ids.length} selected` : ""}`}>
                      <AssetMultiPicker
                        assets={assets}
                        value={form.assigned_asset_ids}
                        onChange={(ids) => setForm((f) => ({ ...f, assigned_asset_ids: ids }))}
                        sizes={(form.other_info?.uniform_sizes ?? {}) as Record<string, string>}
                        onSizesChange={(next) => setForm((f) => ({ ...f, other_info: { ...(f.other_info ?? {}), uniform_sizes: next } }))}
                        uniformIncluded={(() => {
                          const ids = form.unit_ids.length > 0 ? form.unit_ids : (form.unit_id ? [form.unit_id] : []);
                          if (ids.length === 0) return true;
                          return ids.every((id) => {
                            const u = units.find((x) => x.id === id);
                            return u ? u.uniform_included !== false : true;
                          });
                        })()}
                        uniformFeeAmount={(() => {
                          const ids = form.unit_ids.length > 0 ? form.unit_ids : (form.unit_id ? [form.unit_id] : []);
                          let max = 0;
                          for (const id of ids) {
                            const u = units.find((x) => x.id === id);
                            if (u && u.uniform_included === false) {
                              max = Math.max(max, Number(u.uniform_fee_amount ?? 0) || 0);
                            }
                          }
                          return max;
                        })()}
                      />
                    </Field>
                  </div>

                  {isEmployeeMode && (
                    <div className="sm:col-span-2 flex items-start justify-between gap-3 rounded-md border border-border bg-secondary/30 p-3">
                      <div className="min-w-0 flex-1">
                        <Label className="m-0 block">Do not re-hire</Label>
                        <p className="mt-0.5 text-xs text-muted-foreground leading-snug">Flag this employee as ineligible for re-hiring. Auto-enabled when offboarded as Absconding.</p>
                      </div>
                      <Switch
                        className="mt-0.5 shrink-0"
                        checked={form.no_hire}
                        onCheckedChange={(v) => set("no_hire", v)}
                      />
                    </div>
                  )}

                </div>
              </Section>

              <Section title="Compliance">
                <ComplianceSection form={form} setSection={setSection} esicBranches={esicBranches} />
              </Section>

              <Section title="Knowledge & Experience">
                <KnowledgeSection form={form} set={setAny} />
              </Section>

              <Section title="Physical & Health">
                <PhysicalSection form={form} setSection={setSection} />
              </Section>

              <Section title="Identification Proofs">
                <IdentificationSection form={form} set={setAny} setSection={setSection} hideWeapon={isEmployeeMode} />
              </Section>

              {isEmployeeMode && (
                <Section title="Criminal History">
                  <CriminalSection form={form} set={setAny} />
                </Section>
              )}

              <Section title="Nominee">
                <NomineeSection form={form} setSection={setSection} set={set} />
              </Section>

            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t border-border bg-card/95 px-3 py-3 pb-[calc(1rem+env(safe-area-inset-bottom)+5.5rem)] backdrop-blur-md sm:sticky sm:bottom-0 sm:z-10 sm:flex-col sm:items-stretch sm:justify-between sm:px-6 sm:py-4 sm:pb-4">
          {saveError && (
            <div
              role="alert"
              className="w-full rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{saveError.title}</div>
                  {saveError.detail && (
                    <div className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed opacity-90">
                      {saveError.detail}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSaveError(null)}
                  className="shrink-0 rounded-md p-1 text-rose-600/70 hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-500/20"
                  aria-label="Dismiss error"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 sm:mr-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 flex-1 sm:h-10 sm:flex-none">
              Cancel
            </Button>
            {canReview && (
              <>
                <Button
                  onClick={() => onApprove?.()}
                  disabled={isApproving || submitting || savingDraft || !!uploading || scanning}
                  className="h-11 flex-1 bg-emerald-600 text-white hover:bg-emerald-700 sm:h-10 sm:flex-none"
                  title="Approve & assign Employee ID"
                >
                  {isApproving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onReject?.()}
                  disabled={submitting || savingDraft || !!uploading || scanning}
                  className="h-11 flex-1 border-rose-200 bg-rose-50/50 text-rose-600 hover:bg-rose-50 hover:text-rose-600 sm:h-10 sm:flex-none dark:border-rose-500/40 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                >
                  <X className="mr-1.5 h-4 w-4" />
                  Reject
                </Button>
              </>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              onClick={saveDraft}
              disabled={savingDraft || submitting || !!uploading || scanning}
              className="h-11 w-full sm:h-10 sm:w-auto"
            >
              {savingDraft && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save Draft
            </Button>
            {(() => {
              const isExistingEmployee = !!editing;
              const submitDisabled = submitting || savingDraft || !!uploading || scanning;
              return (
                <Button
                  onClick={submit}
                  disabled={submitDisabled}
                  title={!isExistingEmployee && !profileComplete ? `Tip: complete all ${completionTotal} required fields (${completionPct}% done)` : undefined}
                  className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:h-10 sm:w-auto"
                >
                  {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {isExistingEmployee ? "Save Changes" : "Save & Send to Approval"}
                </Button>
              );
            })()}
          </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-2.5 shadow-sm sm:p-5">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </div>
      <SectionHeaderContext.Provider value={{ hideHeader: true }}>
        {children}
      </SectionHeaderContext.Provider>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      {children}
    </div>
  );
}

function DatePickerInput({
  value,
  onChange,
  placeholder = "Pick a date",
  startYear = 1940,
  endYear,
  disableFuture = false,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  placeholder?: string;
  startYear?: number;
  endYear?: number;
  disableFuture?: boolean;
}) {
  const parsed = value ? parseISO(value) : undefined;
  const end = endYear ? new Date(endYear, 11, 31) : new Date(new Date().getFullYear() + 5, 11, 31);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-start text-left font-normal", !parsed && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {parsed ? formatDateFns(parsed, "dd MMM yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-[210]" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={parsed}
          defaultMonth={parsed ?? new Date()}
          startMonth={new Date(startYear, 0)}
          endMonth={end}
          disabled={disableFuture ? (d) => d > new Date() : undefined}
          onSelect={(d) => onChange(d ? formatDateFns(d, "yyyy-MM-dd") : null)}
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

function CandidateAddressFields({
  block,
  onChange,
}: {
  block: AddressBlock;
  onChange: (patch: Partial<AddressBlock>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="District" required>
        <Input value={block.district} onChange={(e) => onChange({ district: e.target.value })} />
      </Field>
      <Field label="Address line 1">
        <Input value={block.address1} onChange={(e) => onChange({ address1: e.target.value })} />
      </Field>
      <Field label="Address line 2">
        <Input value={block.address2} onChange={(e) => onChange({ address2: e.target.value })} />
      </Field>
      <Field label="Landmark">
        <Input value={block.landmark} onChange={(e) => onChange({ landmark: e.target.value })} />
      </Field>
      <Field label="Pincode">
        <Input
          value={block.pincode}
          inputMode="numeric"
          maxLength={6}
          onChange={(e) => onChange({ pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
        />
      </Field>
      <Field label="City">
        <Input value={block.city} onChange={(e) => onChange({ city: e.target.value })} />
      </Field>
      <Field label="State">
        <Input value={block.state} onChange={(e) => onChange({ state: e.target.value })} />
      </Field>
      <Field label="Country">
        <Input value={block.country} onChange={(e) => onChange({ country: e.target.value })} />
      </Field>
    </div>
  );
}

function UploadTile({
  label,
  required,
  url,
  accept = "image/*",
  allowCamera = false,
  onPick,
  uploading,
  badge,
}: {
  label: string;
  required?: boolean;
  url: string;
  accept?: string;
  allowCamera?: boolean;
  onPick: (f: File | null) => void;
  uploading: boolean;
  badge?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const isPdf = !!url && /\.pdf(\?|$)/i.test(url);
  const done = !!url;
  return (
    <div
      className={`relative flex flex-col items-center gap-2 rounded-lg border border-dashed p-3 ${
        done ? "border-emerald-500/40 bg-emerald-500/5" : required ? "border-rose-400/40 bg-secondary/20" : "border-border bg-secondary/20"
      }`}
    >
      <div className="flex w-full items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {label} {required && <span className="text-rose-500">*</span>}
        </div>
        {done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
      </div>
      <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded-md bg-background">
        {url ? (
          isPdf ? (
            <a href={url} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <FileText className="h-8 w-8" />
              <span>View PDF</span>
            </a>
          ) : (
            <img src={url} alt={label} className="h-full w-full object-contain" />
          )
        ) : (
          <Upload className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          onPick(f);
        }}
      />
      {allowCamera ? (
        <div className="grid w-full grid-cols-2 gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCameraOpen(true)}
            disabled={uploading}
            className="min-w-0 px-2"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Camera className="mr-1 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Take</span>
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="min-w-0 px-2"
          >
            <Upload className="mr-1 h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Upload</span>
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full min-w-0 px-2"
        >
          {uploading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 shrink-0 animate-spin" />
              <span className="truncate">{badge ?? "Uploading…"}</span>
            </>
          ) : (
            <span className="truncate">{url ? "Replace" : "Upload (Image or PDF)"}</span>
          )}
        </Button>
      )}
      {allowCamera && (
        <CameraCaptureDialog
          open={cameraOpen}
          onOpenChange={setCameraOpen}
          onCapture={(file) => {
            setCameraOpen(false);
            onPick(file);
          }}
        />
      )}
    </div>
  );
}

function CameraCaptureDialog({
  open,
  onOpenChange,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setReady(false);

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera API not available in this browser");
        }
        if (!window.isSecureContext) {
          throw new Error("Camera requires a secure (HTTPS) context.");
        }
        // On many Windows laptops / desktop webcams the `facingMode` constraint
        // is not supported and getUserMedia rejects with OverconstrainedError.
        // Try the preferred constraints first, then progressively relax.
        const attempts: MediaStreamConstraints[] = [
          { video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          { video: true, audio: false },
        ];
        let stream: MediaStream | null = null;
        let lastErr: unknown = null;
        for (const constraints of attempts) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            break;
          } catch (err) {
            lastErr = err;
            const name = (err as { name?: string })?.name;
            // Retry on constraint/availability failures — e.g. a phone-as-webcam
            // disconnects (NotReadableError/AbortError) or doesn't match the
            // requested facingMode (OverconstrainedError).
            if (
              name !== "OverconstrainedError" &&
              name !== "ConstraintNotSatisfiedError" &&
              name !== "NotFoundError" &&
              name !== "NotReadableError" &&
              name !== "AbortError"
            ) {
              throw err;
            }
          }
        }
        if (!stream) throw lastErr ?? new Error("Could not start camera");
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        // The <video> element lives inside a Radix Dialog portal that mounts
        // asynchronously — poll briefly for the ref before attaching the stream.
        const attach = async () => {
          for (let i = 0; i < 40; i++) {
            if (cancelled) return;
            const v = videoRef.current;
            if (v) {
              v.srcObject = stream;
              v.onloadedmetadata = () => {
                v.play().catch(() => {});
                setReady(true);
              };
              try { await v.play(); } catch { /* autoplay may need user gesture */ }
              if (v.readyState >= 1) setReady(true);
              return;
            }
            await new Promise((r) => setTimeout(r, 50));
          }
        };
        await attach();
      } catch (e: unknown) {
        const err = e as { name?: string; message?: string };
        if (err.name === "NotAllowedError" || err.name === "SecurityError") {
          setError("Camera permission denied. Click the camera icon in the browser address bar and allow access, then retry.");
        } else if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
          setError("No compatible camera found on this device.");
        } else if (err.name === "NotReadableError") {
          setError("Camera is in use by another application (e.g. Teams, Zoom). Close it and retry.");
        } else {
          setError(err.message || "Could not start camera");
        }
      }
    })();


    return () => {
      cancelled = true;
      const s = streamRef.current;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open, facing]);


  const snap = () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[200] max-w-2xl">
        <DialogHeader>
          <DialogTitle>Take Photograph</DialogTitle>
          <DialogDescription>Position the subject and click Capture.</DialogDescription>
        </DialogHeader>
        <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`h-full w-full object-contain ${error ? "hidden" : ""}`}
          />
          {error && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-rose-300">
              {error}
            </div>
          )}
          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting camera…
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            disabled={!!error}
          >
            Switch camera ({facing === "user" ? "front" : "back"})
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={snap} disabled={!ready || !!error}>
              <Camera className="mr-1.5 h-4 w-4" /> Capture
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnitPicker({
  units,
  value,
  onChange,
  disabled = false,
  emptyMessage = "No units found.",
}: {
  units: UnitLite[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = value ? units.find((u) => u.id === value) : null;
  const filteredUnits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return units;
    return units.filter((unit) =>
      [unit.code, unit.name, unit.customer_name ?? "", unit.id].some((part) =>
        part.toLowerCase().includes(needle),
      ),
    );
  }, [query, units]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
          onMouseDown={(e) => e.preventDefault()}
        >
          {selected ? (
            <span className="truncate">
              <b>{selected.code}</b> · {selected.name}
            </span>
          ) : (
            <span className="text-muted-foreground">Search unit by code or name…</span>
          )}
          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[420px] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          triggerRef.current?.focus({ preventScroll: true });
        }}
      >
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search units…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {filteredUnits.map((u) => (
                <CommandItem
                  key={u.id}
                  value={`${u.code} ${u.name} ${u.customer_name ?? ""}`}
                  onSelect={() => {
                    onChange(u.id);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <div className="flex flex-col">
                    <span className="font-medium"><b>{u.code}</b> · {u.name}</span>
                    <span className="text-xs text-muted-foreground">{u.customer_name}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------------- Offboarding Dialog ---------------- //

const ABSCONDING_NAMES = new Set(["absconding", "abscond", "absconded"]);

function OffboardingDialog({
  target,
  reasons,
  reasonsLoading,
  assets,
  initialReasonId,
  isSubmitting,
  currentUserCandidateId,
  isFieldOfficer,
  onClose,
  onSubmit,
}: {
  target: CandidateListItem | null;
  reasons: { id: string; name: string }[];
  reasonsLoading: boolean;
  assets: { id: string; name: string; category: string }[];
  initialReasonId: string;
  isSubmitting: boolean;
  currentUserCandidateId: string | null;
  isFieldOfficer: boolean;
  onClose: () => void;
  onSubmit: (args: { reasonId: string; details: OffboardingDetails; noHire: boolean }) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [reasonId, setReasonId] = useState<string>(initialReasonId);
  const [dateOfOffboarding, setDateOfOffboarding] = useState<string>(today);
  const [dateOfResignation, setDateOfResignation] = useState<string>("");
  const [dateOfLastWorking, setDateOfLastWorking] = useState<string>("");
  const [dateOfPfUpdate, setDateOfPfUpdate] = useState<string>("");
  const [dateOfEsicUpdate, setDateOfEsicUpdate] = useState<string>("");
  const [reasonText, setReasonText] = useState<string>("");
  const [review, setReview] = useState<string>("");
  const [assetReturns, setAssetReturns] = useState<OffboardingAssetReturn[]>([]);
  const [invReturns, setInvReturns] = useState<OffboardingInventoryReturn[]>([]);
  const [returnDestKey, setReturnDestKey] = useState<string>(""); // "type:id"
  const [rating, setRating] = useState<number>(0);
  const [ratingRemarks, setRatingRemarks] = useState<string>("");
  const [noHire, setNoHire] = useState<boolean>(false);
  const [noHireTouched, setNoHireTouched] = useState<boolean>(false);

  // Fetch inventory currently held by this guard (balances at guard location = candidate.id)
  const balancesQ = useQuery({
    queryKey: ["offboard-inv-balances", target?.id],
    enabled: !!target?.id,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inv_stock_balances" as never)
        .select("item_id,size_value,qty,inv_items(name,unit)")
        .eq("location_type", "guard")
        .eq("location_id", target!.id)
        .gt("qty", 0);
      if (error) throw error;
      return ((data as unknown) as Array<{
        item_id: string;
        size_value: string;
        qty: number;
        inv_items: { name: string; unit: string } | null;
      }>) ?? [];
    },
  });

  // Last present day from the attendance system (muster roll + self punches)
  const lastPresentQ = useQuery({
    queryKey: ["offboard-last-present", target?.id],
    enabled: !!target?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const [entries, punches] = await Promise.all([
        supabase
          .from("attendance_entries" as never)
          .select("entry_date,code")
          .eq("candidate_id", target!.id)
          .in("code", ["P", "HD", "OT"])
          .order("entry_date", { ascending: false })
          .limit(1),
        supabase
          .from("self_attendance_punches" as never)
          .select("punch_date,check_in_at")
          .eq("candidate_id", target!.id)
          .not("check_in_at", "is", null)
          .order("punch_date", { ascending: false })
          .limit(1),
      ]);
      if (entries.error) throw entries.error;
      if (punches.error) throw punches.error;
      const a = ((entries.data as unknown) as Array<{ entry_date: string }>)?.[0]?.entry_date ?? "";
      const b = ((punches.data as unknown) as Array<{ punch_date: string }>)?.[0]?.punch_date ?? "";
      const best = [a, b].filter(Boolean).sort().pop() ?? "";
      return best;
    },
  });

  // Fetch active Field Officers — the offboarding collection MUST be received by an FO

  const fieldOfficersQ = useQuery({
    queryKey: ["offboard-field-officers"],
    enabled: !!target?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates" as never)
        .select("id,full_name,employee_code,role_key,is_enabled,status")
        .eq("role_key", "field_officer")
        .eq("is_enabled", true)
        .eq("status", "active")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Array<{ id: string; full_name: string; employee_code: string }>) ?? [];
    },
  });

  // Reset when target changes
  useEffect(() => {
    if (!target) return;
    setReasonId(initialReasonId || "");
    setDateOfOffboarding(today);
    setDateOfResignation("");
    setDateOfLastWorking("");
    setDateOfPfUpdate("");
    setDateOfEsicUpdate("");
    setReasonText("");
    setReview("");
    const prefill = (target.assigned_asset_ids ?? []).map((id) => ({ asset_id: id, returned: false, remarks: "" }));
    setAssetReturns(prefill);
    setInvReturns([]);
    setReturnDestKey("");
    setRating(0);
    setRatingRemarks("");
    setNoHire(false);
    setNoHireTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  // Default last working day = last present day from attendance
  const lastPresent = lastPresentQ.data ?? "";
  useEffect(() => {
    if (lastPresent) setDateOfLastWorking((prev) => prev || lastPresent);
  }, [lastPresent]);


  // Build default destination (Field Officer) + inv return rows once data loads
  useEffect(() => {
    if (!target) return;
    const bal = balancesQ.data ?? [];
    if (bal.length === 0) {
      setInvReturns([]);
      return;
    }
    const fos = fieldOfficersQ.data ?? [];
    // Prefer the guard's reports_to (their FO); else the current-user FO; else the first FO in list.
    let foId = "";
    let foLabel = "";
    const reports = target.reports_to ?? null;
    const preferred =
      (reports && fos.find((f) => f.id === reports)) ||
      (isFieldOfficer && currentUserCandidateId && fos.find((f) => f.id === currentUserCandidateId)) ||
      fos[0];
    if (preferred) {
      foId = preferred.id;
      foLabel = `Field Officer · ${preferred.full_name}${preferred.employee_code ? " · " + preferred.employee_code : ""}`;
    }
    const key = foId ? `field_officer:${foId}` : "";
    setReturnDestKey(key);
    setInvReturns(
      bal.map((b) => ({
        item_id: b.item_id,
        item_name: b.inv_items?.name ?? "Item",
        size_value: b.size_value ?? "",
        unit: b.inv_items?.unit ?? "pcs",
        on_hand: Number(b.qty ?? 0),
        qty_returned: Number(b.qty ?? 0),
        destination_type: "field_officer" as LocationType,
        destination_id: foId,
        destination_label: foLabel,
        remarks: "",
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id, balancesQ.data, fieldOfficersQ.data]);

  // Propagate destination change to all rows
  useEffect(() => {
    if (!returnDestKey) return;
    const [type, id] = returnDestKey.split(":") as [LocationType, string];
    const fo = (fieldOfficersQ.data ?? []).find((f) => f.id === id);
    const label = fo
      ? `Field Officer · ${fo.full_name}${fo.employee_code ? " · " + fo.employee_code : ""}`
      : "Field Officer";
    setInvReturns((rows) => rows.map((r) => ({ ...r, destination_type: type, destination_id: id, destination_label: label })));
  }, [returnDestKey, fieldOfficersQ.data]);


  const selectedReason = reasons.find((r) => r.id === reasonId);
  const isAbsconding = !!selectedReason && ABSCONDING_NAMES.has(selectedReason.name.trim().toLowerCase());

  // Auto-enable no-hire on Absconding (unless user manually toggled)
  useEffect(() => {
    if (!noHireTouched) {
      setNoHire(isAbsconding);
    }
  }, [isAbsconding, noHireTouched]);

  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const toggleReturned = (assetId: string) => {
    setAssetReturns((rows) =>
      rows.map((r) => (r.asset_id === assetId ? { ...r, returned: !r.returned } : r)),
    );
  };
  const setReturnRemarks = (assetId: string, remarks: string) => {
    setAssetReturns((rows) =>
      rows.map((r) => (r.asset_id === assetId ? { ...r, remarks } : r)),
    );
  };

  if (!target) return null;

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Offboard employee</DialogTitle>
          <DialogDescription>
            Capture the full offboarding record for{" "}
            <span className="font-medium text-foreground">
              {target.full_name || target.employee_code || "this employee"}
            </span>
            . If any inventory is still held, the selected Field Officer must confirm collection
            before the employee is finally marked Inactive.
          </DialogDescription>

        </DialogHeader>

        <div className="space-y-6">
          {/* Section: Reason + Dates */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Offboarding Details
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Employee</Label>
                <Input value={`${target.full_name}${target.employee_code ? ` · ${target.employee_code}` : ""}`} disabled />
              </div>
              <div className="space-y-1">
                <Label>Offboarding type *</Label>
                <Select value={reasonId} onValueChange={setReasonId}>
                  <SelectTrigger>
                    <SelectValue placeholder={reasonsLoading ? "Loading…" : "Select a type"} />
                  </SelectTrigger>
                  <SelectContent>
                    {reasons.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Date of offboarding *</Label>
                <DatePickerInput value={dateOfOffboarding} onChange={(v) => setDateOfOffboarding(v ?? "")} startYear={2000} />
              </div>
              <div className="space-y-1">
                <Label>Date of resignation</Label>
                <DatePickerInput value={dateOfResignation} onChange={(v) => setDateOfResignation(v ?? "")} startYear={2000} />
              </div>
              <div className="space-y-1">
                <Label>Date of last working day</Label>
                <DatePickerInput value={dateOfLastWorking} onChange={(v) => setDateOfLastWorking(v ?? "")} startYear={2000} />
                <p className="text-[11px] text-muted-foreground">
                  {lastPresentQ.isLoading
                    ? "Checking attendance…"
                    : lastPresent
                      ? `Auto-filled from last present day in attendance (${lastPresent})`
                      : "No attendance found — set this manually."}
                </p>
              </div>

              <div className="space-y-1">
                <Label>Date of PF update</Label>
                <DatePickerInput value={dateOfPfUpdate} onChange={(v) => setDateOfPfUpdate(v ?? "")} startYear={2000} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Date of ESIC update</Label>
                <DatePickerInput value={dateOfEsicUpdate} onChange={(v) => setDateOfEsicUpdate(v ?? "")} startYear={2000} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Reason for offboarding</Label>
                <Textarea
                  rows={2}
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder="Describe the reason in detail (optional)"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Review about employee</Label>
                <Textarea
                  rows={3}
                  value={review}
                  onChange={(e) => setReview(e.target.value)}
                  placeholder="Performance, conduct, anything HR / future hiring should know"
                />
              </div>
            </div>
          </section>

          {/* Handover Checklist removed — inventory return handshake below is the source of truth */}


          {/* Section: Return Issued Inventory (uniform / shoes / torch etc.) */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Return Issued Inventory
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {invReturns.filter((r) => r.qty_returned > 0).length} of {invReturns.length} items collected
              </span>
            </div>
            {balancesQ.isLoading ? (
              <p className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                Loading issued inventory…
              </p>
            ) : invReturns.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                No inventory items are currently held by this employee. If they left items behind, record them via a stock adjustment.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Collecting Field Officer *</Label>
                    <Select value={returnDestKey} onValueChange={setReturnDestKey}>
                      <SelectTrigger>
                        <SelectValue placeholder={fieldOfficersQ.isLoading ? "Loading…" : "Select field officer"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(fieldOfficersQ.data ?? []).map((fo) => (
                          <SelectItem key={fo.id} value={`field_officer:${fo.id}`}>
                            {fo.full_name}{fo.employee_code ? ` · ${fo.employee_code}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Offboarding will be marked <span className="font-medium text-foreground">Awaiting inventory collection</span>.
                      The selected Field Officer will get a red-flagged notification under Uniform Manager → Collections.
                      The employee is finalised as Inactive only once the FO confirms collection.
                    </p>
                  </div>

                </div>
                <div className="rounded-md border border-border">
                  <div className="grid grid-cols-[2fr,auto,auto,2fr] gap-3 border-b border-border bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <div>Item</div>
                    <div className="text-right">Held</div>
                    <div className="text-right">Returned</div>
                    <div>Remarks</div>
                  </div>
                  {invReturns.map((row, idx) => (
                    <div
                      key={`${row.item_id}:${row.size_value}`}
                      className={cn(
                        "grid grid-cols-[2fr,auto,auto,2fr] items-center gap-3 px-3 py-2 text-sm",
                        idx > 0 && "border-t border-border",
                      )}
                    >
                      <div>
                        <div className="font-medium">{row.item_name}</div>
                        {row.size_value && (
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Size {row.size_value}</div>
                        )}
                      </div>
                      <div className="text-right tabular-nums text-xs text-muted-foreground">
                        {row.on_hand} {row.unit}
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={row.on_hand}
                        step="1"
                        className="h-8 w-20 text-right tabular-nums"
                        value={row.qty_returned}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(row.on_hand, Number(e.target.value) || 0));
                          setInvReturns((rows) => rows.map((r, i) => (i === idx ? { ...r, qty_returned: v } : r)));
                        }}
                      />
                      <Input
                        placeholder="Condition / remarks (optional)"
                        className="h-8"
                        value={row.remarks ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setInvReturns((rows) => rows.map((r, i) => (i === idx ? { ...r, remarks: v } : r)));
                        }}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Section: Rating */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Employee Rating
            </h3>
            <div className="space-y-2">
              <Label>Overall rating</Label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setRating(rating === n ? 0 : n)}
                    className={cn(
                      "rounded p-1 text-2xl leading-none transition-colors",
                      n <= rating ? "text-amber-500" : "text-muted-foreground/40 hover:text-amber-400",
                    )}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  >
                    ★
                  </button>
                ))}
                <span className="ml-2 text-xs text-muted-foreground">
                  {rating > 0 ? `${rating} / 5` : "Not rated"}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Remarks</Label>
              <Textarea
                rows={2}
                value={ratingRemarks}
                onChange={(e) => setRatingRemarks(e.target.value)}
                placeholder="Optional notes supporting the rating"
              />
            </div>
          </section>

          {/* Section: Re-hire flag */}
          <section className="flex items-center justify-between rounded-md border border-border bg-secondary/30 p-3">
            <div>
              <Label className="m-0">Do not re-hire</Label>
              <p className="text-xs text-muted-foreground">
                {isAbsconding
                  ? "Auto-enabled because the offboarding type is Absconding."
                  : "Flag this employee as ineligible for re-hiring."}
              </p>
            </div>
            <Switch
              checked={noHire}
              onCheckedChange={(v) => { setNoHireTouched(true); setNoHire(v); }}
            />
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            disabled={
              !reasonId ||
              !dateOfOffboarding ||
              isSubmitting ||
              (invReturns.some((r) => r.qty_returned > 0) && !returnDestKey)
            }
            onClick={() => {
              onSubmit({
                reasonId,
                noHire,
                details: {
                  date_of_offboarding: dateOfOffboarding || null,
                  date_of_resignation: dateOfResignation || null,
                  date_of_last_working: dateOfLastWorking || null,
                  date_of_pf_update: dateOfPfUpdate || null,
                  date_of_esic_update: dateOfEsicUpdate || null,
                  reason_text: reasonText.trim(),
                  review: review.trim(),
                  asset_returns: assetReturns,
                  inventory_returns: invReturns.filter((r) => r.qty_returned > 0),
                  rating,
                  rating_remarks: ratingRemarks.trim(),
                },
              });
            }}
          >
            {isSubmitting ? "Saving…" : "Confirm offboarding"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportsToPicker({
  value,
  selfId,
  onChange,
}: {
  value: string | null;
  selfId: string;
  onChange: (id: string | null) => void;
}) {
  const managersQuery = useQuery({
    queryKey: ["employees", "eligible-managers"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates" as never)
        .select("id,full_name,employee_code,role_key,status,is_enabled")
        .in("role_key", ["field_officer", "hr", "leadership", "admin", "super_admin", "branch_manager", "branch_admin"])
        .in("status", ["approved", "active"])
        .order("full_name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return ((data as unknown) as Array<{ id: string; full_name: string; employee_code: string; role_key: string; is_enabled: boolean }> ?? [])
        .filter((c) => c.is_enabled !== false && c.id !== selfId);
    },
  });
  const managers = managersQuery.data ?? [];
  const selected = value ? managers.find((m) => m.id === value) : null;
  return (
    <Field label="Reporting Manager">
      <Select
        value={value ?? "__none__"}
        onValueChange={(v) => onChange(v === "__none__" ? null : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder={managersQuery.isLoading ? "Loading…" : "Select a reporting manager"}>
            {selected ? (
              <span className="truncate">
                {selected.full_name}
                <span className="ml-1 text-[10px] text-muted-foreground">
                  · {selected.role_key.replace(/_/g, " ")}
                </span>
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__" className="text-xs">— No reporting manager —</SelectItem>
          {managers.map((m) => (
            <SelectItem key={m.id} value={m.id} className="text-xs">
              {m.full_name}
              <span className="ml-1 text-[10px] text-muted-foreground">
                · {m.role_key.replace(/_/g, " ")}{m.employee_code ? ` · ${m.employee_code}` : ""}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Used for approvals, escalations, and the dashboard "reports to" chip.
      </p>
    </Field>
  );
}


function AssetMultiPicker({
  assets,
  value,
  onChange,
  sizes,
  onSizesChange,
  uniformIncluded = true,
  uniformFeeAmount = 0,
}: {
  assets: { id: string; name: string; category: string; available_qty?: number; unit_price?: number }[];
  value: string[];
  onChange: (ids: string[]) => void;
  sizes?: Record<string, string>;
  onSizesChange?: (next: Record<string, string>) => void;
  uniformIncluded?: boolean;
  uniformFeeAmount?: number;
}) {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const selected = useMemo(() => assets.filter((a) => selectedSet.has(a.id)), [assets, selectedSet]);

  // Only surface assets that actually have live inventory available.
  const pickable = useMemo(
    () => assets.filter((a) => (a.available_qty ?? 0) > 0),
    [assets],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return pickable;
    return pickable.filter((a) =>
      [a.name, a.category].some((p) => (p ?? "").toLowerCase().includes(needle)),
    );
  }, [query, pickable]);


  const grouped = useMemo(() => {
    const groups = new Map<string, typeof assets>();
    for (const a of filtered) {
      const key = a.category || "—";
      const arr = groups.get(key) ?? [];
      arr.push(a);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(value.filter((v) => v !== id));
      if (sizes && onSizesChange && sizes[id] != null) {
        const next = { ...sizes };
        delete next[id];
        onSizesChange(next);
      }
    } else onChange([...value, id]);
  };

  const isUniform = (a: { category: string; name: string }) =>
    /uniform/i.test(a.category ?? "") || /uniform/i.test(a.name ?? "");

  const flatUniformFee = !uniformIncluded && uniformFeeAmount > 0 ? uniformFeeAmount : 0;

  const priceFor = (a: { category: string; name: string; unit_price?: number }) => {
    if (isUniform(a)) {
      // Uniform included in the contract, or charged as a single unit-level flat fee.
      if (uniformIncluded || flatUniformFee > 0) return 0;
    }
    return Number(a.unit_price ?? 0) || 0;
  };

  const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  const uniformSelected = selected.filter(isUniform);
  const totalRecoverable =
    selected.reduce((sum, a) => sum + priceFor(a), 0) +
    (uniformSelected.length > 0 ? flatUniformFee : 0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-input bg-background">
        <div className="flex flex-wrap gap-1.5 p-2 min-h-[44px]">
          {selected.length === 0 && (
            <span className="self-center px-1 text-sm text-muted-foreground">
              No assets assigned — click "Add asset" to assign company assets.
            </span>
          )}
          {selected.map((a) => {
            const uni = isUniform(a);
            const price = priceFor(a);
            return (
              <Badge key={a.id} variant="secondary" className="flex items-center gap-1.5 pl-2 pr-1 py-1 text-xs font-normal">
                <span className="font-medium">{a.name}</span>
                <span className="opacity-60 text-[10px]">· {a.category}</span>
                {uni && uniformIncluded ? (
                  <span className="rounded bg-emerald-500/15 px-1 py-[1px] text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                    ₹0 · Included
                  </span>
                ) : price > 0 ? (
                  <span className="rounded bg-amber-500/15 px-1 py-[1px] text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                    {inr(price)}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="ml-1 rounded p-0.5 opacity-70 hover:bg-background/30 hover:opacity-100"
                  title="Remove"
                  onClick={(e) => { e.preventDefault(); toggle(a.id); }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-2.5 py-1.5 text-[11px]">
            <span className="text-muted-foreground">
              {uniformSelected.length > 0 && uniformIncluded
                ? "Uniform items are included in this unit's contract (₹0 to the staff member)."
                : uniformSelected.length > 0 && flatUniformFee > 0
                  ? `Uniform is not included — a flat uniform fee of ${inr(flatUniformFee)} set on this unit will be recovered from the staff member.`
                  : uniformSelected.length > 0
                    ? "Uniform is not included — value shown will be recoverable from the staff member."
                    : "Values shown are recoverable against the staff member."}
            </span>
            <span className="font-semibold text-foreground">
              Recoverable total: {inr(totalRecoverable)}
            </span>
          </div>
        )}
      </div>

      {onSizesChange && uniformSelected.length > 0 && (
        <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
            Uniform sizes
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {uniformSelected.map((a) => (
              <div key={a.id} className="flex items-center gap-2">
                <Label className="flex-1 text-xs">{a.name}</Label>
                <Select
                  value={(sizes ?? {})[a.id] ?? ""}
                  onValueChange={(v) => onSizesChange({ ...(sizes ?? {}), [a.id]: v })}
                >
                  <SelectTrigger className="h-8 w-28">
                    <SelectValue placeholder="Size" />
                  </SelectTrigger>
                  <SelectContent>
                    {["XS", "S", "M", "L", "XL", "XXL", "XXXL", "28", "30", "32", "34", "36", "38", "40", "42", "44", "46"].map((sz) => (
                      <SelectItem key={sz} value={sz}>{sz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="font-normal"
          onClick={() => setOpen((prev) => !prev)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {open ? "Close asset selector" : selected.length === 0 ? "Add asset…" : "Add / manage assets…"}
        </Button>

        {open ? (
          <div className="rounded-md border border-border bg-background">
            <div className="border-b border-border p-2">
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or category…"
              />
            </div>
            <div className="p-2 sm:max-h-[340px] sm:overflow-y-auto">
              {grouped.length === 0 ? (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">No matching assets available in inventory.</div>
              ) : (
                <div className="space-y-3">
                  {grouped.map(([cat, list]) => (
                    <div key={cat} className="space-y-1.5">
                      <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {cat}
                      </div>
                      <div className="space-y-1">
                        {list.map((a) => {
                          const checked = selectedSet.has(a.id);
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => toggle(a.id)}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                                checked ? "bg-primary/10 text-foreground" : "hover:bg-secondary",
                              )}
                            >
                              <Check className={cn("h-4 w-4 shrink-0", checked ? "opacity-100" : "opacity-0")} />
                              <span className="flex-1 truncate">{a.name}</span>
                              <span className="text-[10px] text-muted-foreground">{a.category}</span>
                              {(() => {
                                const uni = isUniform(a);
                                const price = priceFor(a);
                                if (uni && uniformIncluded) {
                                  return (
                                    <span className="ml-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                      ₹0 · Free
                                    </span>
                                  );
                                }
                                if (price > 0) {
                                  return (
                                    <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                      {inr(price)}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                              <span className="ml-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                {a.available_qty} in stock
                              </span>


                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}


function MultiUnitPicker({
  units,
  value,
  onChange,
  disabled = false,
  emptyMessage = "No units found.",
}: {
  units: UnitLite[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedUnits = useMemo(
    () => value.map((id) => units.find((u) => u.id === id)).filter(Boolean) as UnitLite[],
    [value, units],
  );

  const filteredUnits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return units;
    return units.filter((u) =>
      [u.code, u.name, u.customer_name ?? "", u.id].some((p) => p.toLowerCase().includes(needle)),
    );
  }, [query, units]);

  // Group filtered units by customer/organization
  const grouped = useMemo(() => {
    const groups = new Map<string, UnitLite[]>();
    for (const u of filteredUnits) {
      const key = u.customer_name || "—";
      const arr = groups.get(key) ?? [];
      arr.push(u);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredUnits]);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const removeOne = (id: string) => onChange(value.filter((v) => v !== id));

  const makePrimary = (id: string) => {
    if (value[0] === id) return;
    onChange([id, ...value.filter((v) => v !== id)]);
  };

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <div className="space-y-2">
      {/* Chips of selected units */}
      <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background p-2 min-h-[44px]">
        {selectedUnits.length === 0 && (
          <span className="self-center px-1 text-sm text-muted-foreground">
            No units selected — click "Add unit" to assign.
          </span>
        )}
        {selectedUnits.map((u, idx) => {
          const isPrimary = idx === 0;
          return (
            <Badge
              key={u.id}
              variant={isPrimary ? "default" : "secondary"}
              className={cn(
                "flex items-center gap-1.5 pl-2 pr-1 py-1 text-xs font-normal",
                isPrimary && "ring-1 ring-primary/40",
              )}
            >
              {isPrimary && (
                <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">
                  Primary
                </span>
              )}
              <span className="font-mono font-semibold">{u.code}</span>
              <span className="opacity-80">· {u.name}</span>
              {u.customer_name && (
                <span className="opacity-60 text-[10px]">({u.customer_name})</span>
              )}
              {!isPrimary && (
                <button
                  type="button"
                  className="ml-1 rounded p-0.5 opacity-60 hover:bg-background/30 hover:opacity-100"
                  title="Make primary"
                  onClick={(e) => {
                    e.preventDefault();
                    makePrimary(u.id);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <Check className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                className="ml-0.5 rounded p-0.5 opacity-70 hover:bg-background/30 hover:opacity-100"
                title="Remove"
                onClick={(e) => {
                  e.preventDefault();
                  removeOne(u.id);
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="font-normal"
          onClick={() => setOpen((prev) => !prev)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {open ? "Close unit selector" : selectedUnits.length === 0 ? "Add unit…" : "Add / manage units…"}
        </Button>

        {open ? (
          <div className="rounded-md border border-border bg-background">
            <div className="border-b border-border p-2">
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by code, name or organization…"
              />
            </div>
            <div className="p-2 sm:max-h-[340px] sm:overflow-y-auto">
              {grouped.length === 0 ? (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
              ) : (
                <div className="space-y-3">
                  {grouped.map(([orgName, list]) => (
                    <div key={orgName} className="space-y-1.5">
                      <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {orgName}
                      </div>
                      <div className="space-y-1">
                        {list.map((u) => {
                          const checked = selectedSet.has(u.id);
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => toggle(u.id)}
                              className={cn(
                                "flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                                checked
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:bg-muted/40",
                              )}
                            >
                              <div
                                className={cn(
                                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                  checked
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-input bg-background",
                                )}
                              >
                                {checked ? <Check className="h-3 w-3" /> : null}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium">
                                  <b>{u.code}</b> · {u.name}
                                </div>
                                {u.customer_name ? (
                                  <div className="text-[11px] text-muted-foreground">{u.customer_name}</div>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              <span>
                {value.length} selected
                {value.length > 0 ? " — first one is Primary" : ""}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => setOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DesignationPicker({
  designations,
  value,
  onChange,
  disabled = false,
  emptyMessage = "No designations found.",
}: {
  designations: DesignationLite[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selected = value ? designations.find((d) => d.id === value) : null;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return designations;
    return designations.filter((d) =>
      [d.code ?? "", d.name].some((p) => p.toLowerCase().includes(needle)),
    );
  }, [query, designations]);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className="w-full justify-between font-normal"
        onClick={() => setOpen((o) => !o)}
      >
        {selected ? (
          <span className="truncate">
            {selected.code ? <><b>{selected.code}</b> · </> : null}{selected.name}
          </span>
        ) : (
          <span className="text-muted-foreground">Search designation…</span>
        )}
        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      {open && (
        <div className="rounded-md border bg-popover p-2 space-y-2">
          <Input
            ref={searchInputRef}
            placeholder="Search designations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8"
          />
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-xs text-muted-foreground px-2 py-3">{emptyMessage}</div>
            ) : (
              filtered.map((d) => {
                const isSel = d.id === value;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      onChange(d.id);
                      setQuery("");
                      setOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-sm hover:bg-accent flex flex-col ${isSel ? "bg-accent" : ""}`}
                  >
                    <span className="font-medium text-sm">{d.name}</span>
                    {d.code ? <span className="text-xs text-muted-foreground">{d.code}</span> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function toTitle(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function CandidateDesignationsEditor({
  candidateId,
  primaryDesignationId,
  designations,
}: {
  candidateId: string;
  primaryDesignationId: string | null;
  designations: DesignationLite[];
}) {
  const qc = useQueryClient();
  const qk = ["candidate-designations", candidateId];
  const { data: rows = [] } = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_designations" as never)
        .select("id, designation_id, is_primary")
        .eq("candidate_id", candidateId);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; designation_id: string; is_primary: boolean }>;
    },
  });
  const [picker, setPicker] = useState("");
  const extras = rows.filter((r) => r.designation_id !== primaryDesignationId);
  const dMap = useMemo(() => new Map(designations.map((d) => [d.id, d.name])), [designations]);

  const add = async () => {
    if (!picker) return;
    if (rows.some((r) => r.designation_id === picker)) {
      toast.error("Already assigned");
      return;
    }
    const { error } = await supabase
      .from("candidate_designations" as never)
      .insert({ candidate_id: candidateId, designation_id: picker, is_primary: false } as never);
    if (error) { toast.error(error.message); return; }
    void logActivity({
      module: "Candidate Designations",
      action: "Add additional designation",
      entityType: "candidate_designations",
      entityLabel: dMap.get(picker) ?? picker,
      details: { candidate_id: candidateId, designation_id: picker },
    });
    setPicker("");
    qc.invalidateQueries({ queryKey: qk });
  };

  const remove = async (id: string, did: string) => {
    const { error } = await supabase.from("candidate_designations" as never).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    void logActivity({
      module: "Candidate Designations",
      action: "Remove additional designation",
      entityType: "candidate_designations",
      entityLabel: dMap.get(did) ?? did,
      details: { candidate_id: candidateId, designation_id: did },
    });
    qc.invalidateQueries({ queryKey: qk });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-muted/30 p-2 min-h-[44px]">
        {extras.length === 0 ? (
          <span className="self-center px-1 text-sm text-muted-foreground">No additional designations.</span>
        ) : (
          extras.map((r) => (
            <Badge key={r.id} variant="secondary" className="font-normal gap-1">
              {dMap.get(r.designation_id) ?? r.designation_id}
              <button type="button" className="ml-1 text-muted-foreground hover:text-foreground" onClick={() => remove(r.id, r.designation_id)}>×</button>
            </Badge>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Select value={picker} onValueChange={setPicker}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Add another designation…" /></SelectTrigger>
          <SelectContent>
            {designations
              .filter((d) => d.id !== primaryDesignationId && !rows.some((r) => r.designation_id === d.id))
              .map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!picker}>Add</Button>
      </div>
      <p className="text-xs text-muted-foreground">Used by attendance to route days under different roles when this person works multiple designations.</p>
    </div>
  );
}
