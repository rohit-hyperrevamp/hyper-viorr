// Canonical role-key constants. Import these instead of typing string literals.
// Whenever a new role is added, add it here and update RBAC seed data.

export const ROLE_KEYS = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  HR: "hr",
  LEADERSHIP: "leadership",
  BRANCH_MANAGER: "branch_manager",
  BRANCH_ADMIN: "branch_admin",
  INVENTORY_MANAGER: "inventory_manager",
  INVENTORY: "inventory",
  TRANSPORT: "transport",
  ACCOUNTS: "accounts",
  FINANCE: "finance",
  OPERATIONS: "operations",
  FIELD_OFFICER: "field_officer",
  GUARD: "guard",
  SECURITY_GUARD: "security_guard",
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

/** Roles that reach the full admin console (as opposed to FO or guard shells). */
export const ADMIN_CONSOLE_ROLES: ReadonlySet<string> = new Set([
  ROLE_KEYS.SUPER_ADMIN,
  ROLE_KEYS.ADMIN,
  ROLE_KEYS.HR,
  ROLE_KEYS.LEADERSHIP,
  ROLE_KEYS.BRANCH_MANAGER,
  ROLE_KEYS.BRANCH_ADMIN,
  ROLE_KEYS.INVENTORY_MANAGER,
  ROLE_KEYS.INVENTORY,
  ROLE_KEYS.ACCOUNTS,
  ROLE_KEYS.FINANCE,
  ROLE_KEYS.OPERATIONS,
]);

/** Frontline / mobile-first roles. */
export const FIELD_ROLES: ReadonlySet<string> = new Set([
  ROLE_KEYS.FIELD_OFFICER,
]);
export const GUARD_ROLES: ReadonlySet<string> = new Set([
  ROLE_KEYS.GUARD,
  ROLE_KEYS.SECURITY_GUARD,
]);

export function isAdminConsoleRole(role: string | null | undefined) {
  return !!role && ADMIN_CONSOLE_ROLES.has(role);
}
export function isFieldOfficerRole(role: string | null | undefined) {
  return !!role && FIELD_ROLES.has(role);
}
export function isGuardRole(role: string | null | undefined) {
  return !!role && GUARD_ROLES.has(role);
}
