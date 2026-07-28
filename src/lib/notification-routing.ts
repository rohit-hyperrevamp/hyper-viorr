// Decide whether a notification should navigate to its deep link on click,
// or open an in-place detail popup. Action-required / workflow notifications
// redirect; audit-style informational updates open the popup so the user can
// read the details without leaving their current context.

// Explicit full-type overrides (highest priority).
const REDIRECT_TYPES = new Set<string>([
  "candidate_pending_approval",
  "candidate_issuance_pending",
  "candidate_approved",
  "candidate_rejected",
  "attendance_pending_approval",
  "attendance_approved",
  "attendance_rejected",
  "payroll_ready",
  "payroll_pending_approval",
]);

// Action verbs (the part after the last `:` in the type) that indicate a
// workflow step requiring the user to go to the entity page.
const REDIRECT_ACTIONS = new Set<string>([
  "submit",
  "submit_for_approval",
  "approve",
  "reject",
  "reopen",
  "pending_approval",
  "offboard",
  "reactivate",
  "dispatch",
  "receive",
  "acknowledge",
  "acknowledge_otp",
  "sign",
  "post",
  "issue",
  "auto-expire",
  "auto_expire",
  "expire",
  "renew",
  "send_for_payroll",
  "send_for_invoice",
  "upload_attendance_excel",
  "upload_attendance_image_(ocr)",
  "clear_all_entries",
  "cancel",
  "close",
]);

export function shouldRedirect(type: string | null | undefined): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  if (REDIRECT_TYPES.has(t)) return true;
  const action = t.includes(":") ? t.split(":").pop()! : t;
  return REDIRECT_ACTIONS.has(action);
}
