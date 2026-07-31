import { supabase } from "@/integrations/supabase/client";

/**
 * Contract-level money for the Invoice / Payroll charters.
 *
 * Per contract resource line (unit x designation) we derive two per-head
 * monthly rates:
 *  - `billRate`   -> what the client is charged (wages + employer cost lines)
 *  - `grossRate`  -> the employee's monthly gross (payroll side)
 *
 * The charters pro-rate these by actual paid days (plus overtime days) so the
 * month-till-date invoice and payroll values track attendance exactly. Full
 * statutory computation lives on the per-unit invoice / payroll registers.
 */

export type ResourceRate = {
  designationId: string | null;
  designationName: string;
  quantity: number;
  shiftHours: number;
  grossRate: number;
  billRate: number;
};

export type UnitFinance = {
  unitId: string;
  contractId: string;
  contractCode: string;
  committed: number;
  monthlyContracted: number;
  monthlyPayroll: number;
  rates: ResourceRate[];
  byDesignation: Map<string, ResourceRate>;
  /** Weighted average rate, used when an employee's designation is not on the contract. */
  fallback: ResourceRate | null;
};

export type UnitFinanceMap = Map<string, UnitFinance>;

function sumAmounts(list: unknown): number {
  if (!Array.isArray(list)) return 0;
  return list.reduce((s, item) => {
    const amount = Number((item as { amount?: unknown } | null)?.amount);
    return s + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

export async function fetchUnitFinance(unitIds: string[]): Promise<UnitFinanceMap> {
  const ids = Array.from(new Set(unitIds.filter(Boolean)));
  const out: UnitFinanceMap = new Map();
  if (!ids.length) return out;

  const { data: contracts, error: cErr } = await supabase
    .from("client_contracts")
    .select("id, unit_id, contract_code, status, start_date")
    .in("unit_id", ids)
    .eq("status", "active");
  if (cErr) throw cErr;

  const contractByUnit = new Map<string, { id: string; code: string }>();
  for (const c of contracts ?? []) {
    if (!c.unit_id) continue;
    if (!contractByUnit.has(c.unit_id)) {
      contractByUnit.set(c.unit_id, { id: c.id as string, code: (c.contract_code as string) || "—" });
    }
  }
  if (!contractByUnit.size) return out;

  const contractIds = Array.from(contractByUnit.values()).map((c) => c.id);
  const [{ data: resources, error: rErr }, { data: designations }] = await Promise.all([
    supabase
      .from("contract_resources")
      .select("contract_id, designation_id, quantity, shift_hours, gross, components, employer_contributions")
      .in("contract_id", contractIds),
    supabase.from("designations").select("id, name"),
  ]);
  if (rErr) throw rErr;
  const desigMap = new Map((designations ?? []).map((d) => [d.id as string, d.name as string]));

  const unitByContract = new Map<string, string>();
  for (const [unitId, c] of contractByUnit) unitByContract.set(c.id, unitId);

  const grouped = new Map<string, ResourceRate[]>();
  for (const r of resources ?? []) {
    const unitId = unitByContract.get(r.contract_id as string);
    if (!unitId) continue;
    const componentsTotal = sumAmounts((r as { components?: unknown }).components);
    const employerTotal = sumAmounts((r as { employer_contributions?: unknown }).employer_contributions);
    const grossRate = Number(r.gross) || componentsTotal;
    const rate: ResourceRate = {
      designationId: (r.designation_id as string) ?? null,
      designationName: (r.designation_id && desigMap.get(r.designation_id as string)) || "Resource",
      quantity: Number(r.quantity) || 0,
      shiftHours: Number(r.shift_hours) === 12 ? 12 : 8,
      grossRate: Math.round(grossRate * 100) / 100,
      billRate: Math.round((grossRate + employerTotal) * 100) / 100,
    };
    const arr = grouped.get(unitId) ?? [];
    arr.push(rate);
    grouped.set(unitId, arr);
  }

  for (const [unitId, rates] of grouped) {
    const contract = contractByUnit.get(unitId)!;
    const committed = rates.reduce((s, r) => s + r.quantity, 0);
    const monthlyContracted = rates.reduce((s, r) => s + r.quantity * r.billRate, 0);
    const monthlyPayroll = rates.reduce((s, r) => s + r.quantity * r.grossRate, 0);
    const byDesignation = new Map<string, ResourceRate>();
    for (const r of rates) if (r.designationId) byDesignation.set(r.designationId, r);
    const fallback: ResourceRate | null = rates.length
      ? {
          designationId: null,
          designationName: "Blended",
          quantity: committed,
          shiftHours: rates[0].shiftHours,
          grossRate: committed > 0 ? monthlyPayroll / committed : rates[0].grossRate,
          billRate: committed > 0 ? monthlyContracted / committed : rates[0].billRate,
        }
      : null;

    out.set(unitId, {
      unitId,
      contractId: contract.id,
      contractCode: contract.code,
      committed,
      monthlyContracted: Math.round(monthlyContracted * 100) / 100,
      monthlyPayroll: Math.round(monthlyPayroll * 100) / 100,
      rates: rates.sort((a, b) => a.designationName.localeCompare(b.designationName)),
      byDesignation,
      fallback,
    });
  }

  return out;
}

export function rateFor(finance: UnitFinance | undefined, designationId: string | null): ResourceRate | null {
  if (!finance) return null;
  if (designationId) {
    const exact = finance.byDesignation.get(designationId);
    if (exact) return exact;
  }
  return finance.fallback;
}

export function fmtMoney(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function fmtMoneyCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}
