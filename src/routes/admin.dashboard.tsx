import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Building2, Briefcase, CalendarDays, ChevronLeft, ChevronRight,
  ClipboardList, Files, Fuel, PackageOpen, Receipt, TrendingDown, TrendingUp,
  UserPlus, Wallet, Warehouse, AlertTriangle, ArrowRight, ArrowUpRight, Sparkles,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { DashboardShell } from "@/components/LiveFeed";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadialGauge } from "@/components/charts/RadialGauge";
import { useCountUp } from "@/hooks/useCountUp";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentPermissions } from "@/lib/rbac";
import { InventoryOwnerDashboard } from "./admin.inventory.dashboard";
import {
  fmtINR,
  computeAttendanceTotals,
  computeWages,
  type AttendanceCodeLike,
  type AttendanceEntryLike,
  type ContractResourceLike,
} from "@/lib/payroll-calc";
import { fetchAttendanceEntriesForPeriod } from "@/lib/attendance-fetch";
import { hydrateFormulasFromMaster } from "@/lib/contract-hydrate";
import { resolvePayrollDayCount } from "@/lib/payroll-days";
import { PeopleInsightsCard } from "@/components/PeopleInsightsCard";
import { usePeopleInsights } from "@/lib/people-insights";
import { LiveFieldOfficersCard } from "@/components/LiveFieldOfficersCard";

import { EmployeeInsightsSection } from "@/components/EmployeeInsightsSection";
import { ClientContractPortfolioCard } from "@/components/ClientContractPortfolioCard";
import { WorkforceCoverageCard } from "@/components/WorkforceCoverage";
import { AttendanceTodayCard } from "@/components/AttendanceCoverage";
import {
  PayrollCoverageCard,
  InvoiceCoverageCard,
  ProfitabilityCard,
  type UnitFinanceRow,
} from "@/components/FinanceCoverage";


function PeopleInsightsSection({ compact }: { compact?: boolean }) {
  const { isLoading, showSixtyPlus, birthdays, anniversaries, sixtyPlus } = usePeopleInsights();
  return (
    <div className="flex flex-col gap-4">
      <LiveFieldOfficersCard />
      {!compact && (
        <>
          <PeopleInsightsCard kind="birthdays" items={birthdays} isLoading={isLoading} />
          <PeopleInsightsCard kind="anniversaries" items={anniversaries} isLoading={isLoading} />
          {showSixtyPlus && (
            <PeopleInsightsCard kind="sixty-plus" items={sixtyPlus} isLoading={isLoading} />
          )}
        </>
      )}
    </div>
  );
}



export const Route = createFileRoute("/admin/dashboard")({
  component: DashboardPage,
});

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type PnLRow = {
  unit_id: string;
  unit_code: string;
  unit_name: string;
  customer_name: string;
  contract_value: number;
  invoice_amount: number;
  payroll_cost: number;
  variance: number;
  variance_pct: number;
  /** Full-month contracted payroll cost (components + ER + benefits) × headcount. */
  committed_payroll: number;
  /** Contracted headcount and employees actually mapped to the unit. */
  committed_strength: number;
  actual_strength: number;
  /** Internal (own-company) unit: cost centre, never billed to a customer. */
  internal: boolean;
};


function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const { can, isLoading: permsLoading } = useCurrentPermissions();
  const showInventoryDashboard =
    can("inventory") &&
    !can("organizations") &&
    !can("contracts") &&
    !can("employees") &&
    !can("vehicles") &&
    !can("attendance") &&
    !can("payroll") &&
    !can("invoice");

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = (() => {
    const d = new Date(year, month + 1, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-snapshot", year, month],
    enabled: !permsLoading && !showInventoryDashboard,
    queryFn: async () => {
      const sixtyDaysOut = new Date();
      sixtyDaysOut.setDate(sixtyDaysOut.getDate() + 60);
      const sixtyStr = sixtyDaysOut.toISOString().slice(0, 10);
      const todayStr = new Date().toISOString().slice(0, 10);

      const [
        { count: orgsCount },
        { count: unitsCount },
        { count: empCount },
        { count: contractsActive },
        { data: contractsExpiring },
        { count: vehiclesCount },
        { data: fuelMonth },
        { count: itemsCount },
        { data: sheetsMonth },
        { data: runsMonth },
        { data: contractsForPnl },
        { data: unitsForPnl },
      ] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("units").select("id", { count: "exact", head: true }),
        supabase.from("candidates").select("id", { count: "exact", head: true }).eq("is_enabled", true).eq("status", "active"),
        supabase.from("client_contracts").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("client_contracts")
          .select("id, contract_code, end_date, unit_id, status")
          .eq("status", "active")
          .gte("end_date", todayStr)
          .lte("end_date", sixtyStr)
          .order("end_date", { ascending: true })
          .limit(10),
        supabase.from("vehicles").select("id", { count: "exact", head: true }),
        supabase.from("vehicle_fuel_entries").select("amount").gte("entry_date", monthStart).lte("entry_date", monthEnd),
        supabase.from("inv_items").select("id", { count: "exact", head: true }),
        supabase.from("attendance_sheets" as never).select("status").lte("period_start", monthEnd).gte("period_end", monthStart),
        supabase.from("payroll_runs" as never).select("status").lte("period_start", monthEnd).gte("period_end", monthStart),
        supabase.from("client_contracts")
          .select("id, unit_id, status, start_date, end_date, is_internal")

          .eq("status", "active")
          .lte("start_date", monthEnd)
          .or(`end_date.is.null,end_date.gte.${monthStart}`),
        supabase.from("units").select("id, code, name, customer_id, epf_cap_enabled"),
      ]);

      const sheets = (sheetsMonth ?? []) as Array<{ status: string | null }>;
      const sheetCounts = { approved: 0, pending: 0, draft: 0, rejected: 0 };
      for (const s of sheets) {
        const v = (s.status || "").toLowerCase();
        if (v === "approved") sheetCounts.approved += 1;
        else if (v === "submitted" || v === "pending") sheetCounts.pending += 1;
        else if (v === "rejected") sheetCounts.rejected += 1;
        else sheetCounts.draft += 1;
      }
      const runs = (runsMonth ?? []) as Array<{ status: string | null }>;
      const runCounts = { approved: 0, pending: 0, draft: 0, rejected: 0 };
      for (const r of runs) {
        const v = (r.status || "").toLowerCase();
        if (v === "approved") runCounts.approved += 1;
        else if (v === "submitted") runCounts.pending += 1;
        else if (v === "rejected") runCounts.rejected += 1;
        else runCounts.draft += 1;
      }
      const fuelTotal = (fuelMonth ?? []).reduce((s: number, e: { amount: number | null }) => s + (Number(e.amount) || 0), 0);

      // ── P&L from actual attendance ────────────────────────────────────
      // Mirrors the Invoice and Payroll modules: per (candidate × designation)
      // we compute T-Days from attendance, then scale the contract resource by
      // earnedGross/contractGross. Payroll cost is gross wages + benefits;
      // invoice billable adds employer contributions on top of that cost.
      //
      // Internal contracts (own offices / non-billable staff) are a pure cost
      // centre: they contribute payroll cost but never contract value or
      // invoice revenue, otherwise the P&L overstates both.
      const activeContracts = (contractsForPnl ?? []) as Array<{
        id: string;
        unit_id: string | null;
        is_internal: boolean | null;
        start_date: string;
      }>;

      // A unit can briefly have overlapping active contracts during renewal.
      // The finance registers use one current contract, so the dashboard must
      // do the same instead of pricing the same attendance more than once.
      const currentContractByUnit = new Map<string, (typeof activeContracts)[number]>();
      for (const contract of activeContracts) {
        if (!contract.unit_id) continue;
        const current = currentContractByUnit.get(contract.unit_id);
        if (!current || contract.start_date > current.start_date) {
          currentContractByUnit.set(contract.unit_id, contract);
        }
      }
      const currentContracts = Array.from(currentContractByUnit.values());

      const contractIds = currentContracts.map((c) => c.id);
      const unitIdsInScope = Array.from(
        new Set(currentContracts.map((c) => c.unit_id).filter((v): v is string => !!v)),
      );
      const unitsById = new Map((unitsForPnl ?? []).map((u) => [u.id, u]));
      const customerIds = Array.from(
        new Set(
          (unitsForPnl ?? [])
            .filter((u) => unitIdsInScope.includes(u.id))
            .map((u) => u.customer_id)
            .filter((v): v is string => !!v),
        ),
      );
      const { data: customers } = customerIds.length
        ? await supabase.from("customers").select("id, name").in("id", customerIds)
        : { data: [] as { id: string; name: string }[] };
      const custNameById = new Map((customers ?? []).map((c) => [c.id, c.name as string]));

      // Bulk fetch resources, attendance, codes, day bases, roster.
      const emptyUuid = "00000000-0000-0000-0000-000000000000";
      const [
        { data: resourcesRaw },
        { data: codesRaw },
        { data: primaryRoster },
        { data: roleLinks },
      ] = await Promise.all([
        contractIds.length
          ? supabase
              .from("contract_resources")
              .select(
                "contract_id, designation_id, quantity, components, benefits, deductions, employer_contributions, payroll_day_base_id",
              )
              .in("contract_id", contractIds)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        supabase
          .from("attendance_codes")
          .select("code, counts_as_present, is_paid")
          .eq("enabled", true),
        unitIdsInScope.length
          ? supabase
              .from("candidates")
              .select("id, full_name, designation_id, unit_id")
              .in("unit_id", unitIdsInScope)
              .eq("is_enabled", true)
              .eq("status", "active")
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        unitIdsInScope.length
          ? supabase
              .from("candidate_units")
              .select("candidate_id, unit_id")
              .in("unit_id", unitIdsInScope)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      ]);

      type ResourceRow = {
        contract_id: string;
        designation_id: string | null;
        quantity: number | null;
        components: unknown;
        benefits: unknown;
        deductions: unknown;
        employer_contributions: unknown;
        payroll_day_base_id: string | null;
      };
      type AttRow = {
        unit_id: string;
        candidate_id: string;
        designation_id: string | null;
        entry_date: string;
        code: string;
        ot_hours: number | string | null;
      };
      const resources = (resourcesRaw ?? []) as ResourceRow[];
      const selectedMonthIsCurrent = year === now.getFullYear() && month === now.getMonth();
      const attendanceEnd = selectedMonthIsCurrent && todayStr < monthEnd ? todayStr : monthEnd;
      const attendance = await fetchAttendanceEntriesForPeriod({ unitIds: unitIdsInScope, start: monthStart, end: attendanceEnd, includeUnitId: true }) as AttRow[];
      const codes = (codesRaw ?? []) as AttendanceCodeLike[];
      const primaryCands = (primaryRoster ?? []) as Array<{
        id: string; full_name: string | null; designation_id: string | null; unit_id: string | null;
      }>;
      const links = (roleLinks ?? []) as Array<{ candidate_id: string; unit_id: string }>;

      // Payroll day bases.
      const pdbIds = Array.from(
        new Set(resources.map((r) => r.payroll_day_base_id).filter((v): v is string => !!v)),
      );
      const { data: pdbs } = pdbIds.length
        ? await supabase
            .from("payroll_day_bases")
            .select("id, method, fixed_days, weekly_off_day, included_weekdays")
            .in("id", pdbIds)
        : { data: [] as Array<{ id: string; method: string; fixed_days: number | null; weekly_off_day: number | null }> };
      const pdbMap = new Map<string, NonNullable<ContractResourceLike["payrollDayBase"]>>(
        (pdbs ?? []).map((p) => [
          p.id,
          {
            method: p.method as "actual_days" | "fixed_days" | "actual_minus_weekly_off" | "custom_weekdays",
            fixedDays: p.fixed_days,
            weeklyOffDay: p.weekly_off_day,
            includedWeekdays: Array.isArray((p as unknown as { included_weekdays?: unknown }).included_weekdays)
              ? (p as unknown as { included_weekdays: unknown[] }).included_weekdays.map(Number)
              : null,
          },
        ]),
      );

      // Need to load secondary roster (candidates referenced via candidate_units).
      const secondaryIds = Array.from(
        new Set(links.map((l) => l.candidate_id).filter((id) => !primaryCands.some((c) => c.id === id))),
      );
      const { data: secondaryCands } = secondaryIds.length
        ? await supabase
            .from("candidates")
            .select("id, full_name, designation_id")
            .in("id", secondaryIds)
            .eq("is_enabled", true)
            .eq("status", "active")
        : { data: [] as Array<{ id: string; full_name: string | null; designation_id: string | null }> };
      const candById = new Map<string, { id: string; full_name: string | null; designation_id: string | null }>();
      for (const c of primaryCands) candById.set(c.id, c);
      for (const c of (secondaryCands ?? [])) candById.set(c.id, c);

      // Roster grouped by unit.
      const rosterByUnit = new Map<string, Set<string>>();
      for (const c of primaryCands) {
        if (!c.unit_id) continue;
        if (!rosterByUnit.has(c.unit_id)) rosterByUnit.set(c.unit_id, new Set());
        rosterByUnit.get(c.unit_id)!.add(c.id);
      }
      for (const l of links) {
        if (!candById.has(l.candidate_id)) continue;
        if (!rosterByUnit.has(l.unit_id)) rosterByUnit.set(l.unit_id, new Set());
        rosterByUnit.get(l.unit_id)!.add(l.candidate_id);
      }

      // Resources grouped by (contract_id → designation_id → resource).
      const resByContractDesig = new Map<string, Map<string, ResourceRow>>();
      for (const r of resources) {
        if (!r.designation_id) continue;
        if (!resByContractDesig.has(r.contract_id)) resByContractDesig.set(r.contract_id, new Map());
        resByContractDesig.get(r.contract_id)!.set(r.designation_id, r);
      }

      const toResource = (r: ResourceRow): ContractResourceLike => ({
        designationId: r.designation_id ?? "",
        components: Array.isArray(r.components) ? (r.components as ContractResourceLike["components"]) : [],
        benefits: Array.isArray(r.benefits) ? (r.benefits as ContractResourceLike["benefits"]) : [],
        deductions: Array.isArray(r.deductions) ? (r.deductions as ContractResourceLike["deductions"]) : [],
        employerContributions: Array.isArray(r.employer_contributions)
          ? (r.employer_contributions as ContractResourceLike["employerContributions"])
          : [],
        payrollDayBase: r.payroll_day_base_id ? pdbMap.get(r.payroll_day_base_id) ?? null : null,
      });

      const hydratedResources = await hydrateFormulasFromMaster(resources.map(toResource));
      const hydratedByContractDesignation = new Map(
        resources.map((row, index) => [
          `${row.contract_id}|${row.designation_id ?? ""}`,
          hydratedResources[index] ?? toResource(row),
        ]),
      );
      const isNonBillableInvoiceItem = (item: { name?: string }) =>
        /\besi(c)?\b|\bprofessional\s*tax\b|\bpt\b/i.test(String(item.name ?? ""));

      // Period dates.
      const periodDates: string[] = [];
      {
        const s = new Date(monthStart);
        const e = new Date(monthEnd);
        for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
          periodDates.push(d.toISOString().slice(0, 10));
        }
      }

      const pnlByUnit = new Map<string, PnLRow>();
      for (const contract of currentContracts) {
        if (!contract.unit_id) continue;
        const u = unitsById.get(contract.unit_id);
        if (!u) continue;
        const resMap = resByContractDesig.get(contract.id) ?? new Map();
        const isInternal = contract.is_internal === true;

        // Contract value reference: full-month projected per resource × quantity.
        // Payroll = wage components + benefits. Invoice = payroll + employer
        // contributions. Internal contracts remain payroll-only cost centres.
        let contractValue = 0;
        let committedPayroll = 0;
        let committedStrength = 0;
        for (const r of resMap.values()) {
          const qty = Number(r.quantity) || 0;
          committedStrength += qty;
          const resource = hydratedByContractDesignation.get(
            `${r.contract_id}|${r.designation_id ?? ""}`,
          ) ?? toResource(r);
          const payrollPerHead = resource.components.reduce(
            (sum, item) => sum + (Number(item.amount) || 0),
            0,
          );
          const invoicePerHead = payrollPerHead + resource.employerContributions.reduce(
            (sum, item) => sum + (isNonBillableInvoiceItem(item) ? 0 : Number(item.amount) || 0),
            0,
          );
          committedPayroll += qty * payrollPerHead;
          if (!isInternal) {
            contractValue += qty * invoicePerHead;
          }
        }


        // Actuals from attendance.
        const unitRoster = rosterByUnit.get(contract.unit_id) ?? new Set<string>();
        const unitAtt = attendance.filter((a) => a.unit_id === contract.unit_id);

        // Build (candidate, designation) pairs the same way the Invoice page does.
        const pairs = new Map<string, { candidateId: string; designationId: string | null }>();
        const pairKey = (cid: string, did: string | null) => `${cid}|${did ?? "_"}`;
        for (const cid of unitRoster) {
          const c = candById.get(cid);
          if (!c) continue;
          pairs.set(pairKey(cid, c.designation_id ?? null), {
            candidateId: cid,
            designationId: c.designation_id ?? null,
          });
        }
        for (const e of unitAtt) {
          if (!unitRoster.has(e.candidate_id)) continue;
          pairs.set(pairKey(e.candidate_id, e.designation_id), {
            candidateId: e.candidate_id,
            designationId: e.designation_id,
          });
        }

        let invoiceAmount = 0;
        let payrollCost = 0;
        for (const p of pairs.values()) {
          if (!p.designationId) continue;
          const resRow = resMap.get(p.designationId);
          if (!resRow) continue;
          const lineEntries = unitAtt
            .filter((e) => e.candidate_id === p.candidateId && (e.designation_id ?? null) === p.designationId)
            .map((e) => ({
              candidate_id: e.candidate_id,
              entry_date: e.entry_date,
              code: e.code,
              ot_hours: e.ot_hours,
            })) as AttendanceEntryLike[];
          const totals = computeAttendanceTotals(p.candidateId, periodDates, lineEntries, codes);
          const resource = hydratedByContractDesignation.get(
            `${contract.id}|${p.designationId}`,
          ) ?? toResource(resRow);
          const wages = computeWages(totals, resource, periodDates.length, {
            periodDates: periodDates.map((date) => new Date(`${date}T00:00:00`)),
            epfCapEnabled: u.epf_cap_enabled ?? true,
          });
          const earnedPayroll = wages.earnedGross;
          const contractedInvoice = resource.components.reduce(
            (sum, item) => sum + (Number(item.amount) || 0),
            0,
          ) + resource.employerContributions.reduce(
            (sum, item) => sum + (isNonBillableInvoiceItem(item) ? 0 : Number(item.amount) || 0),
            0,
          );
          const payrollDays = resolvePayrollDayCount(resource.payrollDayBase, periodDates) ?? wages.baseDays;
          const earnedInvoice = payrollDays > 0
            ? (contractedInvoice / payrollDays) * totals.tDays
            : 0;
          if (!isInternal) invoiceAmount += earnedInvoice;
          payrollCost += earnedPayroll;
        }

        const actualStrength = unitRoster.size;
        const variance = invoiceAmount - payrollCost;
        const variancePct = invoiceAmount > 0 ? (variance / invoiceAmount) * 100 : 0;
        const existing = pnlByUnit.get(u.id);
        if (existing) {
          existing.contract_value += contractValue;
          existing.invoice_amount += invoiceAmount;
          existing.payroll_cost += payrollCost;
          existing.committed_payroll += committedPayroll;
          existing.committed_strength += committedStrength;
          existing.internal = existing.internal && isInternal;
          existing.variance = existing.invoice_amount - existing.payroll_cost;
          existing.variance_pct = existing.invoice_amount > 0
            ? (existing.variance / existing.invoice_amount) * 100
            : 0;
        } else {
          pnlByUnit.set(u.id, {
            unit_id: u.id,
            unit_code: u.code,
            unit_name: u.name,
            customer_name: (u.customer_id && custNameById.get(u.customer_id)) || "—",
            contract_value: contractValue,
            invoice_amount: invoiceAmount,
            payroll_cost: payrollCost,
            variance,
            variance_pct: variancePct,
            internal: isInternal,
            committed_payroll: committedPayroll,
            committed_strength: committedStrength,
            actual_strength: actualStrength,
          });
        }
      }
      void emptyUuid;
      const pnlRows = Array.from(pnlByUnit.values()).sort((a, b) => b.contract_value - a.contract_value);

      const pnlTotals = pnlRows.reduce(
        (s, r) => ({ contract: s.contract + r.contract_value, invoice: s.invoice + r.invoice_amount, payroll: s.payroll + r.payroll_cost }),
        { contract: 0, invoice: 0, payroll: 0 },
      );

      return {
        orgs: orgsCount ?? 0,
        units: unitsCount ?? 0,
        employees: empCount ?? 0,
        contractsActive: contractsActive ?? 0,
        contractsExpiring: contractsExpiring ?? [],
        vehicles: vehiclesCount ?? 0,
        fuelTotal,
        items: itemsCount ?? 0,
        sheetCounts,
        runCounts,
        pnlRows,
        pnlTotals,
      };
    },
  });

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear()); setMonth(d.getMonth());
  };
  const isCurrent = now.getFullYear() === year && now.getMonth() === month;

  const tiles = useMemo(() => {
    const t: { key: string; module: string; node: React.ReactNode }[] = [];
    if (data) {
      if (can("organizations")) t.push({ key: "orgs", module: "organizations", node: <MetricTile icon={Building2} label="Organizations" value={data.orgs} accent="rose" to="/admin/customers" /> });
      if (can("organizations")) t.push({ key: "units", module: "organizations", node: <MetricTile icon={Warehouse} label="Units" value={data.units} accent="cyan" to="/admin/customers/unit-manager" /> });
      if (can("contracts")) t.push({ key: "contracts", module: "contracts", node: (
        <ContractsTile active={data.contractsActive} expiring={data.contractsExpiring} />
      )});
      if (can("employees")) t.push({ key: "emp", module: "employees", node: <MetricTile icon={UserPlus} label="Employees" value={data.employees} accent="lime" to="/admin/employees" /> });
      if (can("vehicles")) t.push({ key: "veh", module: "vehicles", node: (
        <DualTile icon={Briefcase} label="Vehicles" primary={data.vehicles} primaryLabel="In fleet" secondary={fmtINR(data.fuelTotal)} secondaryLabel="Spend this month" accent="violet" to="/admin/vehicles/inventory" />
      )});
      if (can("inventory")) t.push({ key: "inv", module: "inventory", node: <MetricTile icon={PackageOpen} label="Inventory SKUs" value={data.items} accent="amber" to="/admin/inventory/stock" /> });
      if (can("attendance")) t.push({ key: "att", module: "attendance", node: (
        <StatusTile icon={ClipboardList} label="Attendance" approved={data.sheetCounts.approved} pending={data.sheetCounts.pending} draft={data.sheetCounts.draft} rejected={data.sheetCounts.rejected} accent="emerald" to="/admin/attendance" />
      )});
      if (can("payroll")) t.push({ key: "pay", module: "payroll", node: (
        <StatusTile icon={Wallet} label="Payroll" approved={data.runCounts.approved} pending={data.runCounts.pending} draft={data.runCounts.draft} rejected={data.runCounts.rejected} accent="sky" to="/admin/payroll" />
      )});
      if (can("invoice")) t.push({ key: "inv2", module: "invoice", node: (
        <StatusTile icon={Receipt} label="Invoicing" approved={data.sheetCounts.approved} pending={data.sheetCounts.pending + data.sheetCounts.draft + data.sheetCounts.rejected} draft={0} rejected={0} accent="indigo" approvedLabel="Ready" pendingLabel="Awaiting" to="/admin/invoice" />
      )});
    }
    return t;
  }, [data, can]);

  if (permsLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-muted-foreground">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/70" />
      </div>
    );
  }

  if (showInventoryDashboard) {
    return (
      <div className="p-4 sm:p-6">
        <DashboardShell>
          <PageHeader
            title="Inventory Dashboard"
            description="Live inventory overview with stock value, quantities, procurement, transfers, and issuances."
            crumbs={[{ label: "Dashboard" }]}
          />
          <InventoryOwnerDashboard />
        </DashboardShell>
      </div>
    );
  }


  const financeRows: UnitFinanceRow[] = (data?.pnlRows ?? []).map((r) => ({
    unit_id: r.unit_id,
    unit_code: r.unit_code,
    unit_name: r.unit_name,
    customer_name: r.customer_name,
    internal: r.internal,
    committed_strength: r.committed_strength,
    actual_strength: r.actual_strength,
    committed_payroll: r.committed_payroll,
    actual_payroll: r.payroll_cost,
    committed_invoice: r.contract_value,
    actual_invoice: r.invoice_amount,
  }));

  const insightsCharts = (() => {
        if (isLoading || !data) return null;
        const sheetTotal = data.sheetCounts.approved + data.sheetCounts.pending + data.sheetCounts.draft + data.sheetCounts.rejected;
        const showGauge = can("attendance") && sheetTotal > 0;
        if (!showGauge) return null;
        return (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-1 gap-4"
          >
            <div className="glass relative flex flex-col items-center justify-center overflow-hidden rounded-3xl p-5">
              <div className="mb-2 text-center">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Approval rate</div>
                <div className="font-display text-lg font-semibold tracking-tight text-foreground">Cycle health</div>
              </div>
              <RadialGauge
                value={sheetTotal === 0 ? 0 : Math.round((data.sheetCounts.approved / sheetTotal) * 100)}
                label="Attendance approved"
                sublabel={`${data.sheetCounts.approved} of ${sheetTotal} sheets`}
                size={220}
              />
            </div>
          </motion.div>
        );
      })();

  return (
    <div className="p-4 sm:p-6">
      <DashboardShell rightExtras={<PeopleInsightsSection compact={can("employees")} />} fullWidthBelow={<>{can("employees") && <EmployeeInsightsSection />}{can("attendance") && <AttendanceTodayCard />}{can("contracts") && (<><ClientContractPortfolioCard /><WorkforceCoverageCard /></>)}{can("payroll") && <PayrollCoverageCard rows={financeRows} />}{can("invoice") && <InvoiceCoverageCard rows={financeRows} />}{(can("payroll") || can("invoice")) && <ProfitabilityCard rows={financeRows} />}{insightsCharts}</>}>

      <PageHeader
        title="Dashboard"
        description="Live snapshot of everything you have access to — tiles, counts, and cycle insights."
        crumbs={[{ label: "Dashboard" }]}
      />

      {/* Month hero — restrained slate panel */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-foreground/80" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <Sparkles className="h-3 w-3" /> Leadership snapshot
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-display text-2xl font-bold leading-none tracking-tight text-foreground sm:text-[26px]">
                {MONTH_NAMES[month]} {year}
              </span>
              {isCurrent && (
                <span className="inline-flex items-center rounded-full bg-foreground px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-background">
                  Current
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
            <button onClick={() => shift(-1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background hover:text-foreground" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-8 w-[130px] rounded-lg border-0 bg-transparent shadow-none hover:bg-background focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTH_NAMES.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <div className="h-5 w-px bg-border" />
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-[92px] rounded-lg border-0 bg-transparent shadow-none hover:bg-background focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 7 }, (_, i) => now.getFullYear() - 3 + i).map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <button onClick={() => shift(1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background hover:text-foreground" aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[172px] animate-pulse rounded-2xl border border-border/60 bg-card" />
          ))
        ) : (
          tiles.map((t, i) => (
            <motion.div
              key={t.key}
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.42, delay: i * 0.045, ease: [0.22, 1, 0.36, 1] }}
            >
              {t.node}
            </motion.div>
          ))
        )}
      </div>

      {/* P&L renders full-width below the shell via fullWidthBelow */}


      </DashboardShell>
    </div>
  );
}

/* -------------------- Tiles — neutral card with subtle accent -------------------- */

type Accent = "rose" | "cyan" | "lime" | "violet" | "amber" | "emerald" | "sky" | "indigo";

const ACCENT_CHIP: Record<Accent, string> = {
  rose: "bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
  cyan: "bg-cyan-50 text-cyan-700 ring-cyan-200/70 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-400/20",
  lime: "bg-lime-50 text-lime-700 ring-lime-200/70 dark:bg-lime-500/10 dark:text-lime-300 dark:ring-lime-400/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-200/70 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  sky: "bg-sky-50 text-sky-700 ring-sky-200/70 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200/70 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20",
};

const ACCENT_BAR: Record<Accent, string> = {
  rose: "bg-rose-500", cyan: "bg-cyan-500", lime: "bg-lime-500", violet: "bg-violet-500",
  amber: "bg-amber-500", emerald: "bg-emerald-500", sky: "bg-sky-500", indigo: "bg-indigo-500",
};

const ACCENT_TILE_BG: Record<Accent, string> = {
  rose: "bg-rose-100/80 dark:bg-rose-500/15",
  cyan: "bg-cyan-100/80 dark:bg-cyan-500/15",
  lime: "bg-lime-100/80 dark:bg-lime-500/15",
  violet: "bg-violet-100/80 dark:bg-violet-500/15",
  amber: "bg-amber-100/80 dark:bg-amber-500/15",
  emerald: "bg-emerald-100/80 dark:bg-emerald-500/15",
  sky: "bg-sky-100/80 dark:bg-sky-500/15",
  indigo: "bg-indigo-100/80 dark:bg-indigo-500/15",
};

function Shell({ children, to, accent = "indigo" }: { children: React.ReactNode; to: string; accent?: Accent }) {
  return (
    <Link
      to={to}
      className={`group relative flex h-[104px] flex-col overflow-hidden rounded-2xl border border-border/40 ${ACCENT_TILE_BG[accent]} p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:h-[172px] sm:rounded-[26px] sm:p-5`}
    >
      {children}
    </Link>
  );
}


function TileHeader({ Icon, accent, label, sub }: { Icon?: React.ComponentType<{ className?: string }>; accent: Accent; label: string; sub?: string }) {
  void Icon; void accent;
  return (
    <div className="relative flex items-start justify-between gap-2 sm:gap-3">
      <div className="min-w-0">
        <div className="truncate font-display text-[13px] font-semibold leading-tight text-foreground sm:text-[15px]">{label}</div>
        {sub && <div className="mt-0.5 truncate text-[10px] text-muted-foreground sm:mt-1 sm:text-[11px]">{sub}</div>}
      </div>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-card text-foreground shadow-sm ring-1 ring-border/60 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 sm:h-9 sm:w-9">
        <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </span>
    </div>
  );
}

function TileLabel({ children }: { children: React.ReactNode }) {
  return <div className="relative mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{children}</div>;
}

function MetricTile({ icon, label, value, to, accent = "indigo", sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; accent?: Accent; to: string; sub?: string }) {
  const display = useCountUp(value);
  const I = icon;
  return (
    <Shell to={to} accent={accent}>
      <TileHeader accent={accent} label={label} sub={sub} />
      <div className="relative mt-auto flex items-end justify-between gap-3">
        <div className="font-display text-[28px] font-bold leading-none tabular-nums tracking-tight text-foreground sm:text-[46px]">
          {display}
        </div>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-card/80 ring-1 ring-inset sm:h-9 sm:w-9 ${ACCENT_CHIP[accent]}`}>
          <I className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </span>
      </div>
    </Shell>
  );
}

function DualTile({ icon, label, primary, primaryLabel, secondary, secondaryLabel, to, accent = "violet" }: {
  icon: React.ComponentType<{ className?: string }>; label: string;
  primary: number; primaryLabel: string;
  secondary: string; secondaryLabel: string;
  accent?: Accent; to: string;
}) {
  const display = useCountUp(primary);
  return (
    <Shell to={to} accent={accent}>
      <TileHeader accent={accent} label={label} sub={primaryLabel} />
      <div className="relative mt-auto flex items-end justify-between gap-3">
        <div className="font-display text-[30px] font-bold leading-none tabular-nums tracking-tight text-foreground sm:text-[40px]">{display}</div>
        <div className="flex flex-col items-end text-right">
          <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground sm:text-[10px] sm:tracking-[0.14em]">{secondaryLabel}</span>
          <span className="mt-0.5 flex items-center gap-1 font-display text-xs font-semibold tabular-nums text-foreground sm:text-sm">
            <Fuel className="h-3.5 w-3.5 text-muted-foreground" />{secondary}
          </span>
        </div>
      </div>
    </Shell>
  );
}

function StatusTile({ icon, label, approved, pending, draft, rejected, approvedLabel = "Approved", pendingLabel = "Pending", to, accent = "emerald" }: {
  icon: React.ComponentType<{ className?: string }>; label: string;
  approved: number; pending: number; draft: number; rejected: number;
  accent?: Accent; approvedLabel?: string; pendingLabel?: string; to: string;
}) {
  const total = Math.max(approved + pending + draft + rejected, 1);
  return (
    <Shell to={to} accent={accent}>
      <TileHeader accent={accent} label={label} />
      <div className="relative mt-2 grid grid-cols-2 gap-2 sm:mt-3 sm:gap-3">
        <div>
          <div className="font-display text-[22px] font-bold tabular-nums leading-none text-foreground sm:text-[26px]">{approved}</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground sm:mt-1 sm:text-[10px] sm:tracking-[0.14em]">{approvedLabel}</div>
        </div>
        <div>
          <div className="font-display text-[22px] font-bold tabular-nums leading-none text-foreground sm:text-[26px]">{pending}</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground sm:mt-1 sm:text-[10px] sm:tracking-[0.14em]">{pendingLabel}</div>
        </div>
      </div>
      <div className="relative mt-auto flex h-1.5 overflow-hidden rounded-full bg-card/60">
        {approved > 0 && <div className={ACCENT_BAR[accent]} style={{ width: `${(approved / total) * 100}%` }} />}
        {pending > 0 && <div className="bg-muted-foreground/50" style={{ width: `${(pending / total) * 100}%` }} />}
        {draft > 0 && <div className="bg-muted-foreground/30" style={{ width: `${(draft / total) * 100}%` }} />}
        {rejected > 0 && <div className="bg-rose-400/70" style={{ width: `${(rejected / total) * 100}%` }} />}
      </div>
    </Shell>
  );
}

function ContractsTile({ active, expiring }: { active: number; expiring: Array<{ id: string; contract_code: string | null; end_date: string | null }> }) {
  const soonest = expiring[0];
  const display = useCountUp(active);
  const hasExpiring = expiring.length > 0;
  const alertText = hasExpiring
    ? `${expiring.length} renewal${expiring.length === 1 ? "" : "s"} in 60d`
    : "No renewals in 60d";
  const alertTone = hasExpiring
    ? "border-amber-200/70 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300"
    : "border-emerald-200/70 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  return (
    <Shell to="/admin/contracts/client-contracts" accent="amber">
      <TileHeader accent="amber" label="Contracts" sub="Active client contracts" />
      <div className="relative mt-auto flex items-end justify-between gap-3">
        <div className="font-display text-[30px] font-bold leading-none tabular-nums tracking-tight text-foreground sm:text-[46px]">{display}</div>
        <div className={`flex max-w-[55%] items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${alertTone}`}>
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate leading-none" title={hasExpiring && soonest?.end_date ? `Soonest: ${soonest.end_date}` : alertText}>{alertText}</span>
        </div>
      </div>
    </Shell>
  );
}
