import { RANGE_PRESETS, type RangePreset } from "@/lib/field-visits";

export type FieldSenseRangeFilterProps = {
  preset: RangePreset;
  onPresetChange: (p: RangePreset) => void;
  customStart: string;
  customEnd: string;
  onCustomChange: (start: string, end: string) => void;
  /** Resolved range summary shown on the right (e.g. "This month · 2026-04-01 → 2026-04-30"). */
  resolvedLabel?: string;
  /** Hide the outer card wrapper (for embedding inside another card). */
  bare?: boolean;
  /** Optional trailing slot (e.g. extra dropdown) rendered before the resolved label. */
  trailing?: React.ReactNode;
};

/**
 * Canonical date-range filter for every Radar surface.
 * Match this look and feel exactly — do not create bespoke variants.
 */
export function FieldSenseRangeFilter({
  preset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomChange,
  resolvedLabel,
  bare = false,
  trailing,
}: FieldSenseRangeFilterProps) {
  const body = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Range</div>
      <div className="flex flex-wrap gap-1">
        {RANGE_PRESETS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => onPresetChange(r.value)}
            className={
              preset === r.value
                ? "rounded-full bg-foreground px-3 py-1 text-[11px] font-bold text-background"
                : "rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            }
          >
            {r.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex items-center gap-2 text-[11px]">
          <input
            type="date"
            value={customStart}
            onChange={(e) => onCustomChange(e.target.value, customEnd)}
            className="rounded-md border border-border bg-background px-2 py-1 font-semibold"
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => onCustomChange(customStart, e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 font-semibold"
          />
        </div>
      )}
      {trailing}
      {resolvedLabel && (
        <div className="ml-auto text-[11px] font-semibold text-muted-foreground">{resolvedLabel}</div>
      )}
    </div>
  );

  if (bare) return body;
  return <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">{body}</div>;
}
