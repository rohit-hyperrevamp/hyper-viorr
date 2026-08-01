import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Download, FileText } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { InvoicePreviewDialog } from "@/components/InvoicePreviewDialog";

import { supabase } from "@/integrations/supabase/client";
import {
  applyEpfBreakdownToWageComputation,
  applyEsiToWageComputation,
  applyLwfToWageComputation,
  applyPtToWageComputation,
  computeAttendanceTotals,
  computeWages,
  mergeByCanonicalName,
  fmtINR,
  resolvePtAmount,
  type AttendanceCodeLike,
  type AttendanceEntryLike,
  type ContractResourceLike,
  type PincodeRangeLike,
  type PtSlabLike,
} from "@/lib/payroll-calc";
import { resolveLwf, type LwfRow } from "@/lib/lwf-lookup";
import { downloadCsv, writeXlsx } from "@/lib/csv-export";
import { gstinStateCode } from "@/lib/gstin";
import { fetchAttendanceEntriesForPeriod } from "@/lib/attendance-fetch";
import { hydrateFormulasFromMaster } from "@/lib/contract-hydrate";
import { resolvePayrollDayCount } from "@/lib/payroll-days";
import { useOrgSettings } from "@/lib/org-settings";

const searchSchema = z.object({
  start: z.string(),
  end: z.string(),
  candidate: z.string().optional(),
});

export const Route = createFileRoute("/admin/invoice/$unitId")({
  validateSearch: (s) => searchSchema.parse(s),
  component: PayrollUnitPage,
});

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Ledger names for one-off additions/deductions are stored as
// "<code> - <name> - <date>". Only the middle "<name>" segment is user-facing.
function cleanLedgerName(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const parts = s.split(/\s+-\s+/);
  if (parts.length >= 3) return parts[1].trim() || s;
  return s;
}

const ESI_COMPONENT_RE = /\besi(c)?\b/i;
const PT_COMPONENT_RE = /\bprofessional\s*tax\b|\bpt\b/i;
const isEsiItem = (item: { name?: unknown }) => ESI_COMPONENT_RE.test(String(item.name ?? ""));
const isPtItem = (item: { name?: unknown }) => PT_COMPONENT_RE.test(String(item.name ?? ""));
const contractTotalAmount = (item: { name?: unknown; amount?: unknown }) =>
  isEsiItem(item) || isPtItem(item) ? 0 : Number(item.amount) || 0;


function fmtPretty(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`;
}

function buildDates(start: string, end: string): string[] {
  const out: string[] = [];
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const cursor = new Date(ys, ms - 1, ds);
  const stop = new Date(ye, me - 1, de);
  while (cursor <= stop) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function PayrollUnitPage() {
  const { unitId } = Route.useParams();
  const { start, end, candidate: highlightCandidate } = Route.useSearch();

  const periodDates = useMemo(() => buildDates(start, end), [start, end]);

  const { data: unit } = useQuery({
    queryKey: ["payroll-unit", unitId],
    queryFn: async () => {
      const { data } = await supabase
        .from("units")
        .select(
          "id, code, name, customer_id, gst_number, billing_address1, billing_address2, billing_city, billing_district, billing_state, billing_pincode, billing_country",
        )
        .eq("id", unitId)
        .maybeSingle();
      if (!data) return null;
      const { data: cust } = await supabase
        .from("customers")
        .select(
          "name, billing_address1, billing_address2, billing_city, billing_district, billing_state, billing_pincode, billing_country",
        )
        .eq("id", data.customer_id ?? "")
        .maybeSingle();
      const { data: gsts } = await supabase
        .from("customer_gst_numbers")
        .select("gstin, state_name")
        .eq("customer_id", data.customer_id ?? "");
      const stateGstin =
        (gsts ?? []).find(
          (g) => (g.state_name ?? "").toLowerCase() === (data.billing_state ?? "").toLowerCase(),
        )?.gstin ??
        (gsts ?? [])[0]?.gstin ??
        data.gst_number ??
        "";
      return {
        ...data,
        customer_name: cust?.name ?? "",
        customer: cust ?? null,
        gstin: stateGstin,
      };
    },
  });

  const { data: sheet } = useQuery({
    queryKey: ["payroll-sheet", unitId, start, end],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_sheets" as never)
        .select("status, approved_at")
        .eq("unit_id", unitId)
        .eq("period_start", start)
        .eq("period_end", end)
        .maybeSingle();
      return data as unknown as { status: string; approved_at: string | null } | null;
    },
  });

  const { data: ptSlabs } = useQuery({
    queryKey: ["pt_slabs_invoice"],
    queryFn: async (): Promise<PtSlabLike[]> => {
      const { data, error } = await supabase
        .from("professional_tax_slabs")
        .select("id, state, region_label, salary_min, salary_max, tax_per_month, gender");
      if (error) throw error;
      return (data ?? []) as PtSlabLike[];
    },
  });

  const { data: pincodeRanges } = useQuery({
    queryKey: ["pincode_ranges_invoice"],
    queryFn: async (): Promise<PincodeRangeLike[]> => {
      const { data, error } = await supabase
        .from("pincode_ranges")
        .select("state, region_label, range_start, range_end, is_excluded");
      if (error) throw error;
      return (data ?? []) as PincodeRangeLike[];
    },
  });

  const { data: lwfRows } = useQuery({
    queryKey: ["labour_welfare_funds_invoice"],
    queryFn: async (): Promise<LwfRow[]> => {
      const { data, error } = await supabase
        .from("labour_welfare_funds")
        .select("id, state, deduction_months, frequency, employee_contribution, employer_contribution, enabled, notes");
      if (error) throw error;
      return (data ?? []) as LwfRow[];
    },
  });

  const unitState = (unit as { billing_state?: string | null } | null | undefined)?.billing_state ?? null;
  const unitPincode = (unit as { billing_pincode?: string | null } | null | undefined)?.billing_pincode ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: ["payroll-compute", unitId, start, end, unitState, unitPincode, (ptSlabs?.length ?? 0), (pincodeRanges?.length ?? 0), (lwfRows?.length ?? 0)],
    enabled: !!ptSlabs && !!pincodeRanges && !!lwfRows,
    queryFn: async () => {
      // 1. Roster: candidates mapped to this unit (primary + secondary).
      const [primaryRes, linksRes] = await Promise.all([
        supabase
          .from("candidates")
          .select("id, employee_code, full_name, designation_id, gender, is_disabled")
          .eq("unit_id", unitId)
          .eq("is_enabled", true)
          .eq("status", "active"),
        supabase.from("candidate_units").select("candidate_id").eq("unit_id", unitId),
      ]);
      if (primaryRes.error) throw primaryRes.error;
      if (linksRes.error) throw linksRes.error;
      const primary = primaryRes.data;
      const links = linksRes.data;
      const linkIds = (links ?? []).map((l) => l.candidate_id);
      let secondary: typeof primary = [];
      if (linkIds.length > 0) {
        const { data, error: secErr } = await supabase
          .from("candidates")
          .select("id, employee_code, full_name, designation_id, gender, is_disabled")
          .in("id", linkIds)
          .eq("is_enabled", true)
          .eq("status", "active");
        if (secErr) throw secErr;
        secondary = data ?? [];
      }

      const roster = Array.from(
        new Map([...(primary ?? []), ...(secondary ?? [])].map((c) => [c.id, c])).values(),
      );

      const designationIds = Array.from(
        new Set(roster.map((c) => c.designation_id).filter(Boolean)),
      ) as string[];
      const { data: designations } = await supabase
        .from("designations")
        .select("id, name")
        .in("id", designationIds.length ? designationIds : ["00000000-0000-0000-0000-000000000000"]);
      const desigMap = new Map((designations ?? []).map((d) => [d.id, d.name as string]));

      // 2. Attendance entries (fetched per day to avoid backend row caps)
      const entries = await fetchAttendanceEntriesForPeriod({ unitId, start, end }) as Array<{
        candidate_id: string;
        designation_id: string | null;
        entry_date: string;
        code: string;
        ot_hours: number | string | null;
      }>;

      const { data: codes } = await supabase
        .from("attendance_codes")
        .select("code, counts_as_present, is_paid")
        .eq("enabled", true);

      // 3. Contract resources for this unit's active contract.
      const { data: contracts } = await supabase
        .from("client_contracts")
        .select("id, payroll_window_id, billing_type_id")
        .eq("unit_id", unitId)
        .eq("record_type", "client")
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1);
      const contractId = contracts?.[0]?.id;
      const billingTypeId = contracts?.[0]?.billing_type_id ?? null;

      let billingMode: "man_days" | "man_hours" | "man_months" | "lumpsum" = "man_days";
      if (billingTypeId) {
        const { data: bt } = await supabase
          .from("billing_types" as never)
          .select("code")
          .eq("id", billingTypeId)
          .maybeSingle();
        const code = ((bt as unknown) as { code?: string | null } | null)?.code ?? "man_days";
        if (code === "man_hours" || code === "man_months" || code === "lumpsum") billingMode = code;
      }

      let resources: Record<string, unknown>[] = [];
      if (contractId) {
        const { data: r } = await supabase
          .from("contract_resources")
          .select(
            "designation_id, components, benefits, deductions, employer_contributions, payroll_day_base_id",
          )
          .eq("contract_id", contractId);
        resources = r ?? [];
      }

      // 3b. Per-employee Additions & Deductions in the invoice window.
      // Mirrors admin.payroll.$unitId.tsx so invoice employer-cost lines up
      // 1:1 with the payroll register (previously omitted).
      const candidateIds = roster.map((c) => c.id);
      type PerEmpItem = { name: string; amount: number };
      type DayAdj = { pDays: number; otDays: number; phDays: number; otherPaidDays: number; tDays: number };
      const additionsByCandidate = new Map<string, PerEmpItem[]>();
      const deductionsByCandidate = new Map<string, PerEmpItem[]>();
      const dayAdjustmentByCandidate = new Map<string, DayAdj>();
      const phDisplayCountByCandidate = new Map<string, number>();
      const phCashByCandidate = new Map<string, number>();
      if (candidateIds.length > 0) {
        const [addsRes, dedsRes, addTypesRes] = await Promise.all([
          supabase
            .from("additions" as never)
            .select("candidate_id, addition_type_id, addition_name, calculation_type, amount, installments, status, entry_mode, days, include_in_total_days, affects_days_for")
            .in("candidate_id", candidateIds)
            .gte("addition_date", start)
            .lte("addition_date", end)
            .eq("status", "active"),
          supabase
            .from("deductions" as never)
            .select("candidate_id, deduction_name, calculation_type, amount, installments, status, entry_mode, days, include_in_total_days, affects_days_for")
            .in("candidate_id", candidateIds)
            .gte("deduction_date", start)
            .lte("deduction_date", end)
            .eq("status", "active"),
          supabase.from("addition_types").select("id, code"),
        ]);
        const phTypeIds = new Set<string>(
          ((addTypesRes.data ?? []) as { id: string; code: string | null }[])
            .filter((t) => (t.code ?? "").toLowerCase() === "paid_holidays")
            .map((t) => t.id),
        );
        type RawAdd = { candidate_id: string; addition_type_id?: string | null; addition_name: string; calculation_type: string; amount: number | string; installments: number; entry_mode?: string | null; days?: number | string | null; include_in_total_days?: boolean | null; affects_days_for?: string[] | null };
        type RawDed = { candidate_id: string; deduction_name: string; calculation_type: string; amount: number | string; installments: number; entry_mode?: string | null; days?: number | string | null; include_in_total_days?: boolean | null; affects_days_for?: string[] | null };
        const applyDayAdj = (cid: string, dayDelta: number, buckets: string[] | null | undefined, sign: 1 | -1) => {
          if (!dayDelta) return;
          const prev = dayAdjustmentByCandidate.get(cid) ?? { pDays: 0, otDays: 0, phDays: 0, otherPaidDays: 0, tDays: 0 };
          const list = (buckets ?? []).filter(Boolean);
          if (list.length === 0) list.push("present");
          for (const b of list) {
            if (b === "present" || b === "worked") prev.pDays += sign * dayDelta;
            else if (b === "ot") prev.otDays += sign * dayDelta;
            else if (b === "ph") prev.phDays += sign * dayDelta;
            else prev.otherPaidDays += sign * dayDelta;
          }
          prev.tDays += sign * dayDelta * Math.max(1, list.length);
          dayAdjustmentByCandidate.set(cid, prev);
        };
        const SYSTEM_COMPUTED_BUCKETS = new Set(["ph", "ot"]);
        const isSystemComputedDayAdj = (entryMode: string | null | undefined, includeInTotal: boolean | null | undefined, buckets: string[] | null | undefined) =>
          entryMode === "days_x_per_day"
          && !!includeInTotal
          && Array.isArray(buckets)
          && buckets.length > 0
          && buckets.every((b) => SYSTEM_COMPUTED_BUCKETS.has(b));

        for (const a of ((addsRes.data ?? []) as unknown as RawAdd[])) {
          const inst = Math.max(1, Number(a.installments) || 1);
          const amt = (Number(a.amount) || 0) / inst;
          const isPhType = !!(a.addition_type_id && phTypeIds.has(String(a.addition_type_id)));
          if (isPhType) {
            phCashByCandidate.set(a.candidate_id, (phCashByCandidate.get(a.candidate_id) ?? 0) + amt);
            const phDelta = Math.max(1, Number(a.days) || 1);
            phDisplayCountByCandidate.set(a.candidate_id, (phDisplayCountByCandidate.get(a.candidate_id) ?? 0) + phDelta);
            continue;
          }
          const isDayAdj = isSystemComputedDayAdj(a.entry_mode, a.include_in_total_days, a.affects_days_for);
          if (!isDayAdj) {
            const arr = additionsByCandidate.get(a.candidate_id) ?? [];
            arr.push({ name: cleanLedgerName(a.addition_name), amount: Math.round(amt * 100) / 100 });
            additionsByCandidate.set(a.candidate_id, arr);
          }
          if (a.entry_mode === "days_x_per_day" && a.include_in_total_days) {
            applyDayAdj(a.candidate_id, Number(a.days) || 0, a.affects_days_for, +1);
          }
        }
        for (const d of ((dedsRes.data ?? []) as unknown as RawDed[])) {
          const inst = Math.max(1, Number(d.installments) || 1);
          const amt = (Number(d.amount) || 0) / inst;
          const isDayAdj = isSystemComputedDayAdj(d.entry_mode, d.include_in_total_days, d.affects_days_for);
          if (!isDayAdj) {
            const arr = deductionsByCandidate.get(d.candidate_id) ?? [];
            arr.push({ name: cleanLedgerName(d.deduction_name), amount: Math.round(amt * 100) / 100 });
            deductionsByCandidate.set(d.candidate_id, arr);
          }
          if (d.entry_mode === "days_x_per_day" && d.include_in_total_days) {
            applyDayAdj(d.candidate_id, Number(d.days) || 0, d.affects_days_for, -1);
          }
        }
      }



      // Coerce attendance entries missing a designation to the candidate's
      // primary designation so billing lines roll into the correct
      // contract-resource row instead of a phantom "no designation" line.
      const primaryDesigByCandidate = new Map(
        roster.map((c) => [c.id, c.designation_id ?? null] as const),
      );
      for (const e of entries) {
        if (!e.designation_id) {
          const primary = primaryDesigByCandidate.get(e.candidate_id) ?? null;
          if (primary) e.designation_id = primary;
        }
      }

      // Make sure we know the names of any designation_ids referenced by entries
      // that weren't in the roster's primary designation list.
      const allDesigIds = new Set<string>(designationIds);
      for (const e of entries) if (e.designation_id) allDesigIds.add(e.designation_id);
      for (const r of resources) {
        const d = r.designation_id ? String(r.designation_id) : "";
        if (d) allDesigIds.add(d);
      }
      if (allDesigIds.size > 0) {
        const { data: extraDs } = await supabase
          .from("designations")
          .select("id, name")
          .in("id", Array.from(allDesigIds));
        for (const d of extraDs ?? []) desigMap.set(d.id, d.name as string);
      }

      // Load ALL enabled payroll day bases (referenced by contract resources
      // AND by cost-component / allowance divisors pdb:<uuid>). Mirrors the
      // payroll route so invoice base-day math never diverges from payroll.
      const { data: pdbs } = await supabase
        .from("payroll_day_bases")
        .select("id, method, fixed_days, weekly_off_day, included_weekdays, enabled");
      type PdbMethod = "actual_days" | "fixed_days" | "actual_minus_weekly_off" | "custom_weekdays";
      const pdbMap = new Map<string, NonNullable<ContractResourceLike["payrollDayBase"]>>(
        (pdbs ?? []).map((p) => [
          p.id,
          {
            method: p.method as PdbMethod,
            fixedDays: p.fixed_days,
            weeklyOffDay: p.weekly_off_day,
            includedWeekdays: Array.isArray((p as unknown as { included_weekdays?: unknown }).included_weekdays)
              ? ((p as unknown as { included_weekdays: unknown[] }).included_weekdays.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6))
              : null,
          },
        ]),
      );
      const dayBases = (pdbs ?? []).map((p) => ({
        id: String(p.id),
        method: p.method as PdbMethod,
        fixedDays: p.fixed_days,
        weeklyOffDay: p.weekly_off_day,
        includedWeekdays: Array.isArray((p as unknown as { included_weekdays?: unknown }).included_weekdays)
          ? ((p as unknown as { included_weekdays: unknown[] }).included_weekdays.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6))
          : null,
      }));


      const resourceByDesignation = new Map<string, ContractResourceLike>();
      for (const r of resources) {
        const did = String(r.designation_id ?? "");
        if (!did) continue;
        resourceByDesignation.set(did, {
          designationId: did,
          components: Array.isArray(r.components)
            ? (r.components as {
                name: string;
                amount: number;
                allowanceId?: string | null;
                includeInOt?: boolean | null;
                formulaMode?: string | null;
                formulaExpression?: string | null;
                formulaVersion?: number | null;
              }[]).map((c) => ({
                name: String(c.name ?? ""),
                amount: Number(c.amount) || 0,
                allowanceId: c.allowanceId ?? null,
                includeInOt: c.includeInOt,
                formulaMode: c.formulaMode ?? null,
                formulaExpression: c.formulaExpression ?? null,
                formulaVersion: c.formulaVersion ?? null,
              }))
            : [],
          benefits: Array.isArray(r.benefits) ? (r.benefits as { name: string; amount: number }[]) : [],
          deductions: Array.isArray(r.deductions) ? (r.deductions as { name: string; amount: number; allowanceId?: string | null; costComponentId?: string | null }[]) : [],
          employerContributions: Array.isArray(r.employer_contributions)
            ? (r.employer_contributions as { name: string; amount: number; allowanceId?: string | null; costComponentId?: string | null }[])
            : [],
          payrollDayBase: r.payroll_day_base_id
            ? pdbMap.get(String(r.payroll_day_base_id)) ?? null
            : null,
        });
      }

      // Overlay latest formula_mode/expression/version from Control Center
      // masters so paysheets/invoices reflect master-formula edits without
      // requiring contracts to be re-saved.
      const hydratedList = await hydrateFormulasFromMaster(Array.from(resourceByDesignation.values()));
      for (const r of hydratedList) {
        resourceByDesignation.set(r.designationId, r);
      }

      // 4. Build line items per (candidate, designation_id).
      // Each candidate gets a primary line (their own designation) plus an extra
      // line for any other designation found in their attendance entries.
      const rosterById = new Map(roster.map((c) => [c.id, c]));
      const pairKey = (cid: string, did: string | null) => `${cid}|${did ?? "__none__"}`;
      const pairs = new Map<string, { candidateId: string; designationId: string | null }>();

      for (const c of roster) {
        const k = pairKey(c.id, c.designation_id ?? null);
        pairs.set(k, { candidateId: c.id, designationId: c.designation_id ?? null });
      }
      for (const e of entries) {
        if (!rosterById.has(e.candidate_id)) continue;
        const k = pairKey(e.candidate_id, e.designation_id);
        if (!pairs.has(k)) pairs.set(k, { candidateId: e.candidate_id, designationId: e.designation_id });
      }

      const rows = Array.from(pairs.values()).map((p) => {
        const c = rosterById.get(p.candidateId)!;
        const did = p.designationId ? String(p.designationId) : "";
        const designationName = (p.designationId && desigMap.get(p.designationId)) || "—";
        // Filter entries to just this (candidate, designation) pair so totals reflect only that line.
        const lineEntries = entries.filter(
          (e) => e.candidate_id === p.candidateId && (e.designation_id ?? null) === p.designationId,
        );
        const totals = computeAttendanceTotals(
          c.id,
          periodDates,
          lineEntries as AttendanceEntryLike[],
          (codes ?? []) as AttendanceCodeLike[],
        );
        const isPrimary = (c.designation_id ?? null) === p.designationId;
        // Apply per-employee day adjustments — primary designation line only.
        if (isPrimary) {
          const adj = dayAdjustmentByCandidate.get(c.id);
          if (adj) {
            totals.pDays = Math.max(0, totals.pDays + adj.pDays);
            totals.otDays = Math.max(0, totals.otDays + adj.otDays);
            totals.phDays = Math.max(0, totals.phDays + adj.phDays);
            totals.otherPaidDays = Math.max(0, totals.otherPaidDays + adj.otherPaidDays);
            totals.tDays = Math.max(0, totals.tDays + adj.tDays);
          }
          const phDisplay = phDisplayCountByCandidate.get(c.id) ?? 0;
          if (phDisplay) totals.phDays = totals.phDays + phDisplay;
        }
        const resource = resourceByDesignation.get(did);
        const phOverride = isPrimary ? phCashByCandidate.get(c.id) : undefined;
        const wages = resource
          ? computeWages(totals, resource, periodDates.length, {
              phOverrideAmount: phOverride,
              periodDates: periodDates.map((d) => new Date(d)),
              dayBases,
            })
          : null;
        const candidateGender = ((c as unknown as { gender?: string | null }).gender ?? "").toString();
        const candidateIsDisabled = Boolean((c as unknown as { is_disabled?: boolean | null }).is_disabled);
        if (wages && isPrimary) {
          const extraAdds = additionsByCandidate.get(c.id) ?? [];
          const extraDeds = deductionsByCandidate.get(c.id) ?? [];
          (wages as unknown as { additions: PerEmpItem[] }).additions = extraAdds;
          if (extraDeds.length > 0) {
            wages.deductions = [...wages.deductions, ...extraDeds];
          }
          const addTotal = extraAdds.reduce((s, a) => s + a.amount, 0);
          wages.earnedGross = Math.round((wages.earnedGross + addTotal) * 100) / 100;
          Object.assign(wages, applyEsiToWageComputation(wages, { isDisabled: candidateIsDisabled }));
          const pt = resolvePtAmount({
            state: unitState,
            pincode: unitPincode,
            gender: candidateGender,
            earnedGross: wages.earnedGross,
            slabs: (ptSlabs ?? []) as PtSlabLike[],
            ranges: (pincodeRanges ?? []) as PincodeRangeLike[],
          });
          Object.assign(wages, applyPtToWageComputation(wages, pt.amount));

          // LWF from Control Center master (live-synced with payroll).
          if (lwfRows && pincodeRanges) {
            const lwfRes = resolveLwf(String(unitPincode ?? ""), pincodeRanges as never, lwfRows);
            const periodMonth = new Date(start).getMonth() + 1;
            let applies = false;
            let employee = 0;
            let employer = 0;
            if (lwfRes.kind === "match" && lwfRes.lwf.enabled) {
              const months = Array.isArray(lwfRes.lwf.deduction_months) ? lwfRes.lwf.deduction_months : [];
              if (months.length === 0 || months.includes(periodMonth)) {
                applies = true;
                employee = Number(lwfRes.lwf.employee_contribution) || 0;
                employer = Number(lwfRes.lwf.employer_contribution) || 0;
              }
            }
            Object.assign(wages, applyLwfToWageComputation(wages, { employee, employer, applies }));
          }

          // Statutory EPF employer split (EPS + EPF); total unchanged.
          Object.assign(wages, applyEpfBreakdownToWageComputation(wages));
        }

        // Merge split components (e.g. "HRA 5%" + "HRA 15%" -> "HRA") across
        // contract config and computed wages so invoice tables/exports show
        // a single column per canonical component. Totals are unchanged.
        const mergedResource = resource
          ? {
              ...resource,
              components: mergeByCanonicalName(resource.components),
              benefits: mergeByCanonicalName(resource.benefits ?? []),
              deductions: mergeByCanonicalName(resource.deductions ?? []),
              employerContributions: mergeByCanonicalName(resource.employerContributions ?? []),
            }
          : null;
        if (wages) {
          wages.components = mergeByCanonicalName(wages.components) as typeof wages.components;
          wages.deductions = mergeByCanonicalName(wages.deductions) as typeof wages.deductions;
          wages.employerContributions = mergeByCanonicalName(wages.employerContributions) as typeof wages.employerContributions;
        }
        return {
          id: c.id,
          rowKey: pairKey(c.id, p.designationId),
          employeeCode: c.employee_code || "",
          name: c.full_name || "—",
          designation: designationName,
          designationId: p.designationId,
          isPrimary,
          totals,
          wages,
          resource: mergedResource ?? resource ?? null,
          hasContract: !!resource,
        };
      });

      rows.sort((a, b) => {
        const an = (a.employeeCode || a.name).localeCompare(b.employeeCode || b.name);
        if (an !== 0) return an;
        // primary first, then by designation name
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.designation.localeCompare(b.designation);
      });

      return { rows, billingMode };
    },
  });



  const rows = data?.rows ?? [];
  const billingMode = data?.billingMode ?? "man_days";
  const [previewOpen, setPreviewOpen] = useState(false);


  useEffect(() => {
    if (!highlightCandidate || rows.length === 0) return;
    const el = document.getElementById(`invoice-row-${highlightCandidate}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightCandidate, rows.length]);



  const { data: orgSettings } = useOrgSettings();
  const COMPANY_STATE = (orgSettings?.company_state ?? "Maharashtra").trim();
  const COMPANY_STATE_SHORT = COMPANY_STATE.slice(0, 4);

  // ---------------------------------------------------------------------
  // SIMPLIFIED INVOICE MODEL
  // Contracted invoice = full contract billable value for the designation
  //   (all salary components + employer contributions).
  // Payroll days       = the contract's payroll-day base for this period
  //   (e.g. 26 fixed, actual days, actual minus weekly off) — never hard-coded.
  // Actual invoice     = contracted / payroll days × days actually billed
  //   (T days = present + paid holidays + other paid + OT days).
  // 26 days billed on a 26-day base → exactly the contract amount.
  // 28 days billed on a 26-day base → contract / 26 × 28.
  // ---------------------------------------------------------------------

  const invoiceMathFor = (r: (typeof rows)[number]) => {
    const contracted = r.resource
      ? Math.round(
          (r.resource.components.reduce((s, c) => s + (Number(c.amount) || 0), 0) +
            r.resource.employerContributions.reduce((s, c) => s + contractTotalAmount(c), 0)) * 100,
        ) / 100
      : 0;
    const payrollDays =
      resolvePayrollDayCount(r.resource?.payrollDayBase ?? null, periodDates) ??
      (r.wages?.baseDays || periodDates.length || 30);
    const billedDays = Math.round((r.totals.tDays ?? 0) * 100) / 100;
    const perDay = payrollDays > 0 ? contracted / payrollDays : 0;
    const actual =
      !r.wages || !r.resource
        ? 0
        : billingMode === "lumpsum"
          ? contracted
          : Math.round(perDay * billedDays * 100) / 100;
    return {
      contracted,
      payrollDays,
      billedDays,
      perDay: Math.round(perDay * 100) / 100,
      actual,
      variance: Math.round((actual - contracted) * 100) / 100,
    };
  };

  const billableFor = (r: (typeof rows)[number]): number => invoiceMathFor(r).actual;


  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        if (!r.wages) return acc;
        const m = invoiceMathFor(r);
        acc.projectedTotal += m.contracted;
        acc.actualTotal += m.actual;
        acc.tDays += r.totals.tDays;
        acc.payrollDays += m.payrollDays;
        acc.otHours += r.totals.otHours;
        return acc;
      },
      { projectedTotal: 0, actualTotal: 0, tDays: 0, payrollDays: 0, otHours: 0 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, billingMode]);

  // GST split: intra-state (customer in company state) → CGST + SGST; else IGST.
  const isIntraStateCurrent =
    (unitState ?? "").trim().toLowerCase() === COMPANY_STATE.toLowerCase();
  const GST_RATE = 18;
  const gstAmount = Math.round(totals.actualTotal * (GST_RATE / 100) * 100) / 100;
  const cgstAmount = isIntraStateCurrent ? Math.round(gstAmount / 2 * 100) / 100 : 0;
  const sgstAmount = isIntraStateCurrent ? Math.round(gstAmount / 2 * 100) / 100 : 0;
  const igstAmount = isIntraStateCurrent ? 0 : gstAmount;
  const grandTotal = Math.round((totals.actualTotal + gstAmount) * 100) / 100;

  const exportCsv = () => {
    const headers = [
      "Emp ID", "Name", "Designation", "P Days", "PH Days", "OT Hrs", "OT Days", "Billed Days",
      "Payroll Days", "Per Day Rate", "Contracted Invoice", "Actual Invoice", "Variance",
    ];
    const columns = headers.map((h) => ({ key: h, header: h }));
    const dataRows = rows.map((r) => {
      const m = invoiceMathFor(r);
      const cells: Record<string, unknown> = {
        "Emp ID": r.employeeCode,
        "Name": r.name,
        "Designation": r.designation,
        "P Days": r.totals.pDays,
        "PH Days": r.totals.phDays,
        "OT Hrs": r.totals.otHours,
        "OT Days": r.totals.otDays,
        "Billed Days": m.billedDays,
        "Payroll Days": m.payrollDays,
        "Per Day Rate": m.perDay,
        "Contracted Invoice": m.contracted,
        "Actual Invoice": r.wages ? m.actual : "",
        "Variance": r.wages ? m.variance : "",
      };
      return cells;
    });
    downloadCsv(`invoice-${unit?.code ?? unitId}-${start}-${end}`, dataRows, columns);
  };



  const exportTallyBilling = async () => {
    if (!unit) return;

    // Resolve service type name from active client contract for this unit.
    const { data: contracts } = await supabase
      .from("client_contracts")
      .select("service_type_id")
      .eq("unit_id", unitId)
      .eq("record_type", "client")
      .eq("status", "active")
      .order("start_date", { ascending: false })
      .limit(1);
    const serviceTypeId = contracts?.[0]?.service_type_id ?? null;
    let serviceTypeName = "Security Guard";
    if (serviceTypeId) {
      const { data: st } = await supabase
        .from("service_types")
        .select("name")
        .eq("id", serviceTypeId)
        .maybeSingle();
      if (st?.name) serviceTypeName = String(st.name);
    }

    const billingState = unit.billing_state || unit.customer?.billing_state || "";
    const isIntraState =
      billingState.trim().toLowerCase() === COMPANY_STATE.toLowerCase();
    const gstRate = 18;
    const cgstRate = isIntraState ? 9 : 0;
    const sgstRate = isIntraState ? 9 : 0;
    const igstRate = isIntraState ? 0 : gstRate;
    const salesLedger = isIntraState
      ? `Sale ${serviceTypeName} Charges ${COMPANY_STATE_SHORT} SGST/CGST ${gstRate}%`
      : `Sale ${serviceTypeName} Charges ${COMPANY_STATE_SHORT} IGST ${gstRate}%`;

    const monthAbbr = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const [ys, ms] = start.split("-").map(Number);
    const [ye] = end.split("-").map(Number);
    const fyStart = ms >= 4 ? ys : ys - 1;
    const fyEnd = fyStart + 1;
    const stateCode = gstinStateCode(unit.gstin) || "00";
    const vchNo = `${monthAbbr[ms - 1]}${String(ys).slice(2)}-${String(fyEnd).slice(2)}${(unit.code || "").toUpperCase()}`;
    const vchDate = end;
    const partyName = `${unit.customer_name || ""}, ${unit.name || unit.code || ""}`.trim();

    const addr1 = unit.billing_address1 || unit.customer?.billing_address1 || "";
    const addr2 = unit.billing_address2 || unit.customer?.billing_address2 || "";
    const addr3 = [
      unit.billing_city || unit.customer?.billing_city,
      unit.billing_district || unit.customer?.billing_district,
      unit.billing_pincode || unit.customer?.billing_pincode,
    ].filter(Boolean).join(", ");
    const pincode = unit.billing_pincode || unit.customer?.billing_pincode || "";
    const country = unit.billing_country || unit.customer?.billing_country || "India";

    const headers = [
      "Vch No.","Vch Type","Date","GST Registration","Bill to Place","Ship to Place","Reference No.",
      "Delivery Note No","Delivery Note Date","Order No","Order Date","Party Name","Ledger Group",
      "Registration Type","GSTIN No","Country","State","Pincode","Address 1","Address 2","Address 3",
      "Cost Center","Cost Center Amt","Sales Ledger","Item Name","Stock Group","Unit","Maintain Batches",
      "Applicable From","HSN Description","HSN","IGST Rate","CGST Rate","SGST Rate","CESS Rate",
      "Tracking No","Order No ","Order Due Date","Godown","Batch","Qty ","Incluse","Rate","Amt",
      "Additional Ledger","Amount","CGST Ledger","CGST Amt","SGST Ledger","SGST Amt","IGST Ledger",
      "IGST Amt","CESS Ledger","CESS Amt","Total","Narration","TALLYIMPORTSTATUS",
    ];
    const columns = headers.map((h) => ({ key: h, header: h }));

    const billingRows = rows
      .filter((r) => r.wages && r.resource)
      .map((r) => {
        const m = invoiceMathFor(r);
        const monthly = m.contracted;
        const amt = m.actual;
        // Simplified model: qty = days billed, rate = contract / payroll days.
        let qty: number;
        let rate: number;
        if (billingMode === "lumpsum") {
          qty = 1;
          rate = amt;
        } else {
          qty = m.billedDays;
          rate = m.payrollDays > 0 ? monthly / m.payrollDays : 0;
        }
        const cgstAmt = Math.round(amt * (cgstRate / 100) * 100) / 100;
        const sgstAmt = Math.round(amt * (sgstRate / 100) * 100) / 100;
        const igstAmt = Math.round(amt * (igstRate / 100) * 100) / 100;
        const total = Math.round((amt + cgstAmt + sgstAmt + igstAmt) * 100) / 100;
        const itemName = `${serviceTypeName} @${monthly.toFixed(2)} Per Month`;
        const narration = `${fmtPretty(start)} To ${fmtPretty(end)} Invoice`;
        const cell: Record<string, unknown> = {
          "Vch No.": vchNo,
          "Vch Type": `Sales ${COMPANY_STATE}`,
          "Date": vchDate,
          "GST Registration": `${COMPANY_STATE} Registration`,
          "Bill to Place": "",
          "Ship to Place": "",
          "Reference No.": vchNo,
          "Delivery Note No": "",
          "Delivery Note Date": "",
          "Order No": "",
          "Order Date": "",
          "Party Name": partyName,
          "Ledger Group": "Sundry Debtors",
          "Registration Type": "Regular",
          "GSTIN No": unit.gstin || "",
          "Country": country,
          "State": billingState,
          "Pincode": pincode,
          "Address 1": addr1,
          "Address 2": addr2,
          "Address 3": addr3,
          "Cost Center": COMPANY_STATE,
          "Cost Center Amt": "",
          "Sales Ledger": salesLedger,
          "Item Name": itemName,
          "Stock Group": "Primary",
          "Unit": "Duty",
          "Maintain Batches": "Yes",
          "Applicable From": "01-Jul-2017",
          "HSN Description": `${serviceTypeName} Services`,
          "HSN": 998525,
          "IGST Rate": igstRate || gstRate,
          "CGST Rate": cgstRate || 9,
          "SGST Rate": sgstRate || 9,
          "CESS Rate": "",
          "Tracking No": "",
          "Order No ": "",
          "Order Due Date": "",
          "Godown": "",
          "Batch": "",
          "Qty ": qty,
          "Incluse": "",
          "Rate": Math.round(rate * 1000000) / 1000000,
          "Amt": amt,
          "Additional Ledger": "",
          "Amount": "",
          "CGST Ledger": isIntraState ? `${COMPANY_STATE} CGST` : "",
          "CGST Amt": isIntraState ? cgstAmt : "",
          "SGST Ledger": isIntraState ? `${COMPANY_STATE} SGST` : "",
          "SGST Amt": isIntraState ? sgstAmt : "",
          "IGST Ledger": !isIntraState ? `${COMPANY_STATE} IGST` : "",
          "IGST Amt": !isIntraState ? igstAmt : "",
          "CESS Ledger": "",
          "CESS Amt": "",
          "Total": total,
          "Narration": narration,
          "TALLYIMPORTSTATUS": "",
        };
        return cell;
      });

    if (billingRows.length === 0) {
      // fall back to chooser-based export with empty headers
      downloadCsv(`Billing File_${end}_${unit.code ?? unitId}`, [{}], columns);
      return;
    }

    // Skip the chooser — Tally needs a strict .xlsx format.
    await writeXlsx({
      filename: `Billing File_${end}_${(unit.code || unitId).toUpperCase()}_${stateCode}`,
      rows: billingRows,
      columns,
    });
  };

  const invoiceUnlocked = sheet?.status === "approved";
  if (!invoiceUnlocked) {
    const attStatus = sheet?.status ?? null;
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/admin/invoice" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Back to invoice units
          </Link>
        </div>
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-amber-900 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.16em]">Invoice locked</div>
          <h1 className="mt-1 text-2xl font-semibold">{unit?.name || unit?.code || "Unit"}</h1>
          <p className="mt-3 text-sm">
            Invoice for {fmtPretty(start)} – {fmtPretty(end)} cannot be generated because attendance is
            {attStatus ? ` "${attStatus}"` : " not yet submitted"}. Invoices only run against <strong>approved</strong> attendance.
          </p>
          <div className="mt-4">
            <Link to="/admin/attendance/$unitId" params={{ unitId }} search={{ month: new Date(start).getMonth(), year: new Date(start).getFullYear() }}>
              <Button size="sm">Open attendance sheet</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/admin/invoice"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to invoice units
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <FileText className="mr-1.5 h-4 w-4" /> Preview invoice
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
          <Button variant="default" size="sm" onClick={exportTallyBilling}>
            <Download className="mr-1.5 h-4 w-4" /> Tally Billing File (XLSX)
          </Button>
        </div>
      </div>

      <InvoicePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        data={{
          invoiceNumber: `INV-${(unit?.code || "UNIT").toUpperCase()}-${start.replace(/-/g, "").slice(0, 6)}`,
          invoiceDate: fmtPretty(end),
          periodLabel: `${fmtPretty(start)} – ${fmtPretty(end)}`,
          companyName: orgSettings?.company_name ?? "Radiant Guard Services",
          companyGstin: orgSettings?.company_gstin ?? "",
          companyState: COMPANY_STATE,
          customerName: unit?.customer_name ?? "—",
          customerGstin: unit?.gstin ?? "",
          billingAddress: [
            unit?.billing_address1 ?? "",
            unit?.billing_address2 ?? "",
            [unit?.billing_city, unit?.billing_state, unit?.billing_pincode].filter(Boolean).join(", "),
          ],
          unitLabel: unit?.name || unit?.code || "Unit",
          lines: rows
            .filter((r) => r.wages)
            .map((r) => ({
              id: r.id,
              description: `${r.name} · ${r.designation}`,
              qtyLabel: `${invoiceMathFor(r).billedDays} of ${invoiceMathFor(r).payrollDays} days`,
              amount: billableFor(r),
            })),
          subtotal: totals.actualTotal,
          cgst: cgstAmount,
          sgst: sgstAmount,
          igst: igstAmount,
          grandTotal,
        }}
      />


      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Customer invoice</div>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">{unit?.name || unit?.code || "Unit"}</h1>
            <div className="mt-1 text-sm text-muted-foreground">
              {unit?.customer_name} · Period {fmtPretty(start)} – {fmtPretty(end)}
            </div>
          </div>
          {sheet?.status === "approved" && (
            <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              Attendance approved
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 font-semibold uppercase tracking-wider text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200">
            Billing mode: {billingMode.replace("_", " ")}
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-semibold uppercase tracking-wider text-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
            title={`Company state: ${COMPANY_STATE} · Unit state: ${unitState ?? "—"}`}
          >
            {isIntraStateCurrent ? `Intra-state (${COMPANY_STATE}) · CGST + SGST` : `Inter-state · IGST`}
          </span>
          {orgSettings?.company_gstin && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 font-mono font-semibold tracking-wider text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
              Company GSTIN: {orgSettings.company_gstin}
            </span>
          )}
          {unit?.gstin && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-100 px-2.5 py-1 font-mono font-semibold tracking-wider text-teal-800 dark:bg-teal-500/20 dark:text-teal-200">
              Customer GSTIN: {unit.gstin}
            </span>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Days billed" value={String(Math.round(totals.tDays * 100) / 100)} />
          <Stat label="Payroll days (sum)" value={String(Math.round(totals.payrollDays * 100) / 100)} />
          <Stat label="Contracted invoice" value={fmtINR(totals.projectedTotal)} />
          <Stat label="Actual invoice" value={fmtINR(totals.actualTotal)} tone="emerald" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {isIntraStateCurrent ? (
            <>
              <Stat label={`CGST @ ${GST_RATE / 2}%`} value={fmtINR(cgstAmount)} />
              <Stat label={`SGST @ ${GST_RATE / 2}%`} value={fmtINR(sgstAmount)} />
            </>
          ) : (
            <>
              <Stat label={`IGST @ ${GST_RATE}%`} value={fmtINR(igstAmount)} />
              <div />
            </>
          )}
          <Stat label={`Total GST @ ${GST_RATE}%`} value={fmtINR(gstAmount)} />
          <Stat label="Invoice grand total" value={fmtINR(grandTotal)} tone="emerald" />
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
        <div className="overflow-x-clip">
          <table className="ios-table min-w-full table-auto text-sm">
            <thead className="border-b border-border/60 bg-secondary/40">
              <tr className="text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <th className="px-4 py-3 font-medium">Emp ID</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Designation</th>
                <th className="px-4 py-3 text-right font-medium" title="Days actually billed (present + paid holidays + other paid + OT days)">Days billed</th>
                <th className="px-4 py-3 text-right font-medium" title="Payroll days for this contract in this period">Payroll days</th>
                <th className="px-4 py-3 text-right font-medium" title="Contracted invoice ÷ payroll days">Per day</th>
                <th className="px-4 py-3 text-right font-medium" title="Full contract value for this designation">Contracted invoice</th>
                <th className="px-4 py-3 text-right font-medium" title="Contracted ÷ payroll days × days billed">Actual invoice</th>
                <th className="px-4 py-3 text-right font-medium" title="Actual − Contracted">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">Computing invoice…</td></tr>
              ) : error ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-destructive">{error instanceof Error ? error.message : "Failed"}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">No employees mapped to this unit.</td></tr>
              ) : rows.map((r) => {
                const isHighlighted = highlightCandidate === r.id;
                const m = invoiceMathFor(r);
                return (
                <tr
                  key={r.rowKey}
                  id={`invoice-row-${r.rowKey}`}
                  className={`hover:bg-muted/40 ${isHighlighted ? "bg-emerald-50 ring-2 ring-emerald-400 dark:bg-emerald-950/40" : ""}`}
                >
                  <td className="px-4 py-3 font-mono text-xs">{r.employeeCode || "—"}</td>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.designation}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{m.billedDays}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{m.payrollDays}</td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums">{r.wages ? fmtINR(m.perDay) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.resource ? fmtINR(m.contracted) : <span className="text-xs text-amber-600">no contract</span>}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-700">{r.wages ? fmtINR(m.actual) : "—"}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${m.variance > 0 ? "text-emerald-700" : m.variance < 0 ? "text-rose-600" : "text-muted-foreground"}`}>{r.wages ? (m.variance === 0 ? fmtINR(0) : `${m.variance > 0 ? "+" : "−"} ${fmtINR(Math.abs(m.variance))}`) : "—"}</td>
                </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t border-border/60 bg-secondary/30 text-sm font-semibold">
                <tr>
                  <td className="px-4 py-3" colSpan={6}>Totals</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmtINR(totals.projectedTotal)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{fmtINR(totals.actualTotal)}</td>
                  <td className={`px-4 py-3 text-right ${totals.actualTotal - totals.projectedTotal >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                    {totals.actualTotal - totals.projectedTotal >= 0 ? "+ " : "− "}
                    {fmtINR(Math.abs(Math.round((totals.actualTotal - totals.projectedTotal) * 100) / 100))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>


      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Invoice breakdown · projected vs actual
          </h2>
          <span className="text-xs text-muted-foreground">
            Projected column = full billable amount · Actual column = billable based on T Days
          </span>
        </div>
        {rows.filter((r) => r.wages && r.resource).map((r) => {
          const projBillable =
            r.resource!.components.reduce((s, c) => s + (Number(c.amount) || 0), 0) +
            r.resource!.employerContributions.reduce((s, c) => s + contractTotalAmount(c), 0);
          return (
          <SalaryBreakdownPreview
            key={r.rowKey}
            employeeName={r.name}
            employeeCode={r.employeeCode}
            designationName={r.designation}
            tDays={r.totals.tDays}
            otHours={r.totals.otHours}
            baseDays={r.wages!.baseDays}
            components={r.resource!.components.map((c) => ({ name: c.name, amount: Number(c.amount) || 0 }))}
            benefits={(r.resource!.benefits ?? []).map((b) => ({ name: b.name, amount: Number(b.amount) || 0 }))}
            deductions={(r.resource!.deductions ?? []).map((b) => ({ name: b.name, amount: Number(b.amount) || 0 }))}
            employerContributions={(r.resource!.employerContributions ?? []).map((b) => ({ name: b.name, amount: contractTotalAmount(b) }))}
            earnedComponents={r.wages!.components.map((c) => ({ name: c.name, amount: Number(c.amount) || 0 }))}
            earnedGross={r.wages!.earnedGross}
            earnedEmployerContributions={r.wages!.employerContributions.map((b) => ({ name: b.name, amount: Number(b.amount) || 0 }))}
            earnedDeductions={r.wages!.deductions.map((b) => ({ name: b.name, amount: Number(b.amount) || 0 }))}
            totalEarnedDeductions={r.wages!.totalDeductions}
            earnedNetPayable={r.wages!.netPay}
            projectedBillable={projBillable}
            actualBillable={billableFor(r)}
            gstRate={GST_RATE}
            intraState={isIntraStateCurrent}
          />
          );
        })}

        {rows.filter((r) => !r.wages).length > 0 && (
          <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900">
            {rows.filter((r) => !r.wages).length} employee(s) have no contract mapped for their designation and were excluded from the breakdown.
          </div>
        )}
      </div>
    </div>
  );
}

function SalaryBreakdownPreview({
  employeeName,
  employeeCode,
  designationName,
  tDays,
  otHours,
  baseDays,
  components,
  benefits,
  deductions,
  employerContributions,
  earnedComponents,
  earnedGross: earnedGrossProp,
  earnedEmployerContributions,
  earnedDeductions,
  totalEarnedDeductions,
  earnedNetPayable,
  projectedBillable,
  actualBillable,
  gstRate,
  intraState,
}: {
  employeeName: string;
  employeeCode: string;
  designationName: string;
  tDays: number;
  otHours: number;
  baseDays: number;
  components: { name: string; amount: number }[];
  benefits: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  employerContributions: { name: string; amount: number }[];
  earnedComponents: { name: string; amount: number }[];
  earnedGross: number;
  earnedEmployerContributions: { name: string; amount: number }[];
  earnedDeductions: { name: string; amount: number }[];
  totalEarnedDeductions: number;
  earnedNetPayable: number;
  projectedBillable: number;
  actualBillable: number;
  gstRate: number;
  intraState: boolean;
}) {
  const componentsTotal = components.reduce((s, c) => s + c.amount, 0);
  const benefitsTotal = benefits.reduce((s, b) => s + b.amount, 0);
  const gross = componentsTotal + benefitsTotal;
  const deductionsTotal = deductions.reduce((s, b) => s + contractTotalAmount(b), 0);
  const netPayable = gross - deductionsTotal;

  const ratio = baseDays > 0 ? tDays / baseDays : 0;
  const earnedFor = (amount: number) => Math.round(amount * ratio * 100) / 100;
  const earnedGross = earnedGrossProp;
  const earnedComponentFor = (name: string, amount: number) =>
    earnedComponents.find((c) => c.name === name)?.amount ?? earnedFor(amount);
  const earnedDeductionFor = (name: string, amount: number) =>
    earnedDeductions.find((d) => d.name === name)?.amount ?? earnedFor(amount);
  const earnedEmployerFor = (name: string, amount: number) =>
    earnedEmployerContributions.find((d) => d.name === name)?.amount ?? earnedFor(amount);

  const visibleComponents = components.filter((c) => c.amount > 0);
  const visibleBenefits = benefits.filter((b) => b.amount > 0);
  const visibleDeductions = deductions.filter((b) => b.amount > 0 || isEsiItem(b));
  const visibleEmployer = employerContributions.filter(
    (b) => b.amount > 0 || earnedEmployerFor(b.name, b.amount) > 0,
  );

  // Extra earned lines not present in contract config (Overtime, Paid Holiday,
  // ad-hoc additions) so the rows sum exactly to Earned Gross.
  const contractNames = new Set([...components, ...benefits].map((c) => c.name.toLowerCase()));
  const extraEarnedLines = earnedComponents.filter(
    (c) => c.amount > 0 && !contractNames.has(c.name.toLowerCase()),
  );

  const employerTotal = employerContributions.reduce((s, b) => s + b.amount, 0);
  const earnedEmployerTotal =
    Math.round(earnedEmployerContributions.reduce((s, b) => s + b.amount, 0) * 100) / 100;
  const projGst = Math.round(projectedBillable * (gstRate / 100) * 100) / 100;
  const actGst = Math.round(actualBillable * (gstRate / 100) * 100) / 100;


  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-2.5">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            {employeeName}
            {employeeCode && <span className="ml-2 text-xs font-mono text-muted-foreground">{employeeCode}</span>}
          </h4>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Salary Breakdown Preview
          </p>
        </div>
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
                  {tDays}
                </span>
              </td>
            </tr>
            <tr className="bg-muted/40">
              <td className="font-bold uppercase text-foreground">Salary Particulars</td>
              <td className="text-center font-bold">{baseDays} Days (contract)</td>
              <td />
              <td className="text-right font-bold tracking-wider">( EARNED ) Rs.</td>
            </tr>
            {visibleComponents.length === 0 && visibleBenefits.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-3 text-center text-xs text-muted-foreground">
                  No salary particulars configured.
                </td>
              </tr>
            ) : (
              <>
                {visibleComponents.map((c) => (
                  <tr key={`c-${c.name}`}>
                    <td>{c.name}</td>
                    <td className="text-center tabular-nums">{c.amount.toFixed(2)}</td>
                    <td />
                    <td className="text-right tabular-nums">{earnedComponentFor(c.name, c.amount).toFixed(2)}</td>
                  </tr>
                ))}
                {visibleBenefits.map((b) => (
                  <tr key={`b-${b.name}`}>
                    <td>{b.name}</td>
                    <td className="text-center tabular-nums">{b.amount.toFixed(2)}</td>
                    <td />
                    <td className="text-right tabular-nums">{earnedComponentFor(b.name, b.amount).toFixed(2)}</td>
                  </tr>
                ))}
                {extraEarnedLines.map((c) => (
                  <tr key={`x-${c.name}`}>
                    <td>
                      {c.name}
                      {/overtime|ot/i.test(c.name) && otHours > 0 && (
                        <span className="ml-2 text-[11px] text-muted-foreground">{otHours} hrs</span>
                      )}
                    </td>
                    <td className="text-center text-xs text-muted-foreground">—</td>
                    <td />
                    <td className="text-right tabular-nums">{c.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </>
            )}
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
            {visibleDeductions.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-3 text-center text-xs text-muted-foreground">
                  No deductions configured.
                </td>
              </tr>
            ) : (
              visibleDeductions.map((b) => (
                <tr key={`d-${b.name}`}>
                  <td>{b.name}</td>
                  <td className="text-center tabular-nums">{isEsiItem(b) ? "—" : b.amount.toFixed(2)}</td>
                  <td />
                  <td className="text-right tabular-nums">{earnedDeductionFor(b.name, b.amount).toFixed(2)}</td>
                </tr>
              ))
            )}
            <tr className="bg-rose-100 font-semibold dark:bg-rose-500/20">
              <td className="uppercase">Total Deductions Rs.</td>
              <td className="text-center tabular-nums">{deductionsTotal.toFixed(2)}</td>
              <td />
              <td className="text-right tabular-nums">{totalEarnedDeductions.toFixed(2)}</td>
            </tr>
            <tr className="bg-cyan-100 font-bold dark:bg-cyan-500/20">
              <td className="uppercase">Net Pay to Employee Rs.</td>
              <td className="text-center tabular-nums">{netPayable.toFixed(2)}</td>
              <td />
              <td className="text-right text-base tabular-nums">{earnedNetPayable.toFixed(2)}</td>
            </tr>

            {/* Client-billing view: statutory employer cost + service value + GST */}
            <tr className="bg-muted/40">
              <td className="font-bold uppercase text-foreground">Employer Contributions (billable)</td>
              <td className="text-center font-bold">Contracted</td>
              <td />
              <td className="text-right font-bold tracking-wider">( EARNED ) Rs.</td>
            </tr>
            {visibleEmployer.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-3 text-center text-xs text-muted-foreground">
                  No employer contributions configured.
                </td>
              </tr>
            ) : (
              visibleEmployer.map((b) => (
                <tr key={`ec-${b.name}`}>
                  <td>{b.name}</td>
                  <td className="text-center tabular-nums">{b.amount.toFixed(2)}</td>
                  <td />
                  <td className="text-right tabular-nums">{earnedEmployerFor(b.name, b.amount).toFixed(2)}</td>
                </tr>
              ))
            )}
            <tr className="bg-amber-100/70 font-semibold dark:bg-amber-500/20">
              <td className="uppercase">Total Employer Contributions Rs.</td>
              <td className="text-center tabular-nums">{employerTotal.toFixed(2)}</td>
              <td />
              <td className="text-right tabular-nums">{earnedEmployerTotal.toFixed(2)}</td>
            </tr>
            <tr className="bg-slate-100 font-bold dark:bg-slate-500/20">
              <td className="uppercase">Taxable Value (Billable) Rs.</td>
              <td className="text-center tabular-nums">{projectedBillable.toFixed(2)}</td>
              <td />
              <td className="text-right text-base tabular-nums">{actualBillable.toFixed(2)}</td>
            </tr>
            {intraState ? (
              <>
                <tr>
                  <td>CGST @ {gstRate / 2}%</td>
                  <td className="text-center tabular-nums">{(projGst / 2).toFixed(2)}</td>
                  <td />
                  <td className="text-right tabular-nums">{(actGst / 2).toFixed(2)}</td>
                </tr>
                <tr>
                  <td>SGST @ {gstRate / 2}%</td>
                  <td className="text-center tabular-nums">{(projGst / 2).toFixed(2)}</td>
                  <td />
                  <td className="text-right tabular-nums">{(actGst / 2).toFixed(2)}</td>
                </tr>
              </>
            ) : (
              <tr>
                <td>IGST @ {gstRate}%</td>
                <td className="text-center tabular-nums">{projGst.toFixed(2)}</td>
                <td />
                <td className="text-right tabular-nums">{actGst.toFixed(2)}</td>
              </tr>
            )}
            <tr className="bg-emerald-100 font-bold dark:bg-emerald-500/20">
              <td className="uppercase">Total Invoice Value Rs.</td>
              <td className="text-center tabular-nums">{(projectedBillable + projGst).toFixed(2)}</td>
              <td />
              <td className="text-right text-base tabular-nums">{(actualBillable + actGst).toFixed(2)}</td>
            </tr>

          </tbody>
        </table>
      </div>
    </div>
  );
}


function Stat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" }) {
  const cls = tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border/60 bg-background px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
