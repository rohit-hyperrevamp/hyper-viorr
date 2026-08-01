import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Printer, Download, CheckCircle2, XCircle, Send, RotateCcw, Plus, X, Upload, Loader2, FileSpreadsheet, Image as ImageIcon, Trash2, Search } from "lucide-react";
import { useConfirm } from "@/components/ConfirmProvider";
import { toast } from "sonner";
import { z } from "zod";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { notifyApprovers, notifyUser } from "@/lib/notifications";
import { extractAttendanceFromImage } from "@/lib/attendance-ocr.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { classifyAttendanceEmployee, isNonBillableRoleKey, matchesAttendanceScope, type AttendanceScopeAssignment, type AttendanceUnitContext } from "@/lib/attendance";
import { fetchAttendanceEntriesForPeriod } from "@/lib/attendance-fetch";
import { attendanceCodeForShift, fetchShiftHoursMap, overtimeDaysForShift, shiftHoursFor } from "@/lib/shift-hours";
import { resolvePayrollDayCount, type PayrollDayBaseLike } from "@/lib/payroll-days";

import { cn } from "@/lib/utils";
import { useCurrentPermissions } from "@/lib/rbac";

const searchSchema = z.object({
  month: z.coerce.number().min(0).max(11).optional(),
  year: z.coerce.number().min(2000).max(2100).optional(),
});

export const Route = createFileRoute("/admin/attendance/$unitId")({
  validateSearch: (s) => searchSchema.parse(s),
  component: MusterRollPage,
});

type AttendanceCode = {
  id: string;
  code: string;
  label: string;
  color: string;
  counts_as_present: boolean;
  is_paid: boolean;
  is_leave: boolean;
  day_value: number | string | null;
  sort_order: number;
};

type EntryRow = {
  candidate_id: string;
  designation_id: string | null;
  entry_date: string;
  code: string;
  ot_hours: number;
};

type OcrRowSummary = {
  candidate_id: string;
  p_days: number | null;
  ot_days: number | null;
  t_days: number | null;
  confident: boolean;
};

const SERVICE_PROVIDER = {
  name: "Radiant Guard Services Private Limited",
  address: "Office No. 818, 8th Floor, Clover Hills Plaza, NIBM Road, Pune. 411048",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ATTENDANCE_EMPLOYEE_STATUSES = ["active", "approved"] as const;

function daysInMonth(year: number, monthIdx0: number) {
  return new Date(year, monthIdx0 + 1, 0).getDate();
}

function ymd(year: number, monthIdx0: number, day: number) {
  const m = String(monthIdx0 + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function roundHalf(value: number) {
  return Math.round(value * 2) / 2;
}

function nearlyEqual(a: number | null, b: number | null, epsilon = 0.01) {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= epsilon;
}

function isSummaryClose(actual: OcrRowSummary, expected: OcrRowSummary) {
  const pOk = expected.p_days == null || nearlyEqual(actual.p_days, roundHalf(expected.p_days), 1);
  const otOk = expected.ot_days == null || nearlyEqual(actual.ot_days, roundHalf(expected.ot_days), 1);
  const tOk = expected.t_days == null || nearlyEqual(actual.t_days, roundHalf(expected.t_days), 1.5);
  return { pOk, otOk, tOk, ok: pOk && otOk && tOk };
}

async function downscaleImage(file: File, maxDim: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(async () => {
    // Safari/HEIC fallback via <img>
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      return img as unknown as ImageBitmap;
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  const w = (bitmap as ImageBitmap).width ?? (bitmap as unknown as HTMLImageElement).naturalWidth;
  const h = (bitmap as ImageBitmap).height ?? (bitmap as unknown as HTMLImageElement).naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, tw, th);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Attendance register period = the calendar month, always.
 * Day 1 → last day of the month, taken from the real calendar so 30/31-day
 * months and leap-year February are always exact. The contract payroll window
 * is only a processing cut-off; it never shortens the register.
 */
function buildPeriodCells(
  year: number,
  monthIdx: number,
  _win?: { window_start_day: number; window_end_day: number } | null,
): Array<{ date: string; dayNum: number; monthIdx: number; year: number }> {
  const last = daysInMonth(year, monthIdx);
  const cells: Array<{ date: string; dayNum: number; monthIdx: number; year: number }> = [];
  for (let day = 1; day <= last; day += 1) {
    cells.push({ date: ymd(year, monthIdx, day), dayNum: day, monthIdx, year });
  }
  return cells;
}


const NULL_DESIG = "__none__"; // sentinel row-key segment when an employee has no designation

const rowKey = (candidateId: string, designationId: string | null) =>
  `${candidateId}|${designationId ?? NULL_DESIG}`;

function MusterRollPage() {
  const { unitId } = Route.useParams();
  const search = Route.useSearch();
  const now = new Date();
  const todayStr = ymd(now.getFullYear(), now.getMonth(), now.getDate());
  const [year, setYear] = useState(search.year ?? now.getFullYear());
  const [monthIdx, setMonthIdx] = useState(search.month ?? now.getMonth());
  const [musterQuery, setMusterQuery] = useState("");

  const { data: unit } = useQuery({
    queryKey: ["attendance-unit", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id, code, name, location, branch_id, customer_id, billing_state, reporting_officers, shipping_address1, shipping_address2, shipping_city, shipping_district, shipping_state, shipping_pincode, billing_address1, billing_address2, billing_city, billing_district, billing_pincode")
        .eq("id", unitId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: cust } = await supabase
        .from("customers")
        .select("id, name")
        .eq("id", data.customer_id ?? "")
        .maybeSingle();
      return { ...data, customer_name: cust?.name ?? "" };
    },
  });

  const { data: employees, isLoading, error: rosterError } = useQuery({
    queryKey: ["attendance-roster-v5", unitId],
    queryFn: async () => {
      const rosterSelect = "id, employee_code, full_name, designation_id, preferred_joining_date, date_of_birth, is_enabled, status, role_key, non_billable";

      const { data: prim, error: primError } = await supabase
        .from("candidates")
        .select(rosterSelect)
        .eq("unit_id", unitId)
        .eq("is_enabled", true)
        .in("status", [...ATTENDANCE_EMPLOYEE_STATUSES]);
      if (primError) throw primError;

      const [
        { data: links, error: linksError },
        { data: rawUnit, error: rawUnitError },
        { data: scopeAssignments, error: scopeAssignmentsError },
      ] = await Promise.all([
        supabase.from("candidate_units").select("candidate_id").eq("unit_id", unitId),
        supabase.from("units").select("id, branch_id, customer_id, billing_state").eq("id", unitId).maybeSingle(),
        supabase.from("employee_scope_assignments").select("candidate_id, scope_type, scope_id").limit(5000),
      ]);
      if (linksError) throw linksError;
      if (rawUnitError) throw rawUnitError;
      if (scopeAssignmentsError) throw scopeAssignmentsError;

      const context: AttendanceUnitContext | null = rawUnit
        ? {
            id: rawUnit.id,
            branch_id: rawUnit.branch_id,
            customer_id: rawUnit.customer_id,
            billing_state: rawUnit.billing_state,
          }
        : null;

      const scopeIds = new Set<string>();
      for (const assignment of ((scopeAssignments ?? []) as AttendanceScopeAssignment[])) {
        // Only include people explicitly scoped to THIS unit. Branch / customer /
        // state scopes on field officers are oversight markers — they must not
        // pull unrelated people into another unit's muster roll.
        if (assignment.scope_type === "unit" && context && assignment.scope_id === context.id) {
          scopeIds.add(assignment.candidate_id);
        }
      }


      const secondaryIds = Array.from(new Set([...(links ?? []).map((l) => l.candidate_id), ...scopeIds]));
      let extra: typeof prim = [];
      if (secondaryIds.length) {
        const { data, error } = await supabase
          .from("candidates")
          .select(rosterSelect)
          .in("id", secondaryIds)
          .eq("is_enabled", true)
          .in("status", [...ATTENDANCE_EMPLOYEE_STATUSES]);
        if (error) throw error;
        extra = data ?? [];
      }
      const all = [...(prim ?? []), ...(extra ?? [])];
      const dedup = Array.from(new Map(all.map((c) => [c.id, c])).values());

      const desigIds = Array.from(
        new Set(dedup.map((c) => c.designation_id).filter(Boolean)),
      ) as string[];
      const { data: desigs } = await supabase
        .from("designations")
        .select("id, name")
        .in("id", desigIds.length ? desigIds : ["00000000-0000-0000-0000-000000000000"]);
      const dMap = new Map((desigs ?? []).map((d) => [d.id, d.name]));

      const mappedEmployees = dedup
        .map((c) => {
          const isNonBillable =
            isNonBillableRoleKey(c.role_key) ||
            (c as { non_billable?: boolean }).non_billable === true;
          return {
            id: c.id,
            employee_code: c.employee_code || "",
            full_name: c.full_name || "",
            designation_id: c.designation_id as string | null,
            designation: (c.designation_id && dMap.get(c.designation_id)) || "",
            employee_type: classifyAttendanceEmployee(c.role_key, (c.designation_id && dMap.get(c.designation_id)) || ""),
            doj: c.preferred_joining_date || "",
            is_non_billable: isNonBillable,
            role_key: (c.role_key || "").toLowerCase(),
          };
        })
        // Muster rolls are billable-only for client units. Non-billable staff
        // (field officers, branch managers, HR, etc.) only appear on the
        // Radiant home-unit muster (UN-RGS-PUNE), where their payroll lives.
        .filter((c) => !c.is_non_billable || unitId === "92541381-14d3-4be6-ae8c-078b79c2e0f1")
        .sort((a, b) => (a.employee_code || a.full_name).localeCompare(b.employee_code || b.full_name));




      return mappedEmployees;
    },
    enabled: Boolean(unit),
  });

  // Active contract: payroll window + designations available on this unit
  const { data: contractInfo } = useQuery({
    queryKey: ["attendance-contract", unitId],
    queryFn: async () => {
      const { data: contracts, error } = await supabase
        .from("client_contracts")
        .select("id, payroll_window_id, start_date, status, record_type")
        .eq("unit_id", unitId)
        .eq("record_type", "client")
        .eq("status", "active")
        .order("start_date", { ascending: true })
        .limit(1);
      if (error) throw error;
      const winId = contracts?.[0]?.payroll_window_id;
      const startDate = contracts?.[0]?.start_date ?? null;
      const contractId = contracts?.[0]?.id ?? null;

      type Win = { id: string; label: string | null; window_start_day: number; window_end_day: number };
      let win: Win | null = null;
      if (winId) {
        const { data: winRow } = await supabase
          .from("payroll_windows")
          .select("id, label, window_start_day, window_end_day")
          .eq("id", winId)
          .maybeSingle();
        win = (winRow as Win | null) ?? null;
      }

      let resources: Array<{
        designationId: string;
        designationName: string;
        quantity: number;
        payrollDayBase: PayrollDayBaseLike | null;
      }> = [];
      if (contractId) {
        const { data: r } = await supabase
          .from("contract_resources")
          .select("designation_id, quantity, sort_order, payroll_day_base_id")
          .eq("contract_id", contractId)
          .order("sort_order", { ascending: true });
        const rows = (r ?? []).filter((x) => x.designation_id) as Array<{
          designation_id: string;
          quantity: number | null;
          payroll_day_base_id: string | null;
        }>;
        const qtyById = new Map<string, number>();
        const pdbIdByDesig = new Map<string, string>();
        const orderedIds: string[] = [];
        for (const row of rows) {
          if (!qtyById.has(row.designation_id)) orderedIds.push(row.designation_id);
          qtyById.set(row.designation_id, (qtyById.get(row.designation_id) ?? 0) + Math.max(1, Number(row.quantity) || 1));
          if (row.payroll_day_base_id && !pdbIdByDesig.has(row.designation_id)) {
            pdbIdByDesig.set(row.designation_id, String(row.payroll_day_base_id));
          }
        }
        const pdbById = new Map<string, PayrollDayBaseLike>();
        const pdbIds = Array.from(new Set(pdbIdByDesig.values()));
        if (pdbIds.length) {
          const { data: bases } = await supabase
            .from("payroll_day_bases")
            .select("id, method, fixed_days, weekly_off_day, included_weekdays")
            .in("id", pdbIds);
          for (const b of (bases ?? []) as Array<Record<string, unknown>>) {
            pdbById.set(String(b.id), {
              method: String(b.method) as PayrollDayBaseLike["method"],
              fixedDays: b.fixed_days == null ? null : Number(b.fixed_days),
              weeklyOffDay: b.weekly_off_day == null ? null : Number(b.weekly_off_day),
              includedWeekdays: Array.isArray(b.included_weekdays)
                ? (b.included_weekdays as unknown[]).map((n) => Number(n)).filter((n) => n >= 0 && n <= 6)
                : null,
            });
          }
        }
        if (orderedIds.length) {
          const { data: ds } = await supabase
            .from("designations")
            .select("id, name")
            .in("id", orderedIds);
          const nameById = new Map((ds ?? []).map((d) => [d.id, d.name]));
          resources = orderedIds.map((id) => ({
            designationId: id,
            designationName: nameById.get(id) ?? "—",
            quantity: qtyById.get(id) ?? 1,
            payrollDayBase: pdbById.get(pdbIdByDesig.get(id) ?? "") ?? null,
          }));
        }
      }
      return { window: win, startDate, contractId, resources };

    },
    enabled: Boolean(unitId),
  });
  const payrollWindow = contractInfo?.window ?? null;
  const contractStartDate = contractInfo?.startDate ?? null;
  const contractDesignations = contractInfo?.resources ?? [];

  const periodCells = useMemo(
    () => buildPeriodCells(year, monthIdx, payrollWindow ?? null),
    [year, monthIdx, payrollWindow],
  );
  const dayCount = periodCells.length;
  const periodStart = periodCells[0]?.date ?? ymd(year, monthIdx, 1);
  const periodEnd = periodCells[periodCells.length - 1]?.date ?? ymd(year, monthIdx, daysInMonth(year, monthIdx));

  // Max "P" days allowed per designation for this period, driven by the
  // contract resource's Payroll Days entry (26 fixed, actual days, actual
  // minus weekly off, custom weekdays...). Anything beyond goes to OT.
  const maxPDaysByDesignation = useMemo(() => {
    const dates = periodCells.map((c) => c.date);
    const m = new Map<string, number>();
    for (const d of contractDesignations) {
      const cap = resolvePayrollDayCount(d.payrollDayBase, dates);
      if (cap != null && cap > 0) m.set(d.designationId, cap);
    }
    return m;
  }, [contractDesignations, periodCells]);


  const queryClient = useQueryClient();
  const { can } = useCurrentPermissions();
  const canApprove = can("attendance", "approve");

  type SheetStatus = "draft" | "submitted" | "approved" | "rejected";
  type SheetRow = {
    id: string;
    status: SheetStatus;
    rejection_reason: string;
    review_proof_url: string | null;
    submitted_by: string | null;
  };
  const sheetQK = ["attendance-sheet", unitId, periodStart, periodEnd];
  const { data: sheet } = useQuery({
    queryKey: sheetQK,
    queryFn: async (): Promise<SheetRow | null> => {
      const { data, error } = await supabase
        .from("attendance_sheets" as never)
        .select("id, status, rejection_reason, review_proof_url, submitted_by")
        .eq("unit_id", unitId)
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as SheetRow | null);
    },
    enabled: Boolean(unitId && periodStart && periodEnd),
  });
  const status: SheetStatus = sheet?.status ?? "draft";

  // Payroll-run state for this period — used to decide whether the
  // "Send for Payroll & Invoice" handoff has happened.
  type PayrollRunLite = { id: string; status: "draft" | "submitted" | "approved" | "rejected" };
  const payrollRunQK = ["attendance-payroll-run", unitId, periodStart, periodEnd];
  const { data: payrollRun } = useQuery({
    queryKey: payrollRunQK,
    enabled: Boolean(unitId && periodStart && periodEnd),
    queryFn: async (): Promise<PayrollRunLite | null> => {
      const { data, error } = await supabase
        .from("payroll_runs" as never)
        .select("id, status")
        .eq("unit_id", unitId)
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as PayrollRunLite | null);
    },
  });
  const sentToPayroll = ["submitted", "approved"].includes(payrollRun?.status ?? "");

  // FO/admin edit when draft or rejected. Approver may also edit inline while
  // the sheet is submitted (HR can fix in place instead of bouncing back).
  const editable = status === "draft" || status === "rejected" || (status === "submitted" && canApprove);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectProof, setRejectProof] = useState<File | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);

  const transitionSheet = useMutation({
    mutationFn: async (next: { status: SheetStatus; reason?: string; proofFile?: File | null }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      const ts = new Date().toISOString();
      const base: Record<string, unknown> = {
        unit_id: unitId,
        period_start: periodStart,
        period_end: periodEnd,
        status: next.status,
      };
      if (next.status === "submitted") { base.submitted_at = ts; base.submitted_by = uid; }
      if (next.status === "approved") { base.approved_at = ts; base.approved_by = uid; }
      if (next.status === "rejected") {
        base.rejected_at = ts; base.rejected_by = uid;
        base.rejection_reason = next.reason ?? "";
        // Upload the optional proof image and store its path.
        if (next.proofFile) {
          setUploadingProof(true);
          try {
            const ext = next.proofFile.name.split(".").pop() || "png";
            const path = `${unitId}/${periodStart}_${periodEnd}/${Date.now()}.${ext}`;
            const up = await supabase.storage.from("attendance-review-proofs").upload(path, next.proofFile, { upsert: true });
            if (up.error) throw up.error;
            base.review_proof_url = path;
          } finally {
            setUploadingProof(false);
          }
        }
      }
      if (next.status === "draft" || next.status === "submitted") {
        // Resubmit after fix — clear prior rejection metadata.
        base.rejection_reason = "";
        base.review_proof_url = null;
      }
      if (sheet?.id) {
        const { error } = await supabase
          .from("attendance_sheets" as never)
          .update(base as never)
          .eq("id", sheet.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("attendance_sheets" as never)
          .insert(base as never);
        if (error) throw error;
      }
      void logActivity({
        module: "Attendance",
        action: next.status === "submitted" ? "submit" : next.status === "approved" ? "approve" : next.status === "rejected" ? "reject" : "reopen",
        entityType: "attendance_sheets",
        entityLabel: `${unitId} ${periodStart} → ${periodEnd}`,
        details: { unit_id: unitId, period_start: periodStart, period_end: periodEnd, status: next.status, reason: next.reason ?? "" },
      });
      // Fan out notifications.
      const link = `/admin/attendance/${unitId}?month=${new Date(periodStart).getMonth()}&year=${new Date(periodStart).getFullYear()}`;
      const unitLabel = ((unit as { customer_name?: string; name?: string } | null | undefined)?.customer_name
        ? `${(unit as { customer_name?: string }).customer_name} — ${(unit as { name?: string }).name ?? ""}`
        : (unit as { name?: string } | null | undefined)?.name ?? "unit").trim();
      const periodLabel = `${MONTH_NAMES[monthIdx]} ${year}`;
      if (next.status === "submitted") {
        // Look up the field officer's display name for a richer approver message.
        let actorName = "A field officer";
        if (uid) {
          const { data: rows } = await supabase.rpc("get_user_display_name" as never, { _user_id: uid } as never);
          const row = Array.isArray(rows) ? (rows[0] as { full_name?: string } | undefined) : undefined;
          if (row?.full_name) actorName = row.full_name;
        }
        void notifyApprovers({
          moduleKey: "attendance",
          type: "attendance_submitted",
          title: `Attendance approval needed — ${unitLabel}`,
          message: `${actorName} submitted attendance for ${unitLabel} (${periodLabel}). Tap to review.`,
          link,
          entityType: "attendance_sheets",
          entityId: sheet?.id ?? "",
        }).catch(() => undefined);
      } else if (next.status === "approved" || next.status === "rejected") {
        void notifyUser(sheet?.submitted_by ?? null, {
          type: next.status === "approved" ? "attendance_approved" : "attendance_rejected",
          title: next.status === "approved" ? `Attendance approved — ${unitLabel}` : `Attendance rejected — ${unitLabel}`,
          message: next.status === "approved"
            ? `Your attendance for ${unitLabel} (${periodLabel}) was approved.`
            : `Your attendance for ${unitLabel} (${periodLabel}) was rejected. Reason: ${next.reason ?? ""}`,
          link,
          entityType: "attendance_sheets",
          entityId: sheet?.id ?? "",
        }).catch(() => undefined);
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: sheetQK });
      queryClient.invalidateQueries({ queryKey: payrollRunQK });
      toast.success(
        vars.status === "submitted" ? "Submitted for approval" :
        vars.status === "approved" ? "Attendance approved — payroll unlocked" :
        vars.status === "rejected" ? "Attendance rejected" : "Reopened for editing",
      );
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Handoff to Payroll & Invoice teams. Creates/updates payroll_runs
  // row for this period with status='submitted' so the payroll and
  // invoice pages surface it as pending, and fans out notifications
  // to both approver groups.
  const sendToPayroll = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      const ts = new Date().toISOString();
      const base: Record<string, unknown> = {
        unit_id: unitId,
        period_start: periodStart,
        period_end: periodEnd,
        status: "submitted",
        submitted_at: ts,
        submitted_by: uid,
        rejection_reason: null,
      };
      if (payrollRun?.id) {
        const { error } = await supabase.from("payroll_runs" as never).update(base as never).eq("id", payrollRun.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payroll_runs" as never).insert(base as never);
        if (error) throw error;
      }
      void logActivity({
        module: "Attendance",
        action: "send_to_payroll",
        entityType: "attendance_sheets",
        entityLabel: `${unitId} ${periodStart} → ${periodEnd}`,
        details: { unit_id: unitId, period_start: periodStart, period_end: periodEnd },
      });
      const unitLabel = ((unit as { customer_name?: string; name?: string } | null | undefined)?.customer_name
        ? `${(unit as { customer_name?: string }).customer_name} — ${(unit as { name?: string }).name ?? ""}`
        : (unit as { name?: string } | null | undefined)?.name ?? "unit").trim();
      const periodLabel = `${MONTH_NAMES[monthIdx]} ${year}`;
      let actorName = "An approver";
      if (uid) {
        const { data: rows } = await supabase.rpc("get_user_display_name" as never, { _user_id: uid } as never);
        const row = Array.isArray(rows) ? (rows[0] as { full_name?: string } | undefined) : undefined;
        if (row?.full_name) actorName = row.full_name;
      }
      const payrollLink = `/admin/payroll/${unitId}?start=${periodStart}&end=${periodEnd}`;
      const invoiceLink = `/admin/invoice/${unitId}?start=${periodStart}&end=${periodEnd}`;
      await Promise.all([
        notifyApprovers({
          moduleKey: "payroll",
          type: "payroll_pending",
          title: `Payroll ready to process — ${unitLabel}`,
          message: `${actorName} sent ${unitLabel} (${periodLabel}) for payroll. Tap to open.`,
          link: payrollLink,
          entityType: "payroll_runs",
          entityId: payrollRun?.id ?? "",
        }).catch(() => undefined),
        notifyApprovers({
          moduleKey: "invoice",
          type: "invoice_pending",
          title: `Invoice ready to generate — ${unitLabel}`,
          message: `${actorName} sent ${unitLabel} (${periodLabel}) for invoicing. Tap to open.`,
          link: invoiceLink,
          entityType: "payroll_runs",
          entityId: payrollRun?.id ?? "",
        }).catch(() => undefined),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollRunQK });
      toast.success("Sent for Payroll & Invoice");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to send"),
  });

  // Reopen after handoff — clears the payroll_runs handoff back to draft
  // and moves the attendance sheet back to draft in one click.
  const reopenAfterHandoff = useMutation({
    mutationFn: async () => {
      if (payrollRun?.id) {
        const { error } = await supabase
          .from("payroll_runs" as never)
          .update({ status: "draft", submitted_at: null, submitted_by: null, rejection_reason: null } as never)
          .eq("id", payrollRun.id);
        if (error) throw error;
      }
      await new Promise<void>((resolve, reject) => {
        transitionSheet.mutate(
          { status: "draft" },
          { onSuccess: () => resolve(), onError: (e) => reject(e) },
        );
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollRunQK });
      queryClient.invalidateQueries({ queryKey: sheetQK });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to reopen"),
  });

  // Approval IS the handoff: once the sheet is approved, payroll & invoice are
  // notified automatically — no separate "send" click.
  const autoHandoffRef = useRef<string | null>(null);
  const handoffKey = `${unitId}:${periodStart}:${periodEnd}`;
  useEffect(() => {
    if (status !== "approved" || !canApprove || sentToPayroll) return;
    if (sendToPayroll.isPending || autoHandoffRef.current === handoffKey) return;
    autoHandoffRef.current = handoffKey;
    sendToPayroll.mutate();
  }, [status, canApprove, sentToPayroll, handoffKey, sendToPayroll]);

  const { data: codes = [] } = useQuery({
    queryKey: ["attendance-codes-enabled"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_codes")
        .select("id, code, label, color, counts_as_present, is_paid, is_leave, day_value, sort_order")
        .eq("enabled", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AttendanceCode[];
    },
  });

  const codeMap = useMemo(() => new Map(codes.map((c) => [c.code, c])), [codes]);

  // Multi-designation master: any additional designations a candidate carries
  const candidateIds = useMemo(() => (employees ?? []).map((e) => e.id), [employees]);
  const { data: candDesignations = [] } = useQuery({
    queryKey: ["attendance-candidate-designations", unitId, candidateIds.join(",")],
    queryFn: async () => {
      if (!candidateIds.length) return [] as Array<{ candidate_id: string; designation_id: string; is_primary: boolean }>;
      const { data, error } = await supabase
        .from("candidate_designations" as never)
        .select("candidate_id, designation_id, is_primary")
        .in("candidate_id", candidateIds);
      if (error) throw error;
      return (data ?? []) as Array<{ candidate_id: string; designation_id: string; is_primary: boolean }>;
    },
    enabled: candidateIds.length > 0,
  });


  const entriesQK = ["attendance-entries-v4", unitId, periodStart, periodEnd];
  const { data: entries = [] } = useQuery({
    queryKey: entriesQK,
    queryFn: async () => {
      return fetchAttendanceEntriesForPeriod({ unitId, start: periodStart, end: periodEnd }) as Promise<EntryRow[]>;
    },
    enabled: Boolean(unitId),
  });

  // --- Self-attendance punches (guards + non-billable employees) ---
  // Employees mapped to this unit can record attendance through the self-punch
  // flow. Their Punch In / Punch Out rows are derived into muster entries using
  // the duty-duration rules: <4h = A, 4h–<8h = HD, >=8h = P.
  const selfPunchCandidateIds = useMemo(
    () => (employees ?? []).map((e) => e.id),
    [employees],
  );
  const selfPunchQK = ["attendance-self-punches", unitId, periodStart, periodEnd, selfPunchCandidateIds.join(",")];
  const { data: selfPunches = [] } = useQuery({
    queryKey: selfPunchQK,
    queryFn: async () => {
      if (!selfPunchCandidateIds.length) return [] as Array<{
        candidate_id: string;
        punch_date: string;
        check_in_at: string | null;
        check_out_at: string | null;
      }>;
      const { data, error } = await supabase
        .from("self_attendance_punches")
        .select("candidate_id, punch_date, check_in_at, check_out_at")
        .in("candidate_id", selfPunchCandidateIds)
        .gte("punch_date", periodStart)
        .lte("punch_date", periodEnd);
      if (error) throw error;
      return data ?? [];
    },
    enabled: selfPunchCandidateIds.length > 0,
  });

  // Contractual shift hours (8h / 12h) per designation for this unit — the
  // foundation for attendance codes and overtime.
  const { data: shiftMap } = useQuery({
    queryKey: ["shift-hours-map", unitId],
    queryFn: () => fetchShiftHoursMap([unitId]),
    enabled: Boolean(unitId),
  });

  const derivedSelfEntries = useMemo(() => {
    const desigByCand = new Map<string, string | null>(
      (employees ?? []).map((e) => [e.id, e.designation_id ?? null]),
    );
    const today = new Date().toISOString().slice(0, 10);
    const rows: EntryRow[] = [];
    for (const p of selfPunches) {
      if (!p.check_in_at) continue;
      // Wait for checkout before counting attendance.
      // If the punch date has already passed and the officer never checked out,
      // treat that day as Absent. For today with no checkout yet, skip entirely
      // so the cell stays blank until they check out.
      if (!p.check_out_at) {
        if (p.punch_date < today) {
          rows.push({
            candidate_id: p.candidate_id,
            designation_id: desigByCand.get(p.candidate_id) ?? null,
            entry_date: p.punch_date,
            code: "A",
            ot_hours: 0,
          });
        }
        continue;
      }
      const mins = (new Date(p.check_out_at).getTime() - new Date(p.check_in_at).getTime()) / 60000;
      const hours = Math.max(0, mins / 60);
      const designationId = desigByCand.get(p.candidate_id) ?? null;
      const shift = shiftHoursFor(shiftMap, unitId, designationId);
      const otDays = overtimeDaysForShift(hours, shift);
      const code = attendanceCodeForShift(hours, shift);
      rows.push({
        candidate_id: p.candidate_id,
        designation_id: designationId,
        entry_date: p.punch_date,
        code,
        ot_hours: otDays,
      });
    }
    return rows;
  }, [selfPunches, employees, shiftMap, unitId]);

  const entryMap = useMemo(() => {
    const m = new Map<string, EntryRow>();
    // Stored entries first — self-punch derived entries are the source of truth
    // for employees using app attendance on that date.
    for (const e of entries) m.set(`${rowKey(e.candidate_id, e.designation_id)}|${e.entry_date}`, e);
    for (const e of derivedSelfEntries) m.set(`${rowKey(e.candidate_id, e.designation_id)}|${e.entry_date}`, e);
    return m;
  }, [entries, derivedSelfEntries]);

  // Persist derived self-punch entries into attendance_entries so payroll
  // picks them up. Upserts only rows that are missing or differ from punches.
  useEffect(() => {
    if (!unitId || !derivedSelfEntries.length) return;
    const toPersist = derivedSelfEntries.filter((e) => {
      const existing = entries.find(
        (x) =>
          x.candidate_id === e.candidate_id &&
          x.entry_date === e.entry_date &&
          (x.designation_id ?? null) === (e.designation_id ?? null),
      );
      return !existing || existing.code !== e.code || Number(existing.ot_hours) !== Number(e.ot_hours);
    });
    if (!toPersist.length) return;
    let cancelled = false;
    (async () => {
      try {
        const payload = toPersist.map((e) => ({
          unit_id: unitId,
          candidate_id: e.candidate_id,
          designation_id: e.designation_id,
          entry_date: e.entry_date,
          code: e.code,
          ot_hours: e.ot_hours,
        }));
        const { error } = await supabase
          .from("attendance_entries")
          .upsert(payload, { onConflict: "unit_id,candidate_id,designation_id,entry_date" });
        if (error) throw error;
        if (!cancelled) queryClient.invalidateQueries({ queryKey: entriesQK });
      } catch {
        // Silently ignore — the derived view still displays correctly.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, derivedSelfEntries, entries]);

  // Extra (candidate, designation) rows the user added locally — persisted as soon as an entry is saved.
  const [extraRows, setExtraRows] = useState<Set<string>>(new Set());

  // ---- Map an employee onto an unassigned (vacant) contracted slot ----
  const [mapSlot, setMapSlot] = useState<{ designationId: string | null; designationName: string } | null>(null);
  const [mapQuery, setMapQuery] = useState("");
  const [mapSaving, setMapSaving] = useState(false);

  const mapSearch = mapQuery.trim();
  const { data: mapResults, isFetching: mapSearching } = useQuery({
    queryKey: ["attendance-map-lookup", unitId, mapSearch],
    enabled: Boolean(mapSlot) && mapSearch.length >= 2,
    queryFn: async () => {
      const like = mapSearch.replace(/[%,]/g, " ");
      const { data, error } = await supabase
        .from("candidates")
        .select("id, full_name, employee_code, candidate_code, designation_id, preferred_joining_date")
        .eq("is_enabled", true)
        .in("status", [...ATTENDANCE_EMPLOYEE_STATUSES])
        .or(`full_name.ilike.%${like}%,employee_code.ilike.%${like}%,candidate_code.ilike.%${like}%`)
        .order("full_name")
        .limit(30);
      if (error) throw error;
      const rows = data ?? [];
      const desigIds = Array.from(new Set(rows.map((r) => r.designation_id).filter(Boolean))) as string[];
      const { data: desigs } = await supabase
        .from("designations")
        .select("id, name")
        .in("id", desigIds.length ? desigIds : ["00000000-0000-0000-0000-000000000000"]);
      const dMap = new Map((desigs ?? []).map((d) => [d.id as string, d.name as string]));
      return rows.map((r) => ({
        id: r.id as string,
        full_name: (r.full_name as string) || "—",
        employee_code: (r.employee_code as string) || (r.candidate_code as string) || "—",
        designation_id: (r.designation_id as string | null) ?? null,
        designation: (r.designation_id && dMap.get(r.designation_id as string)) || "—",
        doj: (r.preferred_joining_date as string | null) || "",
      }));
    },
  });

  const rosterIds = useMemo(() => new Set((employees ?? []).map((e) => e.id)), [employees]);

  const mapEmployeeToSlot = async (cand: { id: string; full_name: string; designation_id: string | null }) => {
    if (!mapSlot) return;
    setMapSaving(true);
    try {
      const { error } = await supabase
        .from("candidate_units")
        .upsert({ candidate_id: cand.id, unit_id: unitId }, { onConflict: "candidate_id,unit_id" });
      if (error) throw error;

      // If the slot's designation differs from the employee's own, surface the
      // line on the contracted designation so the slot is actually filled.
      if (mapSlot.designationId && mapSlot.designationId !== cand.designation_id) {
        setExtraRows((prev) => new Set(prev).add(rowKey(cand.id, mapSlot.designationId)));
      }

      await queryClient.invalidateQueries({ queryKey: ["attendance-roster-v5", unitId] });
      logActivity({
        module: "Attendance",
        action: "update",
        entityType: "muster_slot",
        entityId: cand.id,
        entityLabel: `${cand.full_name} → ${mapSlot.designationName} @ ${unit?.name ?? unitId}`,
      });
      toast.success(`${cand.full_name} mapped to ${mapSlot.designationName}`);
      setMapSlot(null);
      setMapQuery("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to map employee");
    } finally {
      setMapSaving(false);
    }
  };


  // Derived list of muster rows: one per (candidate, designation)
  const musterRows = useMemo(() => {
    const out: Array<{
      key: string;
      candidateId: string;
      designationId: string | null;
      designationName: string;
      emp: NonNullable<typeof employees>[number];
      isPrimary: boolean;
      /** Contracted designation slot with nobody mapped yet — read-only placeholder. */
      vacant?: boolean;
    }> = [];
    const seen = new Set<string>();
    const desigNameMap = new Map(contractDesignations.map((d) => [d.designationId, d.designationName]));

    for (const emp of employees ?? []) {
      // Primary row from candidate's own designation
      const primaryKey = rowKey(emp.id, emp.designation_id);
      out.push({
        key: primaryKey,
        candidateId: emp.id,
        designationId: emp.designation_id,
        designationName: emp.designation || "—",
        emp,
        isPrimary: true,
      });
      seen.add(primaryKey);

      // Additional designations from candidate master are intentionally NOT auto-added
      // here. They only surface in the muster when (a) attendance entries exist for that
      // (candidate, designation) pair in this period, or (b) the user explicitly adds a
      // line via "Add line item". This keeps the sheet free of empty designation rows.



      // Additional rows from any entries with a different designation

      for (const e of entries) {
        if (e.candidate_id !== emp.id) continue;
        const k = rowKey(e.candidate_id, e.designation_id);
        if (seen.has(k)) continue;
        seen.add(k);
        const dName = (e.designation_id && desigNameMap.get(e.designation_id)) || "—";
        out.push({
          key: k,
          candidateId: emp.id,
          designationId: e.designation_id,
          designationName: dName,
          emp,
          isPrimary: false,
        });
      }

      // Locally added extras for this candidate
      for (const xk of extraRows) {
        if (!xk.startsWith(emp.id + "|")) continue;
        if (seen.has(xk)) continue;
        seen.add(xk);
        const did = xk.split("|")[1];
        const designationId = did === NULL_DESIG ? null : did;
        const dName = (designationId && desigNameMap.get(designationId)) || "—";
        out.push({
          key: xk,
          candidateId: emp.id,
          designationId,
          designationName: dName,
          emp,
          isPrimary: false,
        });
      }
    }

    // Contracted designations always appear on the muster, even with nobody
    // mapped. For each designation we render `quantity` slots; slots already
    // filled by mapped employees are subtracted, the remainder show as
    // read-only vacant lines (no employee name / code / DOJ).
    const filledByDesignation = new Map<string, number>();
    for (const r of out) {
      if (!r.designationId) continue;
      filledByDesignation.set(r.designationId, (filledByDesignation.get(r.designationId) ?? 0) + 1);
    }
    for (const d of contractDesignations) {
      const filled = filledByDesignation.get(d.designationId) ?? 0;
      const vacantCount = Math.max(0, (d.quantity ?? 1) - filled);
      for (let i = 0; i < vacantCount; i += 1) {
        out.push({
          key: `vacant|${d.designationId}|${i}`,
          candidateId: "",
          designationId: d.designationId,
          designationName: d.designationName,
          emp: {
            id: "",
            full_name: "",
            employee_code: "",
            designation_id: d.designationId,
            designation: d.designationName,
            doj: null,
          } as unknown as NonNullable<typeof employees>[number],
          isPrimary: true,
          vacant: true,
        });
      }
    }

    // Group the sheet by designation so vacant slots sit with their peers.
    return out
      .map((r, i) => ({ r, i }))
      .sort(
        (a, b) =>
          a.r.designationName.localeCompare(b.r.designationName) ||
          Number(a.r.vacant ?? false) - Number(b.r.vacant ?? false) ||
          a.i - b.i,
      )
      .map((x) => x.r);
  }, [employees, entries, extraRows, contractDesignations]);

  // Client-side filter: name / employee_code / designation substring match.
  const visibleMusterRows = useMemo(() => {
    const q = musterQuery.trim().toLowerCase();
    if (!q) return musterRows;
    return musterRows.filter((r) => {
      const hay = `${r.emp.full_name ?? ""} ${r.emp.employee_code ?? ""} ${r.designationName ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [musterRows, musterQuery]);


  // ---- Mutations ----


  const upsertEntries = async (
    candidate_id: string,
    designation_id: string | null,
    rows: Array<{ entry_date: string; code: string; ot_hours: number }>,
  ) => {
    const filtered = rows.filter((r) => r.entry_date <= todayStr);
    if (filtered.length === 0) {
      toast.error("All selected dates are in the future — nothing marked");
      return 0;
    }

    // ---- Payroll-days cap: max present days = contract's Payroll Days base.
    // Present marks beyond the cap are rejected — the user must record those
    // extra days as overtime hours on the OT row instead.
    const dayValueOf = (code: string) => {
      const c = codeMap.get(code);
      if (!c || !c.counts_as_present) return 0;
      const v = c.day_value == null || Number.isNaN(Number(c.day_value)) ? 1 : Number(c.day_value);
      return v;
    };
    const cap = designation_id ? maxPDaysByDesignation.get(designation_id) ?? null : null;
    let capped = filtered;
    let rejectedDays = 0;
    if (cap != null) {
      const rk = rowKey(candidate_id, designation_id);
      const touched = new Set(filtered.map((r) => r.entry_date));
      let used = 0;
      for (const cell of periodCells) {
        if (touched.has(cell.date)) continue;
        const e = entryMap.get(`${rk}|${cell.date}`);
        if (!e) continue;
        used += dayValueOf(e.code);
      }
      capped = [...filtered]
        .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
        .filter((r) => {
          const dv = dayValueOf(r.code);
          if (dv <= 0) return true;
          if (used + dv <= cap) {
            used += dv;
            return true;
          }
          rejectedDays += dv;
          return false;
        });
    }

    if (capped.length === 0) {
      toast.error(
        `Payroll days limit (${cap}) reached — mark the extra ${rejectedDays} day${rejectedDays === 1 ? "" : "s"} as OT hours instead`,
      );
      return 0;
    }

    const payload = capped.map((r) => ({
      unit_id: unitId,
      candidate_id,
      designation_id,
      entry_date: r.entry_date,
      code: r.code,
      ot_hours: r.ot_hours,
    }));

    const { error } = await supabase
      .from("attendance_entries")
      .upsert(payload, { onConflict: "unit_id,candidate_id,designation_id,entry_date" });
    if (error) throw error;
    if (rejectedDays > 0) {
      toast.warning(
        `Payroll days limit (${cap}) reached — ${rejectedDays} day${rejectedDays === 1 ? "" : "s"} not marked; record them as OT hours`,
      );
    }
    return capped.length;
  };


  const confirm = useConfirm();
  const [clearingAll, setClearingAll] = useState(false);
  const handleClearAll = async () => {
    if (!editable) { toast.error("Sheet is locked"); return; }
    const ok = await confirm({
      title: "Clear all attendance?",
      description: `This deletes every attendance entry on this sheet for ${periodStart} → ${periodEnd}. This cannot be undone.`,
      confirmText: "Clear all",
      destructive: true,
    });
    if (!ok) return;
    setClearingAll(true);
    try {
      const { error, count } = await supabase
        .from("attendance_entries")
        .delete({ count: "exact" })
        .eq("unit_id", unitId)
        .gte("entry_date", periodStart)
        .lte("entry_date", periodEnd);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: entriesQK });
      setUncertainCells(new Set());
      const n = count ?? 0;
      toast.success(`Cleared ${n} entr${n === 1 ? "y" : "ies"}`);
      logActivity({
        module: "Attendance",
        action: "Clear all entries",
        details: { unit_id: unitId, period_start: periodStart, period_end: periodEnd, deleted: n },
      }).catch(() => {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear");
    } finally {
      setClearingAll(false);
    }
  };


  // Drag-to-select state — keyed by row (candidate|designation)
  const [dragRowKey, setDragRowKey] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRowKey, setPickerRowKey] = useState<string | null>(null);
  const [pickerDates, setPickerDates] = useState<string[]>([]);

  const [otDragRowKey, setOtDragRowKey] = useState<string | null>(null);
  const [isOtDragging, setIsOtDragging] = useState(false);
  const [otSelectedDates, setOtSelectedDates] = useState<Set<string>>(new Set());
  const [otPickerOpen, setOtPickerOpen] = useState(false);
  const [otPickerRowKey, setOtPickerRowKey] = useState<string | null>(null);
  const [otPickerDates, setOtPickerDates] = useState<string[]>([]);

  // ---- OCR / Excel upload state ----
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadKind, setUploadKind] = useState<"image" | "excel" | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [processingOcr, setProcessingOcr] = useState(false);
  const [uncertainCells, setUncertainCells] = useState<Set<string>>(new Set());
  const [ocrSummary, setOcrSummary] = useState<string | null>(null);
  const [uploadReadyToContinue, setUploadReadyToContinue] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const runOcr = useServerFn(extractAttendanceFromImage);

  const detectKind = (file: File): "image" | "excel" | null => {
    const name = file.name.toLowerCase();
    if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|heif|bmp|gif)$/.test(name)) return "image";
    if (/\.(xlsx|xls|xlsm|csv|ods)$/.test(name)) return "excel";
    return null;
  };

  const onPickUploadFile = (file: File | null) => {
    setUploadFile(file);
    setUploadPreview(null);
    setUploadKind(null);
    setOcrSummary(null);
    setUploadReadyToContinue(false);
    if (!file) return;
    const kind = detectKind(file);
    if (!kind) { toast.error("Unsupported file. Choose an image or Excel/CSV file."); return; }
    setUploadKind(kind);
    if (kind === "image") {
      // Downscale large photos so OCR upload stays fast and request body small
      downscaleImage(file, 1600, 0.85)
        .then((dataUrl) => setUploadPreview(dataUrl))
        .catch(() => {
          const reader = new FileReader();
          reader.onload = () => setUploadPreview(String(reader.result));
          reader.readAsDataURL(file);
        });
    } else {
      setUploadPreview(file.name);
    }
  };

  const processAttendanceImage = async () => {
    if (!uploadPreview) { toast.error("Choose an image first"); return; }
    if (!editable) { toast.error("Sheet is locked"); return; }
    if (!musterRows.length) { toast.error("No employees in this muster"); return; }
    if (!codes.length) { toast.error("No attendance codes configured"); return; }
    setProcessingOcr(true);
    setOcrSummary(null);
    setUploadReadyToContinue(false);
    try {
      // Build the set of allowed (candidate × designation) pairs. The roster
      // sent to OCR includes EVERY designation on this unit's active contract
      // for each candidate, not just the row blocks currently on the muster —
      // so OCR can place a guard's OT under "Office Assistant" even if the FO
      // never manually added that row block yet. New pairs picked up from the
      // sheet are auto-created on apply. Out-of-contract designations are
      // blocked with a warning toast.
      const pairByKey = new Map<string, typeof musterRows[number]>();
      const candidatePairs = new Map<string, Array<typeof musterRows[number]>>();
      for (const mr of musterRows) {
        pairByKey.set(`${mr.candidateId}|${mr.designationId ?? ""}`, mr);
        const list = candidatePairs.get(mr.candidateId) ?? [];
        list.push(mr);
        candidatePairs.set(mr.candidateId, list);
      }
      // Synthetic pairs for contract designations not already on the muster.
      // These are "virtual" musterRow stand-ins used purely for OCR resolution
      // + upsert; the real row block appears after entries are saved and
      // musterRows re-derives.
      const candidatesById = new Map(musterRows.map((m) => [m.candidateId, m]));
      const employeesPayload: Array<{ id: string; name: string; employee_code: string | null; designation: string | null; designation_id: string }> = [];
      const seenPair = new Set<string>();
      for (const mr of musterRows) {
        const k = `${mr.candidateId}|${mr.designationId ?? ""}`;
        if (seenPair.has(k)) continue;
        seenPair.add(k);
        employeesPayload.push({
          id: mr.candidateId,
          name: mr.emp.full_name,
          employee_code: mr.emp.employee_code ?? null,
          designation: mr.designationName ?? null,
          designation_id: mr.designationId ?? "",
        });
      }
      for (const [candidateId, anyMr] of candidatesById) {
        for (const d of contractDesignations) {
          const k = `${candidateId}|${d.designationId}`;
          if (seenPair.has(k)) continue;
          seenPair.add(k);
          employeesPayload.push({
            id: candidateId,
            name: anyMr.emp.full_name,
            employee_code: anyMr.emp.employee_code ?? null,
            designation: d.designationName,
            designation_id: d.designationId,
          });
          // Virtual musterRow for resolution / upsert (mirrors structure of real rows).
          pairByKey.set(k, {
            ...anyMr,
            key: `${candidateId}|${d.designationId}`,
            designationId: d.designationId,
            designationName: d.designationName,
            isPrimary: false,
          });
        }
      }

      const result = await runOcr({
        data: {
          imageDataUrl: uploadPreview,
          dates: periodCells.map((c) => c.date),
          employees: employeesPayload,
          codes: codes.map((c) => ({ code: c.code, label: c.label })),
        },
      });

      const validDates = new Set(periodCells.map((c) => c.date));
      const pairKey = (cid: string, did: string | null) => `${cid}|${did ?? ""}`;
      const blockedDesigNames = new Set<string>();
      const resolvePairKey = (cid: string, did: string | null): string | null => {
        const direct = pairKey(cid, did);
        if (pairByKey.has(direct)) return direct;
        // OCR returned a designation that isn't a resource on this unit's
        // contract — block per "Block with a warning" rule.
        if (did) {
          // Try to label it for the warning.
          const dname = contractDesignations.find((d) => d.designationId === did)?.designationName ?? did;
          blockedDesigNames.add(dname);
          return null;
        }
        // OCR couldn't place a designation at all — fall back to primary.
        const list = candidatePairs.get(cid);
        if (!list || list.length === 0) return null;
        const primary = list.find((m) => m.isPrimary) ?? list[0];
        return primary.key;
      };
      const byPair = new Map<string, typeof result.rows>();
      const uncertainNext = new Set<string>();
      const totalsMismatchPairs = new Set<string>();
      let confidentCount = 0;
      let uncertainCount = 0;

      for (const r of result.rows) {
        if (!validDates.has(r.entry_date)) continue;
        if (r.entry_date > todayStr) continue;
        const pk = resolvePairKey(r.candidate_id, r.designation_id);
        if (!pk) continue;
        const mr = pairByKey.get(pk)!;
        const cellKey = `${mr.key}|${r.entry_date}`;
        if (r.confident && r.code) {
          const list = byPair.get(pk) ?? [];
          list.push(r);
          byPair.set(pk, list);
          confidentCount += 1;
        } else {
          uncertainNext.add(cellKey);
          uncertainCount += 1;
        }
      }

      if (blockedDesigNames.size) {
        toast.warning(
          `Skipped rows for ${Array.from(blockedDesigNames).join(", ")} — not on this unit's active contract. Add the designation to the contract first, then re-import.`,
          { duration: 8000 },
        );
      }

      const computeImportedSummary = (rows: Array<{ entry_date: string; code: string; ot_hours: number }>): OcrRowSummary => {
        let pDays = 0;
        let otherPaidDays = 0;
        let phCount = 0;
        let otHours = 0;
        for (const row of rows) {
          otHours += Number(row.ot_hours) || 0;
          const meta = codeMap.get(row.code);
          if (!meta) continue;
          if (row.code === "PH") {
            phCount += 1;
            continue;
          }
          const dayValue = meta.day_value == null || Number.isNaN(Number(meta.day_value)) ? 1 : Number(meta.day_value);
          if (meta.counts_as_present) pDays += dayValue;
          else if (meta.is_paid) otherPaidDays += dayValue;
        }
        const otDays = roundHalf(otHours);
        const tDays = roundHalf(pDays + otherPaidDays + phCount * 2 + otDays);
        return {
          candidate_id: "",
          p_days: roundHalf(pDays),
          ot_days: otDays,
          t_days: tDays,
          confident: true,
        };
      };

      const summaryByPair = new Map(
        (result.row_summaries ?? []).map((summary) => {
          const pk = resolvePairKey(summary.candidate_id, summary.designation_id) ?? pairKey(summary.candidate_id, summary.designation_id);
          return [pk, summary as OcrRowSummary];
        }),
      );

      for (const [pk, rows] of Array.from(byPair.entries())) {
        const expected = summaryByPair.get(pk);
        if (!expected?.confident) continue;
        const actual = computeImportedSummary(rows);
        const totalsCheck = isSummaryClose(actual, expected);
        if (!totalsCheck.ok) {
          totalsMismatchPairs.add(pk);
        }
      }

      for (const pk of totalsMismatchPairs) {
        const mr = pairByKey.get(pk);
        if (!mr) continue;
        for (const cell of periodCells) {
          uncertainNext.add(`${mr.key}|${cell.date}`);
        }
      }

      const sheetPairKeys = new Set<string>([
        ...summaryByPair.keys(),
        ...byPair.keys(),
      ]);

      // Sheet-authoritative: for any candidate present in the uploaded sheet,
      // wipe ALL prior entries for the period (across every designation),
      // then re-write only what the sheet shows. Prevents phantom rows under
      // a designation the sheet didn't include.
      const candidatesInSheet = new Set<string>();
      for (const pk of sheetPairKeys) {
        const mr = pairByKey.get(pk);
        if (mr) candidatesInSheet.add(mr.candidateId);
      }
      if (candidatesInSheet.size) {
        const { error } = await supabase
          .from("attendance_entries")
          .delete()
          .eq("unit_id", unitId)
          .in("candidate_id", Array.from(candidatesInSheet))
          .gte("entry_date", periodStart)
          .lte("entry_date", periodEnd);
        if (error) throw error;
      }

      confidentCount = Array.from(byPair.values()).reduce((sum, rows) => sum + rows.length, 0);
      uncertainCount = uncertainNext.size;

      for (const [pk, rows] of byPair.entries()) {
        const mr = pairByKey.get(pk)!;
        await upsertEntries(
          mr.candidateId,
          mr.designationId,
          rows.map((r) => ({ entry_date: r.entry_date, code: r.code, ot_hours: r.ot_hours })),
        );
      }
      await queryClient.invalidateQueries({ queryKey: entriesQK });

      setUncertainCells((prev) => {
        const next = new Set(prev);
        for (const k of uncertainNext) next.add(k);
        return next;
      });

      const summary = `${confidentCount} cell${confidentCount === 1 ? "" : "s"} auto-filled · ${uncertainCount} flagged for review${totalsMismatchPairs.size ? ` · ${totalsMismatchPairs.size} row${totalsMismatchPairs.size === 1 ? "" : "s"} marked for totals review` : ""}${result.unmatched_names.length ? ` · ${result.unmatched_names.length} unmatched row${result.unmatched_names.length === 1 ? "" : "s"}` : ""}`;
      setOcrSummary(summary);
      setUploadReadyToContinue(true);
      toast.success(summary);
      logActivity({
        module: "Attendance",
        action: "Upload attendance image (OCR)",
        details: { confidentCount, uncertainCount, unit_id: unitId },
      }).catch(() => {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "OCR failed");
    } finally {
      setProcessingOcr(false);
    }
  };

  const processAttendanceExcel = async () => {
    if (!uploadFile) { toast.error("Choose a file first"); return; }
    if (!editable) { toast.error("Sheet is locked"); return; }
    if (!musterRows.length) { toast.error("No employees in this muster"); return; }
    if (!codes.length) { toast.error("No attendance codes configured"); return; }
    setProcessingOcr(true);
    setOcrSummary(null);
    setUploadReadyToContinue(false);
    try {
      const buf = await uploadFile.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

      const validDateSet = new Set(periodCells.map((c) => c.date));
      const dayToDate = new Map<number, string>();
      for (const c of periodCells) dayToDate.set(Number(c.date.slice(8, 10)), c.date);

      const toIsoDate = (v: any): string | null => {
        if (v == null) return null;
        if (v instanceof Date) {
          const y = v.getFullYear();
          const m = String(v.getMonth() + 1).padStart(2, "0");
          const d = String(v.getDate()).padStart(2, "0");
          const iso = `${y}-${m}-${d}`;
          return validDateSet.has(iso) ? iso : null;
        }
        const s = String(v).trim();
        if (!s) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return validDateSet.has(s) ? s : null;
        const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
        if (m1) {
          const dd = Number(m1[1]); const mm = Number(m1[2]);
          let yy = Number(m1[3]); if (yy < 100) yy += 2000;
          const iso = `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
          return validDateSet.has(iso) ? iso : null;
        }
        if (/^\d{1,2}$/.test(s)) return dayToDate.get(Number(s)) ?? null;
        return null;
      };

      let headerRowIdx = -1;
      let headerDates: Array<{ col: number; date: string }> = [];
      for (let r = 0; r < Math.min(aoa.length, 25); r++) {
        const row = aoa[r] || [];
        const hits: Array<{ col: number; date: string }> = [];
        for (let c = 0; c < row.length; c++) {
          const iso = toIsoDate(row[c]);
          if (iso) hits.push({ col: c, date: iso });
        }
        if (hits.length > headerDates.length) {
          headerDates = hits;
          headerRowIdx = r;
        }
      }
      if (headerRowIdx < 0 || headerDates.length === 0) {
        throw new Error("Could not find date columns. Header row must contain dates or day numbers from this period.");
      }

      const primaryByCandidate = new Map<string, typeof musterRows[number]>();
      for (const mr of musterRows) {
        if (mr.isPrimary && !primaryByCandidate.has(mr.candidateId)) {
          primaryByCandidate.set(mr.candidateId, mr);
        }
      }
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const byName = new Map<string, typeof musterRows[number]>();
      const byCode = new Map<string, typeof musterRows[number]>();
      for (const mr of primaryByCandidate.values()) {
        byName.set(norm(mr.emp.full_name), mr);
        if (mr.emp.employee_code) byCode.set(norm(String(mr.emp.employee_code)), mr);
      }

      // Locate the Designation column on the header row so we can route each
      // row to a (candidate, designation) pair instead of always the primary.
      const headerRow = aoa[headerRowIdx] || [];
      let designationCol = -1;
      for (let c = 0; c < headerRow.length; c++) {
        const h = norm(String(headerRow[c] ?? ""));
        if (!h) continue;
        if (h.includes("designation") || h.includes("department")) {
          designationCol = c;
          break;
        }
      }
      const contractDesigByNorm = new Map(
        contractDesignations.map((d) => [norm(d.designationName), d]),
      );
      // Letter-sorted key catches single-letter transpositions/typos like
      // "OPREATOR" vs "OPERATOR" (same letters, different order) without
      // doing broad fuzzy matching across unrelated designations.
      const sortLetters = (s: string) => s.split("").sort().join("");
      const contractDesigBySorted = new Map<string, typeof contractDesignations[number]>();
      for (const d of contractDesignations) {
        const key = sortLetters(norm(d.designationName));
        if (!contractDesigBySorted.has(key)) contractDesigBySorted.set(key, d);
      }
      const fuzzyDesigMatch = (n: string) => {
        const exact = contractDesigByNorm.get(n);
        if (exact) return exact;
        return contractDesigBySorted.get(sortLetters(n));
      };


      const codeSet = new Map<string, string>();
      for (const c of codes) codeSet.set(c.code.toUpperCase(), c.code);

      const byPair = new Map<string, { mr: typeof musterRows[number]; rows: Array<{ entry_date: string; code: string; ot_hours: number }> }>();
      const unmatchedNames: string[] = [];
      const designationsNotOnContract = new Set<string>();
      const candidatesInSheet = new Set<string>();
      let secondaryDesigRowCount = 0;
      let filled = 0;

      for (let r = headerRowIdx + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        if (!row.some((v) => v != null && String(v).trim() !== "")) continue;

        let mr: typeof musterRows[number] | undefined;
        let labelCell = "";
        for (let c = 0; c < Math.min(row.length, 6); c++) {
          const v = row[c];
          if (v == null) continue;
          const s = String(v).trim();
          if (!s) continue;
          if (!labelCell) labelCell = s;
          const n = norm(s);
          if (!n) continue;
          if (byCode.has(n)) { mr = byCode.get(n); break; }
          if (byName.has(n)) { mr = byName.get(n); break; }
        }
        if (!mr) {
          const joined = norm(row.slice(0, 4).map((v) => (v == null ? "" : String(v))).join(" "));
          if (joined) {
            for (const [k, m] of byName.entries()) {
              if (k && (joined.includes(k) || k.includes(joined))) { mr = m; break; }
            }
          }
        }
        if (!mr) {
          if (labelCell) unmatchedNames.push(labelCell);
          continue;
        }
        candidatesInSheet.add(mr.candidateId);


        // Designation routing: if the sheet has a designation column and the
        // value matches a contract resource on this unit, save under that
        // designation. The auto-create row block already kicks in when
        // musterRows re-derives from the new entries.
        let targetDesignationId: string | null = mr.designationId;
        let targetDesignationName: string = mr.designationName;
        let isSecondary = false;
        if (designationCol >= 0) {
          const desigCell = norm(String(row[designationCol] ?? ""));
          if (desigCell) {
            const match = fuzzyDesigMatch(desigCell);
            if (match) {
              if (match.designationId !== mr.designationId) {
                targetDesignationId = match.designationId;
                targetDesignationName = match.designationName;
                isSecondary = true;
              }
            } else {
              designationsNotOnContract.add(String(row[designationCol]).trim());
            }
          }
        }

        const rows: Array<{ entry_date: string; code: string; ot_hours: number }> = [];
        for (const h of headerDates) {
          if (h.date > todayStr) continue;
          const raw = row[h.col];
          if (raw == null || String(raw).trim() === "") continue;
          // Accept "P", "D ,1", "P ,0.5", "ED ,1", "W ,1" etc.
          const cell = String(raw).trim().toUpperCase();
          const m = cell.match(/^([A-Z]+)(?:\s*,?\s*(\d+(?:\.\d+)?))?$/);
          if (!m) continue;
          // FPL muster shorthand: "D" / "ED" mean Duty / Extra-Duty — both are a
          // PRESENT day, with the trailing number being OT days for that date.
          // Re-map to canonical "P" so payroll counts them as present.
          let codeKey = m[1];
          if (codeKey === "D" || codeKey === "ED") codeKey = "P";
          const canonical = codeSet.get(codeKey);
          if (!canonical) continue;
          const ot = m[2] ? Number(m[2]) : 0;
          rows.push({ entry_date: h.date, code: canonical, ot_hours: Number.isFinite(ot) ? ot : 0 });
        }
        if (rows.length) {
          const key = `${mr.candidateId}|${targetDesignationId ?? ""}`;
          const bucket = byPair.get(key);
          // Synthetic mr clone so upsert uses the routed designation, not the primary.
          const routedMr = isSecondary
            ? { ...mr, key, designationId: targetDesignationId, designationName: targetDesignationName, isPrimary: false }
            : mr;
          if (bucket) {
            bucket.rows.push(...rows);
          } else {
            byPair.set(key, { mr: routedMr, rows });
          }
          if (isSecondary) secondaryDesigRowCount += 1;
          filled += rows.length;
        }
      }

      // Sheet-authoritative: wipe every prior entry in this period for any
      // candidate present in the uploaded sheet (across all designations),
      // then write only what the sheet shows.
      let clearedStale = 0;
      if (candidatesInSheet.size) {
        const { error, count } = await supabase
          .from("attendance_entries")
          .delete({ count: "exact" })
          .eq("unit_id", unitId)
          .in("candidate_id", Array.from(candidatesInSheet))
          .gte("entry_date", periodStart)
          .lte("entry_date", periodEnd);
        if (error) throw error;
        clearedStale = count ?? 0;
      }

      for (const { mr, rows } of byPair.values()) {
        await upsertEntries(mr.candidateId, mr.designationId, rows);
      }
      await queryClient.invalidateQueries({ queryKey: entriesQK });

      if (designationsNotOnContract.size) {
        toast.warning(
          `Skipped designation routing for ${Array.from(designationsNotOnContract).slice(0, 6).join(", ")} — not on this unit's active contract. Saved under each person's primary designation. Add to contract and re-import to split.`,
          { duration: 8000 },
        );
      }


      const summary = `${filled} cell${filled === 1 ? "" : "s"} imported from ${uploadFile.name}${clearedStale ? ` · cleared ${clearedStale} stale entr${clearedStale === 1 ? "y" : "ies"}` : ""}${secondaryDesigRowCount ? ` · ${secondaryDesigRowCount} row${secondaryDesigRowCount === 1 ? "" : "s"} on secondary designation` : ""}${unmatchedNames.length ? ` · ${unmatchedNames.length} unmatched row${unmatchedNames.length === 1 ? "" : "s"}` : ""}${designationsNotOnContract.size ? ` · ${designationsNotOnContract.size} designation${designationsNotOnContract.size === 1 ? "" : "s"} not on contract` : ""}`;
      setOcrSummary(summary);
      setUploadReadyToContinue(true);
      toast.success(summary);
      logActivity({
        module: "Attendance",
        action: "Upload attendance Excel",
        details: { filled, clearedStale, candidates: Array.from(candidatesInSheet), unmatched: unmatchedNames.length, secondaryDesigRowCount, notOnContract: Array.from(designationsNotOnContract), unit_id: unitId, file: uploadFile.name },
      }).catch(() => {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Excel import failed");
    } finally {
      setProcessingOcr(false);
    }
  };

  const processUpload = () => {
    if (uploadReadyToContinue) {
      setUploadOpen(false);
      return;
    }
    if (uploadKind === "excel") return processAttendanceExcel();
    return processAttendanceImage();
  };



  useEffect(() => {
    if (!isDragging) return;
    const onUp = () => {
      setIsDragging(false);
      setSelectedDates((current) => {
        if (current.size > 0 && dragRowKey) {
          const sorted = Array.from(current).sort();
          setPickerRowKey(dragRowKey);
          setPickerDates(sorted);
          setPickerOpen(true);
          setDragRowKey(null);
          return new Set();
        }
        return current;
      });
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [isDragging, dragRowKey]);

  useEffect(() => {
    if (!isOtDragging) return;
    const onUp = () => {
      setIsOtDragging(false);
      setOtSelectedDates((current) => {
        if (current.size > 0 && otDragRowKey) {
          const sorted = Array.from(current).sort();
          setOtPickerRowKey(otDragRowKey);
          setOtPickerDates(sorted);
          setOtPickerOpen(true);
          setOtDragRowKey(null);
          return new Set();
        }
        return current;
      });
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [isOtDragging, otDragRowKey]);

  const openPickerForSelection = () => {
    if (!dragRowKey || selectedDates.size === 0) return;
    setPickerRowKey(dragRowKey);
    setPickerDates(Array.from(selectedDates).sort());
    setPickerOpen(true);
  };

  const openOtPickerForSelection = () => {
    if (!otDragRowKey || otSelectedDates.size === 0) return;
    setOtPickerRowKey(otDragRowKey);
    setOtPickerDates(Array.from(otSelectedDates).sort());
    setOtPickerOpen(true);
  };

  const clearSelection = () => { setSelectedDates(new Set()); setDragRowKey(null); };
  const clearOtSelection = () => { setOtSelectedDates(new Set()); setOtDragRowKey(null); };

  const findRow = (k: string | null) => musterRows.find((r) => r.key === k);

  // Contractual shift length for a muster row (8h / 12h) — never hard-coded,
  // it comes from the unit's active contract resource line.
  const rowShiftHours = (k: string | null) => {
    const row = findRow(k);
    return shiftHoursFor(shiftMap, unitId, row?.designationId ?? null);
  };

  const applyCodeToSelection = async (code: string) => {
    const row = findRow(pickerRowKey);
    if (!row) return;
    try {
      const rows = pickerDates.map((d) => ({
        entry_date: d,
        code,
        ot_hours: entryMap.get(`${row.key}|${d}`)?.ot_hours ?? 0,
      }));
      const applied = await upsertEntries(row.candidateId, row.designationId, rows);
      queryClient.invalidateQueries({ queryKey: entriesQK });
      setPickerOpen(false);
      setSelectedDates(new Set());
      setDragRowKey(null);
      if (applied > 0) {
        toast.success(`Applied ${code || "Clear"} to ${applied} day${applied > 1 ? "s" : ""}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  // `hours` is OT in clock hours (0.5 – 16). It is stored as OT *days*,
  // converted with the row's contractual shift length (8h or 12h).
  const applyOtToSelection = async (hours: number) => {
    const row = findRow(otPickerRowKey);
    if (!row) return;
    const shift = shiftHoursFor(shiftMap, unitId, row.designationId ?? null);
    const otDays = Math.round((hours / shift) * 100) / 100;
    try {
      const rows = otPickerDates.map((d) => ({
        entry_date: d,
        code: entryMap.get(`${row.key}|${d}`)?.code ?? "",
        ot_hours: otDays,
      }));
      await upsertEntries(row.candidateId, row.designationId, rows);
      queryClient.invalidateQueries({ queryKey: entriesQK });
      setOtPickerOpen(false);
      setOtSelectedDates(new Set());
      setOtDragRowKey(null);
      toast.success(
        hours > 0
          ? `Set ${hours}h OT (${otDays} day${otDays === 1 ? "" : "s"} @ ${shift}h shift) on ${otPickerDates.length} day${otPickerDates.length > 1 ? "s" : ""}`
          : `Cleared OT on ${otPickerDates.length} day${otPickerDates.length > 1 ? "s" : ""}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const computeTotalsForRow = (rk: string) => {
    let pDays = 0;
    let otDaysSum = 0;
    let phCount = 0;
    let otherPaidDays = 0;
    for (const cell of periodCells) {
      const e = entryMap.get(`${rk}|${cell.date}`);
      if (!e) continue;
      otDaysSum += Number(e.ot_hours) || 0;
      const c = codeMap.get(e.code);
      if (!c) continue;
      if (e.code === "PH") { phCount += 1; continue; }
      const dayValue = c.day_value == null || Number.isNaN(Number(c.day_value)) ? 1 : Number(c.day_value);
      if (c.counts_as_present) pDays += dayValue;
      else if (c.is_paid) otherPaidDays += dayValue;
    }
    const phDays = phCount * 2;
    const otDays = Math.round(otDaysSum * 100) / 100;
    // OT cell value is OT-days; expose under both names for display compat.
    const otHours = otDays;
    const tDays = pDays + phDays + otherPaidDays + otDays;
    return { pDays, otHours, otDays, phDays, tDays };
  };


  const principalEmployer = unit
    ? `${unit.customer_name || ""}${unit.code ? ` - ${unit.code}` : ""}`.trim()
    : "—";
  const principalAddress = unit
    ? [
        unit.shipping_address1 || unit.billing_address1 || unit.location,
        unit.shipping_address2 || unit.billing_address2,
        [
          unit.shipping_city || unit.billing_city,
          unit.shipping_district || unit.billing_district,
          unit.shipping_state || unit.billing_state,
          unit.shipping_pincode || unit.billing_pincode,
        ].filter(Boolean).join(", "),
      ].filter((v) => v && String(v).trim()).join(", ")
    : "";

  const monthLabel = `${MONTH_NAMES[monthIdx]} ${year}`;
  const formatPretty = (iso: string) => {
    const [yy, mm, dd] = iso.split("-").map(Number);
    return `${String(dd).padStart(2, "0")} ${MONTH_NAMES[mm - 1].slice(0, 3)} ${yy}`;
  };
  const periodLabel =
    periodCells.length > 0
      ? `${formatPretty(periodStart)} – ${formatPretty(periodEnd)}`
      : monthLabel;
  const windowLabel = payrollWindow?.label
    ? `Payroll window: ${payrollWindow.label}`
    : "Payroll window: full calendar month";

  // "Add line item" UI state
  const [addCand, setAddCand] = useState<string>("");
  const [addDesig, setAddDesig] = useState<string>("");
  const handleAddLineItem = () => {
    if (!addCand || !addDesig) {
      toast.error("Pick both an employee and a designation");
      return;
    }
    const k = rowKey(addCand, addDesig);
    if (musterRows.some((r) => r.key === k)) {
      toast.info("That line item already exists");
      return;
    }
    setExtraRows((prev) => new Set(prev).add(k));
    const empName = (employees ?? []).find((e) => e.id === addCand)?.full_name ?? "";
    const dName = contractDesignations.find((d) => d.designationId === addDesig)?.designationName ?? "";
    toast.success(`Added row: ${empName} — ${dName}`);
    setAddCand(""); setAddDesig("");
  };

  return (
    <div className="space-y-4 px-3 py-4 sm:px-6 sm:py-6">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body * { visibility: hidden !important; }
          #form-xvi-print, #form-xvi-print * { visibility: visible !important; }
          #form-xvi-print {
            position: absolute !important;
            left: 0; top: 0;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: 0 !important;
          }
        }
      `}</style>
      <div className="rounded-2xl border border-border/60 bg-card/95 p-3 shadow-sm backdrop-blur-xl sm:p-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            to="/admin/attendance"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Link>
          <div className="flex items-center gap-2">
            <Select value={String(monthIdx)} onValueChange={(v) => setMonthIdx(Number(v))}>
              <SelectTrigger className="h-9 w-[110px] rounded-xl text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((m, i) => {
                  if (contractStartDate) {
                    const [sy, sm] = contractStartDate.split("-").map(Number);
                    if (year < sy || (year === sy && i < sm - 1)) return null;
                  }
                  if (year > now.getFullYear() || (year === now.getFullYear() && i > now.getMonth())) return null;
                  return <SelectItem key={m} value={String(i)}>{m}</SelectItem>;
                })}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-9 w-[86px] rounded-xl text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[year - 2, year - 1, year, year + 1].map((y) => {
                  if (contractStartDate) {
                    const sy = Number(contractStartDate.split("-")[0]);
                    if (y < sy) return null;
                  }
                  if (y > now.getFullYear()) return null;
                  return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2">
          <Button
            onClick={() => { setUploadOpen(true); }}
            disabled={!editable}
            title={editable ? "Upload an attendance sheet image to auto-fill" : "Sheet locked"}
            className="h-11 min-w-0 rounded-xl px-4 text-sm font-semibold shadow-sm"
          >
            <Upload className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">Upload Attendance</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => window.print()}
            title="Print"
            className="h-11 w-11 shrink-0 rounded-xl"
          >
            <Printer className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled
            title="Export (coming soon)"
            className="h-11 w-11 shrink-0 rounded-xl"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleClearAll}
            disabled={!editable || clearingAll}
            title={editable ? "Delete every attendance entry on this sheet" : "Sheet locked"}
            className="h-11 w-11 shrink-0 rounded-xl text-destructive hover:text-destructive"
          >
            {clearingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>


      {/* Upload Attendance dialog */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { setUploadOpen(o); if (!o) { setUploadFile(null); setUploadPreview(null); setUploadKind(null); setOcrSummary(null); setUploadReadyToContinue(false); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Attendance Sheet</DialogTitle>
            <DialogDescription>
              Upload a photo/scan (AI reads each cell) or an Excel/CSV file (matched by employee name or code).
              Cells the AI cannot read confidently are left blank and flagged in red so you can correct them manually.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*,.xlsx,.xls,.xlsm,.csv,.ods"
              className="hidden"
              onChange={(e) => onPickUploadFile(e.target.files?.[0] ?? null)}
            />
            {!uploadFile ? (
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-sm text-muted-foreground hover:border-primary hover:text-primary"
              >
                <Upload className="h-6 w-6" />
                <span>Click to choose an attendance image or Excel file</span>
                <span className="text-xs">PNG, JPG, HEIC · XLSX, XLS, CSV</span>
              </button>
            ) : uploadKind === "image" && uploadPreview ? (
              <div className="space-y-2">
                <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
                  <img src={uploadPreview} alt="Attendance preview" className="max-h-80 w-full object-contain" />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> {uploadFile.name}</span>
                  <button type="button" className="text-primary hover:underline" onClick={() => uploadInputRef.current?.click()}>
                    Choose a different file
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-6">
                  <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{uploadFile.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Excel/CSV · matched by employee name or code · dates from header row
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end text-xs">
                  <button type="button" className="text-primary hover:underline" onClick={() => uploadInputRef.current?.click()}>
                    Choose a different file
                  </button>
                </div>
              </div>
            )}
            {ocrSummary && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {ocrSummary}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Allowed codes: {codes.map((c) => c.code).join(", ") || "—"} · Period {periodStart} → {periodEnd}
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setUploadOpen(false)} disabled={processingOcr}>Close</Button>
            <Button
              type="button"
              onClick={processUpload}
              disabled={(!uploadFile && !uploadReadyToContinue) || processingOcr}
              className={cn(uploadReadyToContinue && !processingOcr && "bg-primary text-primary-foreground opacity-100 hover:bg-primary/90")}
            >
              {processingOcr ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> {uploadKind === "excel" ? "Importing…" : "Reading…"}</> : uploadReadyToContinue ? "Continue" : (uploadKind === "excel" ? "Import & Fill" : "Process & Fill")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Approval workflow */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3 print:hidden">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Status</span>
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
            status === "draft" && "bg-slate-100 text-slate-700",
            status === "submitted" && "bg-amber-100 text-amber-800",
            status === "approved" && "bg-emerald-100 text-emerald-800",
            status === "rejected" && "bg-rose-100 text-rose-800",
          )}>
            {status === "draft" && "Draft"}
            {status === "submitted" && "Submitted — awaiting approval"}
            {status === "approved" && <><CheckCircle2 className="h-3.5 w-3.5" /> Approved</>}
            {status === "rejected" && <><XCircle className="h-3.5 w-3.5" /> Rejected</>}
          </span>
          {status === "rejected" && sheet?.rejection_reason && (
            <span className="text-xs text-rose-700">Reason: {sheet.rejection_reason}</span>
          )}
          {status === "rejected" && sheet?.review_proof_url && (
            <button
              type="button"
              className="text-xs font-semibold text-rose-700 underline underline-offset-2"
              onClick={async () => {
                const { data, error } = await supabase.storage
                  .from("attendance-review-proofs")
                  .createSignedUrl(sheet.review_proof_url as string, 300);
                if (error || !data?.signedUrl) { toast.error("Could not open proof image"); return; }
                window.open(data.signedUrl, "_blank", "noopener,noreferrer");
              }}
            >
              View HR proof image
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(status === "draft" || status === "rejected") && (
            <Button size="sm" onClick={() => transitionSheet.mutate({ status: "submitted" })} disabled={transitionSheet.isPending}>
              <Send className="mr-1.5 h-4 w-4" /> Submit for Approval
            </Button>
          )}
          {status === "submitted" && canApprove && (
            <>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => transitionSheet.mutate({ status: "approved" })} disabled={transitionSheet.isPending}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)} disabled={transitionSheet.isPending}>
                <XCircle className="mr-1.5 h-4 w-4" /> Reject
              </Button>
            </>
          )}
          {status === "submitted" && !canApprove && (
            <span className="text-xs text-muted-foreground">Awaiting approver action</span>
          )}
          {status === "approved" && canApprove && !sentToPayroll && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" /> Approved — payroll &amp; invoice updated
              </span>
              <Button size="sm" variant="outline" onClick={() => transitionSheet.mutate({ status: "draft" })} disabled={transitionSheet.isPending}>
                <RotateCcw className="mr-1.5 h-4 w-4" /> Reopen
              </Button>
            </>
          )}
          {status === "approved" && canApprove && sentToPayroll && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" /> Approved — payroll &amp; invoice updated
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => reopenAfterHandoff.mutate()}
                disabled={reopenAfterHandoff.isPending || transitionSheet.isPending}
              >
                <RotateCcw className="mr-1.5 h-4 w-4" /> Reopen
              </Button>
            </>
          )}
        </div>
      </div>


      {!editable && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 print:hidden">
          This attendance sheet is {status === "approved" ? "approved" : "submitted"} and locked for editing. {status === "submitted" ? "Reject it to allow further edits." : "Reopen it to make changes."}
        </div>
      )}
      {status === "submitted" && canApprove && (
        <div className="rounded-md border border-sky-300/60 bg-sky-50 px-3 py-2 text-xs text-sky-800 print:hidden">
          You can edit this attendance in place, or reject with a note so the submitter can fix it.
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={(o) => { setRejectOpen(o); if (!o) { setRejectReason(""); setRejectProof(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject attendance</DialogTitle>
            <DialogDescription>Give a clear reason and optionally attach a proof image (photo of physical register, WhatsApp screenshot, etc.).</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection (min 5 characters)…" rows={4} />
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Proof image (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setRejectProof(e.target.files?.[0] ?? null)}
              className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold hover:file:bg-secondary/80"
            />
            {rejectProof && (
              <div className="text-[11px] text-muted-foreground">{rejectProof.name} ({Math.round(rejectProof.size / 1024)} KB)</div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setRejectOpen(false)} disabled={uploadingProof || transitionSheet.isPending}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={uploadingProof || transitionSheet.isPending}
              onClick={() => {
                if (rejectReason.trim().length < 5) { toast.error("Reason must be at least 5 characters"); return; }
                transitionSheet.mutate(
                  { status: "rejected", reason: rejectReason.trim(), proofFile: rejectProof },
                  { onSuccess: () => { setRejectOpen(false); setRejectReason(""); setRejectProof(null); } },
                );
              }}
            >
              {uploadingProof || transitionSheet.isPending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Rejecting…</> : "Reject"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex flex-1 min-w-[260px] items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={musterQuery}
            onChange={(e) => setMusterQuery(e.target.value)}
            placeholder="Search by name, employee code, or designation…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {musterQuery && (
            <button
              type="button"
              onClick={() => setMusterQuery("")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
          {musterQuery && (
            <span className="text-[11px] text-muted-foreground">
              {visibleMusterRows.length}/{musterRows.length}
            </span>
          )}
        </div>
        <div className="rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Tip: click a cell to mark one day, click & drag to mark a range. Future dates are locked. Use{" "}
          <strong>Add line item</strong> below to give an employee an extra designation — each line is paid separately.
        </div>
      </div>


      {/* Add line item panel */}
      <div className="rounded-xl border border-border/70 bg-card p-3 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Employee</label>
            <Select value={addCand} onValueChange={setAddCand}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Pick employee…" /></SelectTrigger>
              <SelectContent>
                {(employees ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name || e.employee_code || e.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Additional designation</label>
            <Select value={addDesig} onValueChange={setAddDesig} disabled={!addCand}>
              <SelectTrigger className="w-[260px]"><SelectValue placeholder="Pick designation from contract…" /></SelectTrigger>
              <SelectContent>
                {contractDesignations.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No designations on this contract.</div>
                ) : (
                  contractDesignations.map((d) => {
                    const used = !!addCand && musterRows.some((r) => r.candidateId === addCand && r.designationId === d.designationId);
                    return (
                      <SelectItem key={d.designationId} value={d.designationId}>
                        {d.designationName}{used ? " (already added)" : ""}
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={handleAddLineItem} disabled={!editable || !addCand || !addDesig}>
            <Plus className="mr-1.5 h-4 w-4" /> Add line item
          </Button>
          <div className="ml-auto text-[11px] text-muted-foreground">
            {contractDesignations.length === 0 ? "No contract resources mapped — add designations on the contract first." : `${contractDesignations.length} designation(s) on contract`}
          </div>
        </div>
      </div>

      {selectedDates.size > 0 && !isDragging && dragRowKey && (
        <div className="sticky top-2 z-20 flex items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm shadow-sm print:hidden">
          <div>
            <span className="font-semibold">{selectedDates.size}</span> day
            {selectedDates.size > 1 ? "s" : ""} selected for{" "}
            <span className="font-semibold">
              {findRow(dragRowKey)?.emp.full_name ?? ""} — {findRow(dragRowKey)?.designationName ?? ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
            <Button size="sm" onClick={openPickerForSelection}>Apply attendance</Button>
          </div>
        </div>
      )}

      {otSelectedDates.size > 0 && !isOtDragging && otDragRowKey && (
        <div className="sticky top-2 z-20 flex items-center justify-between gap-3 rounded-md border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm shadow-sm print:hidden">
          <div>
            <span className="font-semibold">{otSelectedDates.size}</span> OT day
            {otSelectedDates.size > 1 ? "s" : ""} selected for{" "}
            <span className="font-semibold">
              {findRow(otDragRowKey)?.emp.full_name ?? ""} — {findRow(otDragRowKey)?.designationName ?? ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={clearOtSelection}>Clear</Button>
            <Button size="sm" onClick={openOtPickerForSelection}>Set OT hours</Button>
          </div>
        </div>
      )}

      {/* Muster Roll Sheet */}
      <div id="form-xvi-print" className="rounded-xl border border-border/60 bg-white p-3 text-[11px] text-slate-900 shadow-sm print:rounded-none print:border-0 print:shadow-none sm:p-6">

        <div className="text-center">
          <div className="text-base font-bold">Form XVI</div>
          <div className="text-[10px] italic">[ See Rule 78 (1) (a) (i) ]</div>
          <div className="mt-1 text-sm font-bold tracking-wide">MUSTER ROLL</div>
        </div>

        {/* Mobile: stacked meta cards to prevent overflow */}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:hidden">
          <div className="rounded-md border border-slate-300 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Service Provider</div>
            <div className="mt-1 font-bold break-words">{SERVICE_PROVIDER.name}</div>
            <div className="text-slate-700 break-words">{SERVICE_PROVIDER.address}</div>
          </div>
          <div className="rounded-md border border-slate-300 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Principal Employer</div>
            <div className="mt-1 font-bold break-words">{principalEmployer || "—"}</div>
            {principalAddress && <div className="text-slate-700 break-words">{principalAddress}</div>}
            <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Month</div>
            <div className="font-semibold">{monthLabel}</div>
            <div className="text-slate-700 break-words">Period: {periodLabel}</div>
            <div className="text-[10px] text-slate-500 break-words">{windowLabel}</div>
          </div>
        </div>
        {/* Tablet/desktop: original two-column table */}
        <table className="mt-3 hidden w-full border border-slate-400 text-[11px] sm:table">
          <tbody>
            <tr>
              <td className="w-1/2 border border-slate-400 p-2 align-top">
                <div className="font-semibold">Name And Address Of Service Provider :</div>
                <div className="mt-1 font-bold">{SERVICE_PROVIDER.name}</div>
                <div className="text-slate-700">{SERVICE_PROVIDER.address}</div>
              </td>
              <td className="w-1/2 border border-slate-400 p-2 align-top">
                <div className="font-semibold">Name and Address of Principal Employer :</div>
                <div className="mt-1 font-bold">{principalEmployer || "—"}</div>
                {principalAddress && <div className="text-slate-700">{principalAddress}</div>}
                <div className="mt-3 font-semibold">For the month of {monthLabel}</div>
                <div className="text-slate-700">Period: {periodLabel}</div>
                <div className="text-[10px] text-slate-500">{windowLabel}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-2 text-[10px] font-medium uppercase tracking-wider text-slate-500 sm:hidden">Swipe horizontally to view all days →</div>
        <div className="mt-2 -mx-3 overflow-x-auto overscroll-x-contain rounded-md border border-slate-300 sm:mx-0 sm:rounded-none sm:border-0" style={{ WebkitOverflowScrolling: "touch" }}>
          <table className="w-full min-w-[900px] border-collapse border border-slate-400 text-center text-[10px]">

            <thead className="bg-slate-100">
              <tr>
                <th className="border border-slate-400 p-1 align-middle">Sl.<br />No.</th>
                <th className="border border-slate-400 p-1 align-middle">Emp ID</th>
                <th className="border border-slate-400 p-1 text-left align-middle">Employee Name</th>
                <th className="border border-slate-400 p-1 text-left align-middle">Designation</th>
                <th className="border border-slate-400 p-1 align-middle">DOJ</th>
                <th className="border border-slate-400 p-1 align-middle" colSpan={dayCount}>Days</th>
                <th className="border border-slate-400 p-1 align-middle" rowSpan={2}>P<br />Days</th>
                <th className="border border-slate-400 p-1 align-middle">OT<br />Days</th>
                <th className="border border-slate-400 p-1 align-middle" rowSpan={2}>PH<br />Days</th>
                <th className="border border-slate-400 p-1 align-middle" rowSpan={2}>T<br />Days</th>
              </tr>
              <tr className="bg-slate-50">
                <th className="border border-slate-400 p-1"></th>
                <th className="border border-slate-400 p-1"></th>
                <th className="border border-slate-400 p-1"></th>
                <th className="border border-slate-400 p-1"></th>
                <th className="border border-slate-400 p-1"></th>
                {periodCells.map((cell) => {
                  const isMonthBoundary = cell.dayNum === 1 || cell === periodCells[0];
                  const isFuture = cell.date > todayStr;
                  return (
                    <th
                      key={cell.date}
                      className={cn(
                        "border border-slate-400 p-0.5 text-[9px] font-medium",
                        isMonthBoundary && "border-l-2 border-l-slate-600",
                        isFuture && "bg-slate-200 text-slate-400",
                      )}
                      style={{ minWidth: 18 }}
                      title={cell.date + (isFuture ? " (future)" : "")}
                    >
                      {cell.dayNum}
                    </th>
                  );
                })}
                <th className="border border-slate-400 p-1 text-[9px] font-medium">OT<br />Hrs</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9 + dayCount} className="p-4 text-slate-500">Loading roster…</td></tr>
              ) : rosterError ? (
                <tr><td colSpan={9 + dayCount} className="p-6 text-red-600">Failed to load mapped employees for this unit.</td></tr>
              ) : musterRows.length === 0 ? (
                <tr><td colSpan={9 + dayCount} className="p-6 text-slate-500">No active security guards are mapped to this unit.</td></tr>
              ) : visibleMusterRows.length === 0 ? (
                <tr><td colSpan={9 + dayCount} className="p-6 text-slate-500">No rows match &ldquo;{musterQuery}&rdquo;.</td></tr>
              ) : (
                visibleMusterRows.flatMap((mr, idx) => {
                  const cellBase = "border border-slate-400 align-middle";
                  const totals = computeTotalsForRow(mr.key);
                  return [
                    <tr key={mr.key + "-att"}>

                      <td className={cn(cellBase, "p-1 font-medium")} rowSpan={2}>{idx + 1}</td>
                      <td className={cn(cellBase, "p-1")} rowSpan={2}>{mr.emp.employee_code || "—"}</td>
                      <td className={cn(cellBase, "p-1 text-left")} rowSpan={2}>
                        <div className="flex items-center gap-1.5">
                          {mr.vacant ? (
                            <button
                              type="button"
                              disabled={!editable}
                              onClick={() => {
                                setMapQuery("");
                                setMapSlot({ designationId: mr.designationId, designationName: mr.designationName });
                              }}
                              className="flex items-center gap-1 rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-[11px] italic text-slate-400 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                              title="Search and map an employee to this slot"
                            >
                              <Search className="h-3 w-3" />
                              Unassigned
                            </button>
                          ) : (
                            <span>{mr.emp.full_name || "—"}</span>
                          )}

                          {!mr.isPrimary && (
                            <button
                              type="button"
                              title="Remove this extra line and delete its attendance entries in this period"
                              disabled={!editable}
                              onClick={async () => {
                                if (!editable) return;
                                const hasEntries = entries.some(
                                  (e) => e.candidate_id === mr.candidateId && e.designation_id === mr.designationId,
                                );
                                if (hasEntries && !window.confirm(`Remove extra line "${mr.designationName}" for ${mr.emp.full_name}? This deletes attendance entries on this line for ${periodStart} → ${periodEnd}.`)) {
                                  return;
                                }
                                try {
                                  if (hasEntries) {
                                    let q = supabase
                                      .from("attendance_entries")
                                      .delete()
                                      .eq("unit_id", unitId)
                                      .eq("candidate_id", mr.candidateId)
                                      .gte("entry_date", periodStart)
                                      .lte("entry_date", periodEnd);
                                    q = mr.designationId
                                      ? q.eq("designation_id", mr.designationId)
                                      : q.is("designation_id", null);
                                    const { error } = await q;
                                    if (error) throw error;
                                  }
                                  setExtraRows((prev) => {
                                    const next = new Set(prev);
                                    next.delete(mr.key);
                                    return next;
                                  });
                                  queryClient.invalidateQueries({ queryKey: entriesQK });
                                  toast.success("Extra line removed");
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "Failed to remove line");
                                }
                              }}
                              className="rounded-full p-0.5 text-slate-400 hover:text-rose-600 disabled:opacity-40 print:hidden"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className={cn(cellBase, "p-1 text-left")} rowSpan={2}>
                        {mr.designationName || "—"}
                        {!mr.isPrimary && (
                          <span className="ml-1 rounded bg-violet-100 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-violet-700 print:hidden">extra</span>
                        )}
                      </td>
                      <td className={cn(cellBase, "p-1")} rowSpan={2}>
                        {mr.emp.doj ? new Date(mr.emp.doj).toLocaleDateString("en-GB") : "—"}
                      </td>
                      {periodCells.map((cell) => {
                        const date = cell.date;
                        const isFuture = date > todayStr;
                        const beforeDoj = Boolean(mr.emp.doj) && date < mr.emp.doj;
                        const entry = entryMap.get(`${mr.key}|${date}`);
                        // Implicit "A" for on/after DOJ, on/before today, when no entry exists.
                        const displayCode = mr.vacant
                          ? ""
                          : entry?.code
                          ? entry.code
                          : (!isFuture && !beforeDoj ? "A" : "");
                        const codeMeta = displayCode ? codeMap.get(displayCode) : undefined;
                        const isImplicitAbsent = !entry?.code && displayCode === "A";
                        const isSelected = dragRowKey === mr.key && selectedDates.has(date);
                        const isUncertain = !entry?.code && uncertainCells.has(`${mr.key}|${date}`);
                        const isBlocked = isFuture || beforeDoj || Boolean(mr.vacant);
                        return (
                          <td
                            key={`a-${cell.date}`}
                            className={cn(
                              cellBase,
                              "p-0 print:bg-transparent select-none",
                              isFuture && "bg-slate-100 cursor-not-allowed",
                              beforeDoj && "bg-slate-50 cursor-not-allowed",
                              !isBlocked && "cursor-pointer",
                              isSelected && "ring-2 ring-primary ring-inset",
                              isUncertain && "ring-2 ring-rose-500 ring-inset bg-rose-50",
                            )}
                            style={{
                              height: 22,
                              minWidth: 18,
                              backgroundColor: isBlocked
                                ? undefined
                                : codeMeta?.color ? `${codeMeta.color}22` : undefined,
                            }}
                            title={
                              beforeDoj
                                ? `Before joining date (${mr.emp.doj})`
                                : isFuture
                                ? "Future date — cannot mark attendance"
                                : isUncertain
                                ? "OCR could not read this cell — please mark manually"
                                : isImplicitAbsent
                                ? "No attendance recorded — treated as Absent"
                                : undefined
                            }
                            onMouseDown={(e) => {
                              if (isBlocked) { e.preventDefault(); return; }
                              if (!editable) { e.preventDefault(); return; }
                              e.preventDefault();
                              const additive = e.ctrlKey || e.metaKey;
                              if (additive) {
                                setSelectedDates((prev) => {
                                  const sameRow = dragRowKey === mr.key;
                                  const next = sameRow ? new Set(prev) : new Set<string>();
                                  if (sameRow && next.has(date)) next.delete(date);
                                  else next.add(date);
                                  return next;
                                });
                                setDragRowKey(mr.key);
                                return;
                              }
                              setDragRowKey(mr.key);
                              setIsDragging(true);
                              setSelectedDates(new Set([date]));
                            }}
                            onMouseEnter={() => {
                              if (isBlocked) return;
                              if (isDragging && dragRowKey === mr.key) {
                                setSelectedDates((prev) => {
                                  if (prev.has(date)) return prev;
                                  const next = new Set(prev);
                                  next.add(date);
                                  return next;
                                });
                              }
                            }}
                            onClick={(e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }}
                          >
                            <div
                              className={cn(
                                "h-full w-full px-0 text-[10px] font-semibold leading-none flex items-center justify-center",
                                isImplicitAbsent && "opacity-60",
                              )}
                              style={{ color: codeMeta?.color }}
                            >
                              {displayCode}
                            </div>
                          </td>
                        );
                      })}

                      <td className={cn(cellBase, "p-1 font-semibold")} rowSpan={2}>{totals.pDays}</td>
                      <td className={cn(cellBase, "p-1 font-semibold")}>{totals.otHours}</td>
                      <td className={cn(cellBase, "p-1 font-semibold")} rowSpan={2}>{totals.phDays}</td>
                      <td className={cn(cellBase, "p-1 font-semibold")} rowSpan={2}>{totals.tDays}</td>
                    </tr>,
                    <tr key={mr.key + "-ot"}>
                      {periodCells.map((cell) => {
                        const date = cell.date;
                        const isFuture = date > todayStr;
                        const beforeDoj = Boolean(mr.emp.doj) && date < mr.emp.doj;
                        const isBlocked = isFuture || beforeDoj || Boolean(mr.vacant);
                        const entry = entryMap.get(`${mr.key}|${date}`);
                        const rowShift = shiftHoursFor(shiftMap, unitId, mr.designationId ?? null);
                        const otDaysCell = Number(entry?.ot_hours) || 0;
                        const hrs = Math.round(otDaysCell * rowShift * 100) / 100;
                        const isSelected = otDragRowKey === mr.key && otSelectedDates.has(date);
                        return (
                          <td
                            key={`o-${cell.date}`}
                            className={cn(
                              cellBase,
                              "p-0 select-none transition-colors",
                              isFuture && "bg-slate-100 cursor-not-allowed",
                              beforeDoj && "bg-slate-50 cursor-not-allowed",
                              !isBlocked && "cursor-pointer",
                              hrs > 0 && !isBlocked && "bg-amber-50",
                              isSelected && "ring-2 ring-amber-500 ring-inset bg-amber-100",
                            )}
                            style={{ height: 22, minWidth: 18 }}
                            onMouseDown={(e) => {
                              if (isBlocked || !editable) { e.preventDefault(); return; }
                              e.preventDefault();
                              const additive = e.ctrlKey || e.metaKey;
                              if (additive) {
                                setOtSelectedDates((prev) => {
                                  const sameRow = otDragRowKey === mr.key;
                                  const next = sameRow ? new Set(prev) : new Set<string>();
                                  if (sameRow && next.has(date)) next.delete(date);
                                  else next.add(date);
                                  return next;
                                });
                                setOtDragRowKey(mr.key);
                                return;
                              }
                              setOtDragRowKey(mr.key);
                              setIsOtDragging(true);
                              setOtSelectedDates(new Set([date]));
                            }}
                            onMouseEnter={() => {
                              if (isBlocked) return;
                              if (isOtDragging && otDragRowKey === mr.key) {
                                setOtSelectedDates((prev) => {
                                  if (prev.has(date)) return prev;
                                  const next = new Set(prev);
                                  next.add(date);
                                  return next;
                                });
                              }
                            }}
                            onClick={(e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }}
                            title={beforeDoj ? `Before joining date (${mr.emp.doj})` : isFuture ? "Future date — cannot mark OT" : `OT for ${date}${hrs > 0 ? ` · ${hrs}h` : ""}`}
                          >
                            <div
                              className={cn(
                                "h-full w-full flex items-center justify-center text-[10px] font-semibold leading-none",
                                hrs > 0 ? "text-amber-700" : "text-slate-300",
                              )}
                            >
                              {hrs > 0 ? hrs : ""}
                            </div>
                          </td>
                        );
                      })}
                      <td className={cn(cellBase, "p-1 font-semibold")}>{totals.otDays}</td>
                    </tr>,
                  ];
                })
              )}
              {!isLoading && !rosterError && visibleMusterRows.length > 0 && (() => {
                const grand = visibleMusterRows.reduce(
                  (acc, mr) => {
                    const t = computeTotalsForRow(mr.key);
                    acc.pDays += t.pDays;
                    acc.otHours += t.otHours;
                    acc.phDays += t.phDays;
                    acc.tDays += t.tDays;
                    return acc;
                  },
                  { pDays: 0, otHours: 0, phDays: 0, tDays: 0 },
                );
                const r2 = (n: number) => Math.round(n * 100) / 100;
                return (
                  <tr className="bg-slate-100 font-bold">
                    <td className="border border-slate-400 p-1 text-right" colSpan={5 + dayCount}>
                      Grand Total
                    </td>
                    <td className="border border-slate-400 p-1">{r2(grand.pDays)}</td>
                    <td className="border border-slate-400 p-1">{r2(grand.otHours)}</td>
                    <td className="border border-slate-400 p-1">{r2(grand.phDays)}</td>
                    <td className="border border-slate-400 p-1">{r2(grand.tDays)}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-[10px] text-slate-600">
          Att = Attendance · OT row = Overtime hours (converted to OT days at the contractual shift length) · Each (employee × designation) is a separate payroll line.
        </div>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark attendance</DialogTitle>
            <DialogDescription>
              {pickerDates.length} day{pickerDates.length > 1 ? "s" : ""} selected
              {pickerRowKey
                ? ` for ${findRow(pickerRowKey)?.emp.full_name ?? ""} — ${findRow(pickerRowKey)?.designationName ?? ""}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2">
            {codes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => applyCodeToSelection(c.code)}
                className="rounded-md border border-border px-2 py-3 text-sm font-bold transition hover:bg-muted"
                style={{ color: c.color }}
                title={c.label}
              >
                {c.code}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => applyCodeToSelection("")}
            className="mt-2 w-full rounded-md border border-border px-2 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Clear selection
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(mapSlot)} onOpenChange={(o) => { if (!o) { setMapSlot(null); setMapQuery(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Map employee to slot</DialogTitle>
            <DialogDescription>
              Search the full employee base by name or employee / candidate code, then pick one to fill the{" "}
              <span className="font-medium">{mapSlot?.designationName ?? "—"}</span> slot on this unit.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={mapQuery}
              onChange={(e) => setMapQuery(e.target.value)}
              placeholder="Search employees…"
              className="h-10 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="max-h-[45vh] space-y-1 overflow-y-auto">
            {mapSearch.length < 2 ? (
              <p className="p-3 text-xs text-muted-foreground">Type at least 2 characters to search.</p>
            ) : mapSearching ? (
              <p className="p-3 text-xs text-muted-foreground">Searching…</p>
            ) : (mapResults ?? []).length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">No matching employees.</p>
            ) : (
              (mapResults ?? []).map((c) => {
                const already = rosterIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={already || mapSaving}
                    onClick={() => mapEmployeeToSlot(c)}
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left transition hover:border-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{c.full_name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {c.employee_code} · {c.designation} · DOJ {c.doj || "—"}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] font-medium text-primary">
                      {already ? "On roster" : "Add"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={otPickerOpen} onOpenChange={setOtPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set OT hours</DialogTitle>
            <DialogDescription>
              Pick overtime in hours (0.5 – 16). Converted to OT days at the row&apos;s contractual{" "}
              {rowShiftHours(otPickerRowKey)}h shift. {otPickerDates.length} day
              {otPickerDates.length > 1 ? "s" : ""} selected
              {otPickerRowKey
                ? ` for ${findRow(otPickerRowKey)?.emp.full_name ?? ""} — ${findRow(otPickerRowKey)?.designationName ?? ""}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[45vh] grid-cols-4 gap-2 overflow-y-auto pr-1">
            {Array.from({ length: 32 }, (_, i) => (i + 1) * 0.5).map((n) => {
              const shift = rowShiftHours(otPickerRowKey);
              const days = Math.round((n / shift) * 100) / 100;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => applyOtToSelection(n)}
                  title={`${n}h = ${days} OT day${days === 1 ? "" : "s"}`}
                  className="rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-sm font-bold leading-tight text-amber-800 transition hover:border-amber-400 hover:bg-amber-100"
                >
                  {n}h
                  <span className="block text-[9px] font-medium text-amber-600">{days}d</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => applyOtToSelection(0)}
            className="mt-2 w-full rounded-md border border-border px-2 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Clear OT
          </button>
        </DialogContent>
      </Dialog>

    </div>
  );
}
