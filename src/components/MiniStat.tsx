import { cn } from "@/lib/utils";
import {
  ACCENT_CHIP,
  ACCENT_TILE_BG,
  accentFromKey,
  accentFromTone,
  type Accent,
} from "@/components/tile-theme";

export function MiniStat({
  label,
  value,
  tone,
  subtle,
  trend,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  tone?: "accent" | "warning" | "destructive";
  subtle?: string;
  /** { delta: "+12%" | "-3", direction: "up" | "down" | "flat" } */
  trend?: { delta: string; direction?: "up" | "down" | "flat"; label?: string };
  icon?: React.ComponentType<{ className?: string }>;
  accent?: Accent;
}) {
  const resolvedAccent: Accent = accent ?? accentFromTone(tone) ?? accentFromKey(label);

  const dir = trend?.direction ?? "flat";
  const trendTone =
    dir === "up"
      ? "text-emerald-700 bg-emerald-500/15 ring-emerald-500/25"
      : dir === "down"
        ? "text-rose-700 bg-rose-500/15 ring-rose-500/25"
        : "text-muted-foreground bg-card/70 ring-border";

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border/40 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:rounded-[26px] sm:p-4",
        ACCENT_TILE_BG[resolvedAccent],
      )}
    >
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-display text-[12.5px] font-semibold leading-tight text-foreground sm:text-[14px]">
            {label}
          </div>
          {(trend?.label || subtle) && (
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground sm:text-[11px]">
              {trend?.label ?? subtle}
            </div>
          )}
        </div>
        {trend && (
          <span
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset tabular-nums",
              trendTone,
            )}
          >
            {trend.delta}
          </span>
        )}
      </div>
      <div className="relative mt-3 flex items-end justify-between gap-3 sm:mt-5">
        <div className="min-w-0 whitespace-nowrap font-display text-[24px] font-bold leading-none tracking-tight tabular-nums text-foreground sm:text-[32px]">
          {value}
        </div>
        {Icon && (
          <span
            className={cn(
              "grid h-7 w-7 shrink-0 place-items-center rounded-full bg-card/80 ring-1 ring-inset sm:h-9 sm:w-9",
              ACCENT_CHIP[resolvedAccent],
            )}
          >
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </span>
        )}
      </div>
    </div>
  );
}
