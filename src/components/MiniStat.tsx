import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function MiniStat({
  label,
  value,
  tone,
  subtle,
  trend,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  tone?: "accent" | "warning" | "destructive";
  subtle?: string;
  /** { delta: "+12%" | "-3", direction: "up" | "down" | "flat" } */
  trend?: { delta: string; direction?: "up" | "down" | "flat"; label?: string };
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const valueTone =
    tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "accent"
          ? "text-accent"
          : "text-foreground";

  const dir = trend?.direction ?? "flat";
  const TrendIcon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  const trendTone =
    dir === "up"
      ? "text-emerald-600 bg-emerald-500/10 ring-emerald-500/20"
      : dir === "down"
        ? "text-rose-600 bg-rose-500/10 ring-rose-500/20"
        : "text-muted-foreground bg-muted ring-border";

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:border-accent/40 sm:px-4 sm:py-3.5">

      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </div>
          <div
            className={cn(
              "mt-0.5 font-display text-[20px] font-semibold leading-none tracking-tight tabular-nums sm:mt-1 sm:text-[24px]",
              valueTone,
            )}
          >
            {value}
          </div>
        </div>
        {Icon && (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent ring-1 ring-inset ring-accent/20 sm:h-8 sm:w-8">
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </span>
        )}
      </div>
      {(trend || subtle) && (
        <div className="relative mt-1.5 flex items-center gap-1.5 sm:mt-2.5">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset tabular-nums",
                trendTone,
              )}
            >
              <TrendIcon className="h-3 w-3" />
              {trend.delta}
            </span>
          )}
          {(trend?.label || subtle) && (
            <span className="truncate text-[11px] text-muted-foreground">
              {trend?.label ?? subtle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

