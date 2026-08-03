import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type UnitDesignation = { id: string; name: string; quantity: number };

/**
 * Designations (contracted role slots) available on a unit.
 *
 * "Security guard" is a ROLE, not a designation. Which designation a person
 * fills at a given unit is defined by that unit's active client contract
 * resources — that is what drives salary, payroll-day cap and attendance.
 */
export async function fetchUnitDesignations(unitId: string): Promise<UnitDesignation[]> {
  if (!unitId) return [];
  const { data: contracts, error: cErr } = await supabase
    .from("client_contracts")
    .select("id, start_date")
    .eq("unit_id", unitId)
    .eq("record_type", "client")
    .eq("status", "active")
    .order("start_date", { ascending: true })
    .limit(1);
  if (cErr) throw cErr;
  const contractId = contracts?.[0]?.id;
  if (!contractId) return [];

  const { data: resources, error: rErr } = await supabase
    .from("contract_resources")
    .select("designation_id, quantity, sort_order")
    .eq("contract_id", contractId)
    .order("sort_order", { ascending: true });
  if (rErr) throw rErr;

  const qty = new Map<string, number>();
  const ordered: string[] = [];
  for (const row of (resources ?? []) as Array<{ designation_id: string | null; quantity: number | null }>) {
    if (!row.designation_id) continue;
    if (!qty.has(row.designation_id)) ordered.push(row.designation_id);
    qty.set(row.designation_id, (qty.get(row.designation_id) ?? 0) + Math.max(1, Number(row.quantity) || 1));
  }
  if (!ordered.length) return [];

  const { data: desigs, error: dErr } = await supabase
    .from("designations")
    .select("id, name")
    .in("id", ordered);
  if (dErr) throw dErr;
  const nameById = new Map((desigs ?? []).map((d) => [d.id, d.name as string]));
  return ordered.map((id) => ({ id, name: nameById.get(id) ?? "—", quantity: qty.get(id) ?? 1 }));
}

export function useUnitDesignations(unitId: string | null | undefined) {
  return useQuery({
    queryKey: ["unit-designations", unitId ?? ""],
    enabled: Boolean(unitId),
    staleTime: 60_000,
    queryFn: () => fetchUnitDesignations(unitId as string),
  });
}

/** Per-unit designation chosen for a candidate, keyed by unit id. */
export async function fetchCandidateUnitDesignations(candidateId: string) {
  const { data, error } = await supabase
    .from("candidate_units")
    .select("unit_id, designation_id")
    .eq("candidate_id", candidateId);
  if (error) throw error;
  const map = new Map<string, string | null>();
  for (const r of (data ?? []) as Array<{ unit_id: string; designation_id: string | null }>) {
    map.set(r.unit_id, r.designation_id ?? null);
  }
  return map;
}
