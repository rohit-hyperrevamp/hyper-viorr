import { Link } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; to?: string };

export function PageHeader({
  title,
  description,
  crumbs,
  actions,
  icon: Icon,
  eyebrow,
  kpis,
  className,
}: {
  title: string;
  description?: string;
  crumbs: Crumb[];
  actions?: React.ReactNode;
  icon?: LucideIcon;
  eyebrow?: string;
  /** Optional KPI/stat row rendered below the title inside the hero */
  kpis?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative mb-3 sm:mb-5", className)}>
      <nav aria-label="Breadcrumb" className="mb-2 hidden sm:block">
        <ol className="flex flex-wrap items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <li>
            <Link
              to="/admin/customers"
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            >
              <Home className="h-3 w-3" />
              <span>Home</span>
            </Link>
          </li>
          {crumbs.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 opacity-50" />
              {c.to && i < crumbs.length - 1 ? (
                <Link to={c.to} className="transition-colors hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span className="text-foreground/90">{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-3 sm:p-5">
        <div className="relative flex flex-col gap-2.5 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon && (
              <div className="mt-0.5 shrink-0">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/20 sm:h-10 sm:w-10">
                  <Icon className="h-4 w-4 sm:h-[17px] sm:w-[17px]" />
                </div>
              </div>
            )}
            <div className="min-w-0">
              {eyebrow && (
                <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                  {eyebrow}
                </div>
              )}
              <h1 className="font-display text-[17px] font-semibold leading-tight tracking-tight text-foreground sm:truncate sm:text-[22px]">
                {title}
              </h1>
              {description && (
                <p className="mt-1 max-w-2xl text-[12px] leading-snug text-muted-foreground sm:text-[13px]">
                  {description}
                </p>
              )}
            </div>
          </div>
          {actions && (
            <div className="-mx-1 flex flex-wrap items-center gap-1.5 self-start overflow-x-auto px-1 pb-0.5 sm:mx-0 sm:shrink-0 sm:overflow-visible sm:px-0 sm:pb-0">{actions}</div>
          )}
        </div>


        {kpis && (
          <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-4">{kpis}</div>
        )}
      </div>
    </div>
  );
}


/**
 * Compact stat pill used inside <PageHeader kpis={...}>.
 */
export function PageStat({
  label,
  value,
  tone = "default",
  icon: Icon,
  trend,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "accent" | "success" | "warning" | "destructive";
  icon?: LucideIcon;
  trend?: { delta: string; direction?: "up" | "down" | "flat" };
}) {
  const toneClasses =
    tone === "accent"
      ? "text-accent"
      : tone === "success"
        ? "text-emerald-600"
        : tone === "warning"
          ? "text-amber-600"
          : tone === "destructive"
            ? "text-destructive"
            : "text-foreground";
  const trendCls =
    trend?.direction === "down"
      ? "text-rose-600 bg-rose-500/10 ring-rose-500/20"
      : trend?.direction === "flat"
        ? "text-muted-foreground bg-muted ring-border"
        : "text-emerald-600 bg-emerald-500/10 ring-emerald-500/20";
  const Wrapper: React.ElementType = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button", onClick } : {})}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl border border-border bg-card px-3.5 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md",
        onClick && "cursor-pointer",
        active && "border-accent ring-2 ring-accent/30",
      )}
    >
      <div className="relative flex items-center gap-2.5">
        {Icon && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground shadow-sm">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
          <div className={cn("mt-0.5 whitespace-nowrap font-display text-[20px] font-semibold leading-none tabular-nums", toneClasses)}>{value}</div>
        </div>
        {trend && (
          <span
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset tabular-nums",
              trendCls,
            )}
          >
            {trend.delta}
          </span>
        )}
      </div>
    </Wrapper>
  );

}

export function ComingSoonCard({
  icon: Icon,
  title,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
}) {
  return (
    <div className="glass rounded-2xl p-10 text-center sm:p-14">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <Icon className="h-7 w-7" />
      </div>
      <h2 className="mt-5 font-display text-xl tracking-tight text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
      <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-accent">
        Coming soon
      </span>
    </div>
  );
}
