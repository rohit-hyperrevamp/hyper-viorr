// Resolve how many days can be marked as "Present" (P) in a payroll period.
// Driven entirely by the Payroll Days Manager entry attached to a contract
// resource — never hard-coded. Anything beyond this cap must be paid as OT.

export type PayrollDayBaseLike = {
  method: "actual_days" | "fixed_days" | "actual_minus_weekly_off" | "custom_weekdays";
  fixedDays?: number | null;
  weeklyOffDay?: number | null;
  includedWeekdays?: number[] | null;
};

/** Period dates as ISO strings (YYYY-MM-DD). */
export function resolvePayrollDayCount(
  base: PayrollDayBaseLike | null | undefined,
  periodDates: string[],
): number | null {
  const total = periodDates.length;
  if (!base || total === 0) return null;
  const weekday = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1).getDay();
  };
  switch (base.method) {
    case "fixed_days": {
      const n = Number(base.fixedDays) || 0;
      if (n <= 0) return null;
      return Math.min(n, total);
    }
    case "actual_days":
      return total;
    case "actual_minus_weekly_off": {
      const off = base.weeklyOffDay;
      if (off == null) return total;
      return periodDates.reduce((n, iso) => n + (weekday(iso) === off ? 0 : 1), 0);
    }
    case "custom_weekdays": {
      const allowed = Array.isArray(base.includedWeekdays) ? base.includedWeekdays : [];
      if (allowed.length === 0) return total;
      return periodDates.reduce((n, iso) => n + (allowed.includes(weekday(iso)) ? 1 : 0), 0);
    }
    default:
      return null;
  }
}
