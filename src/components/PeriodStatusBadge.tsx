import { CheckCircle2, Clock, Lock, LockOpen, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttendanceStatus, MoneyStatus } from "@/lib/period-status";

const base =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]";

export function AttendanceStatusBadge({
  status,
  className,
}: {
  status: AttendanceStatus;
  className?: string;
}) {
  const map: Record<AttendanceStatus, { label: string; tone: string; icon: typeof Clock }> = {
    none: { label: "Attendance open", tone: "border-border bg-muted text-muted-foreground", icon: LockOpen },
    draft: { label: "Attendance open", tone: "border-border bg-muted text-muted-foreground", icon: LockOpen },
    submitted: {
      label: "Awaiting approval",
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-600",
      icon: Clock,
    },
    approved: {
      label: "Attendance locked",
      tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
      icon: Lock,
    },
    rejected: {
      label: "Rejected — reopened",
      tone: "border-destructive/30 bg-destructive/10 text-destructive",
      icon: XCircle,
    },
  };
  const cfg = map[status];
  const Icon = cfg.icon;
  return (
    <span className={cn(base, cfg.tone, className)}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

export function MoneyStatusBadge({
  kind,
  status,
  className,
}: {
  kind: "payroll" | "invoice";
  status: MoneyStatus;
  className?: string;
}) {
  const label = kind === "payroll" ? "Payroll" : "Invoice";
  const map: Record<MoneyStatus, { text: string; tone: string; icon: typeof Clock }> = {
    open: {
      text: `${label} open`,
      tone: "border-destructive/25 bg-destructive/10 text-destructive",
      icon: LockOpen,
    },
    ready: {
      text: `${label} ready`,
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-600",
      icon: Clock,
    },
    processed: {
      text: `${label} processed`,
      tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
      icon: CheckCircle2,
    },
  };
  const cfg = map[status];
  const Icon = cfg.icon;
  return (
    <span className={cn(base, cfg.tone, className)}>
      <Icon className="h-3 w-3" /> {cfg.text}
    </span>
  );
}
