import { Link, useLocation } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Single Payroll tab strip. Additions and Deductions are already surfaced
 * on the right side of the page, so only the Payroll workspace link is needed.
 */
export function PayrollTabs() {
  const location = useLocation();
  const active = location.pathname === "/admin/payroll" || location.pathname.startsWith("/admin/payroll/");

  return (
    <div className="mb-5 inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border/60 bg-card/60 p-1 backdrop-blur-xl shadow-[0_1px_0_0_rgba(255,255,255,0.85)_inset,0_10px_28px_-18px_rgba(10,20,40,0.18)]">
      <Link
        to="/admin/payroll"
        className={cn(
          "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
          active
            ? "bg-gradient-to-br from-white to-accent/[0.08] text-foreground ring-1 ring-inset ring-accent/25 shadow-[0_1px_0_0_rgba(255,255,255,0.9)_inset,0_6px_16px_-10px_color-mix(in_oklab,var(--accent)_45%,transparent)]"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <CalendarDays className="h-4 w-4" />
        Payroll
      </Link>
    </div>
  );
}
