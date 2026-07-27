import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useCurrentPermissions } from "@/lib/rbac";
import { useCurrentUserRole } from "@/lib/use-current-user-role";

/**
 * Gate wrapper for Field Sense admin sub-pages (Day Patrol, Expense Manager,
 * Reports, Officer detail). Field officers are redirected to their own
 * Day Patrol dashboard; other roles must have RBAC access to the given
 * `field_sense` sub-module.
 */
export function FieldSenseAdminGuard({
  sub,
  children,
}: {
  sub: "day_patrol" | "expense_manager" | "reports" | "dashboard";
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { isSuperAdmin, canSub, isLoading } = useCurrentPermissions();
  const { isFieldOfficer } = useCurrentUserRole();

  useEffect(() => {
    if (isLoading) return;
    if (isFieldOfficer) {
      navigate({ to: "/admin/field-sense", replace: true });
      return;
    }
    if (isSuperAdmin) return;
    if (!canSub("field_sense", sub)) {
      navigate({ to: "/admin/dashboard", replace: true });
    }
  }, [isLoading, isFieldOfficer, isSuperAdmin, canSub, sub, navigate]);

  if (isFieldOfficer) return null;
  if (!isSuperAdmin && !isLoading && !canSub("field_sense", sub)) return null;
  return <>{children}</>;
}
