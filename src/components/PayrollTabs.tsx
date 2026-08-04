import { Link, useLocation } from "@tanstack/react-router";
import { CalendarDays, TrendingUp, TrendingDown, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/admin/payroll", label: "Payroll", icon: CalendarDays },
  { to: "/admin/additions", label: "Additions", icon: TrendingUp },
  { to: "/admin/deductions", label: "Deductions", icon: TrendingDown },
  { to: "/admin/employer-contributions", label: "Employer Contributions", icon: Building2 },
];

export function PayrollTabs() {
  const location = useLocation();

  return (
    <div className="mb-5 inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border/60 bg-card/60 p-1 backdrop-blur-xl shadow-[0_1px_0_0_rgba(255,255,255,0.85)_inset,0_10px_28px_-18px_rgba(10,20,40,0.18)]">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = location.pathname === tab.to || location.pathname.startsWith(tab.to + "/");
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
              active
                ? "bg-gradient-to-br from-white to-accent/[0.08] text-foreground ring-1 ring-inset ring-accent/25 shadow-[0_1px_0_0_rgba(255,255,255,0.9)_inset,0_6px_16px_-10px_color-mix(in_oklab,var(--accent)_45%,transparent)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
