import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * The internal / non-billable unit is data-driven: whichever unit has
 * `units.is_internal = true` is the billing unit for non-billable employees.
 * Never hardcode a unit UUID for this.
 */
export type InternalUnit = {
  id: string;
  name: string;
  code: string | null;
  customer_id: string | null;
  branch_id: string | null;
};

export const INTERNAL_UNIT_QUERY_KEY = ["internal-unit"] as const;

export async function fetchInternalUnit(): Promise<InternalUnit | null> {
  const { data } = await supabase
    .from("units")
    .select("id, name, code, customer_id, branch_id")
    .eq("is_internal" as never, true as never)
    .maybeSingle();
  return (data as unknown as InternalUnit | null) ?? null;
}

export function useInternalUnit() {
  return useQuery({
    queryKey: INTERNAL_UNIT_QUERY_KEY,
    staleTime: 60_000,
    queryFn: fetchInternalUnit,
  });
}
