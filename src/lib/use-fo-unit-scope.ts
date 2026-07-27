import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUserRole } from "@/lib/use-current-user-role";
import { useScopeAssignments } from "@/lib/deployment";

export type FieldOfficerUnitScope = {
  isLoading: boolean;
  /** Current user is an active field officer (and not super admin). */
  isFieldOfficer: boolean;
  /** UUIDs of every unit the FO is allowed to see. Empty set = no access. */
  unitIds: Set<string>;
  /** Convenience: FO has zero units mapped (used to hide/blank UI). */
  hasUnits: boolean;
  /** FO candidate id for the current user, if any. */
  candidateId: string | null;
};

/**
 * Resolves the set of units a field officer is scoped to. Combines:
 *   • employee_scope_assignments (scope_type='unit')
 *   • employee_scope_assignments (scope_type='branch' / 'customer') expanded via units
 *   • legacy candidate_units rows
 *
 * Non-field-officers get { isFieldOfficer: false, unitIds: empty }.
 * Callers should gate their scoping on `isFieldOfficer`.
 */
export function useFieldOfficerUnitScope(): FieldOfficerUnitScope {
  const { isFieldOfficer, candidateId, isLoading: roleLoading } = useCurrentUserRole();
  const scopeQ = useScopeAssignments();

  const cuQ = useQuery({
    queryKey: ["fo-candidate-units", candidateId],
    enabled: !!candidateId && isFieldOfficer,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_units" as never)
        .select("unit_id")
        .eq("candidate_id", candidateId!);
      if (error) throw error;
      return ((data as unknown) as Array<{ unit_id: string }>) ?? [];
    },
  });

  const unitsQ = useQuery({
    queryKey: ["fo-units-lookup"],
    enabled: isFieldOfficer,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units" as never)
        .select("id,branch_id,customer_id");
      if (error) throw error;
      return ((data as unknown) as Array<{ id: string; branch_id: string | null; customer_id: string | null }>) ?? [];
    },
  });

  const unitIds = useMemo(() => {
    const set = new Set<string>();
    if (!isFieldOfficer || !candidateId) return set;
    const mine = (scopeQ.data ?? []).filter((s) => s.candidate_id === candidateId);
    // NOTE: `scope_type='branch'` on a field officer is their **Home Branch**
    // (payroll/employment marker — always Radiant's own branch). It is NOT an
    // operational scope, so we must NOT expand it into every unit under that
    // branch. Operational reach comes exclusively from explicit unit scopes,
    // customer scopes, and candidate_units rows.
    const customerIds = new Set(mine.filter((s) => s.scope_type === "customer").map((s) => s.scope_id));
    for (const s of mine) {
      if (s.scope_type === "unit") set.add(s.scope_id);
    }
    for (const cu of cuQ.data ?? []) {
      if (cu.unit_id) set.add(cu.unit_id);
    }
    if (customerIds.size) {
      for (const u of unitsQ.data ?? []) {
        if (u.customer_id && customerIds.has(u.customer_id)) set.add(u.id);
      }
    }
    return set;
  }, [isFieldOfficer, candidateId, scopeQ.data, cuQ.data, unitsQ.data]);


  const isLoading = !!isFieldOfficer && (roleLoading || scopeQ.isLoading || cuQ.isLoading || unitsQ.isLoading);
  return {
    isLoading,
    isFieldOfficer: !!isFieldOfficer,
    candidateId,
    unitIds,
    hasUnits: unitIds.size > 0,
  };
}
