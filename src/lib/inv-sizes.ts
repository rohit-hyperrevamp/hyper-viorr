import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SizeMode = "letter" | "number" | "free";

export type ItemSizeOptions = {
  /** Ordered list of selectable sizes. Empty means free-text entry. */
  options: string[];
  /** How the sizes read: numeric (7, 8, 9…), letter (S, M, L…) or free text. */
  mode: SizeMode;
};

export function inferSizeMode(values: string[]): SizeMode {
  if (!values.length) return "free";
  return values.every((v) => /^\d+(\.\d+)?$/.test(v.trim())) ? "number" : "letter";
}

function sortSizes(values: Array<{ v: string; o: number }>, mode: SizeMode): string[] {
  const arr = [...values];
  if (mode === "number") {
    arr.sort((a, b) => Number(a.v) - Number(b.v));
  } else {
    arr.sort((a, b) => a.o - b.o || a.v.localeCompare(b.v));
  }
  return Array.from(new Set(arr.map((x) => x.v.trim()).filter(Boolean)));
}

/**
 * Single source of truth for item size dropdowns.
 * Resolution order per item:
 *   1. inv_item_sizes rows (enabled) — item-specific overrides
 *   2. the linked inv_size_charts values (letter/number charts)
 *   3. free text (chart type "free" or nothing defined)
 * Numeric charts are sorted numerically so 7, 8, 9, 10 never renders as 10, 11, 7.
 */
export function useItemSizeOptions() {
  return useQuery({
    queryKey: ["inv", "item-size-options"],
    staleTime: 60_000,
    queryFn: async () => {
      const [itemsRes, sizesRes, chartsRes] = await Promise.all([
        supabase.from("inv_items" as never).select("id,is_sized,size_chart_id"),
        supabase.from("inv_item_sizes" as never).select("item_id,size_value,sort_order").eq("enabled", true),
        supabase.from("inv_size_charts" as never).select("id,size_type,values,enabled").eq("enabled", true),
      ]);
      const items = (itemsRes.data ?? []) as unknown as Array<{ id: string; is_sized: boolean; size_chart_id: string | null }>;
      const sizes = (sizesRes.data ?? []) as unknown as Array<{ item_id: string; size_value: string; sort_order: number }>;
      const charts = (chartsRes.data ?? []) as unknown as Array<{ id: string; size_type: string; values: string[] | null }>;

      const chartMap = new Map(charts.map((c) => [c.id, c]));
      const byItem = new Map<string, Array<{ v: string; o: number }>>();
      for (const s of sizes) {
        const arr = byItem.get(s.item_id) ?? [];
        arr.push({ v: String(s.size_value ?? ""), o: Number(s.sort_order ?? 0) });
        byItem.set(s.item_id, arr);
      }

      const out = new Map<string, ItemSizeOptions>();
      for (const it of items) {
        if (!it.is_sized) {
          out.set(it.id, { options: [], mode: "free" });
          continue;
        }
        const chart = it.size_chart_id ? chartMap.get(it.size_chart_id) : undefined;
        const own = byItem.get(it.id) ?? [];
        let raw = own;
        if (!raw.length && chart && chart.size_type !== "free") {
          raw = (chart.values ?? []).map((v, i) => ({ v: String(v), o: i }));
        }
        const chartMode: SizeMode | undefined =
          chart?.size_type === "number" ? "number" : chart?.size_type === "letter" ? "letter" : undefined;
        const mode = chartMode ?? inferSizeMode(raw.map((r) => r.v));
        out.set(it.id, { options: sortSizes(raw, mode), mode });
      }
      return out;
    },
  });
}

/** Placeholder text that matches the size flavour, e.g. "Select size (7, 8, 9…)". */
export function sizePlaceholder(opt: ItemSizeOptions | undefined): string {
  if (!opt || !opt.options.length) return "Enter size";
  const preview = opt.options.slice(0, 3).join(", ");
  return `${opt.mode === "number" ? "Select number" : "Select size"} (${preview}…)`;
}
