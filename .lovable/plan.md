# Move everything onto RBAC — phased execution

## What the audit found

Today the app has **five parallel gating systems** and RBAC (`role_permissions` + `can()`/`canSub()`) is only one of them:

1. **Hardcoded role-key comparisons** — `roleKey === "field_officer"`, `"hr"`, `"guard"`, `"leadership"`, `"branch_manager"`, `"inventory_manager"` scattered across ~25 files.
2. **Hardcoded super-admin phone** `8373914073` in `src/lib/auth.ts` — silently bypasses RBAC everywhere `isSuperAdmin` is checked.
3. **A parallel hook** `useCurrentUserRole` exposing `isFieldOfficer`/`isBranchManager` flags, used in 9+ files instead of `useCurrentPermissions`.
4. **Nav-only enforcement** — ~70 admin route files have no `can(module)` check; direct URL access ignores RBAC (including `admin.rbac.tsx` — the RBAC editor itself).
5. **Sidebar/drawer/bottom-nav** in `admin.tsx` use hardcoded arrays (`guardGroups`, `foTiles`, `priorityKeys`) instead of RBAC-derived items.

Also found: `can("dashboard")` is called but `"dashboard"` isn't declared in `RBAC_MODULES` → always false → dead check.

The two hardcoded UUIDs (Radiant Pune billing unit, NOMANS holding unit) are **intentional business rules** per memory — keep them, but centralize them in one constants file.

## Phased plan

### Phase 1 — Foundations (single source of truth)
- Add `dashboard`, `notifications`, `profile`, `my_attendance`, `my_inventory` to `RBAC_MODULES` (with sensible role defaults) so every navigable surface has a real module.
- Create `src/lib/business-constants.ts` exporting `RADIANT_BILLING_UNIT_ID` and `NOMANS_UNIT_ID`; replace both inline literals.
- Extend `useCurrentPermissions` to expose `roleKey` and derived helpers (`isFieldOfficer`, `isGuard`, `isAdminConsole`) computed **from RBAC**, not from a role-key allowlist. Deprecate `useCurrentUserRole` and re-point its exports to the new hook so existing callers keep working during migration.
- Kill the `SUPER_ADMIN_PHONE` bypass in `auth.ts`: super-admin becomes a pure `role_key IN ('admin','super_admin')` check via the existing `is_admin_user()` DB path. The three seed phones already resolve to super-admin candidates, so behavior is preserved without the phone literal.

### Phase 2 — Route-level guards (close the direct-URL hole)
- Add a tiny `<RequirePermission module="..." sub="...">` wrapper (redirects to `/admin/dashboard` on deny).
- Wrap every admin route component with it. Priorities:
  - **Critical:** `admin.rbac.tsx`, `admin.roles-manager.tsx`, `admin.control-center.tsx`, `admin.system-logs.tsx`, `admin.org-settings.tsx`
  - **High:** all `admin.customers.*`, `admin.contracts.*`, `admin.payroll.*`, `admin.invoice.*`, `admin.attendance.*`
  - **Standard:** vehicles, assets, office-assets, inventory sub-pages, field-sense sub-pages
- Delete the FO bypass in `FieldSenseAdminGuard`; make FO access come from a real `field_sense` role_permission row (seeded in the same migration).

### Phase 3 — Sidebar / drawer / bottom-nav driven by RBAC
- Rewrite `admin.tsx` nav so `guardGroups`, `foTiles`, and the FO/guard bottom-nav branches are **derived** from the same `visibleGroups` filter (`groups.filter(g => can(g.module))`). Role-specific labels ("My Dashboard" vs "Dashboard") stay, but the *set* of items is RBAC-driven.
- Remove `ADMIN_CONSOLE_ROLES` and `ADMIN_ROLES` hardcoded sets from `admin.tsx` and `routes/index.tsx`; derive from `can('dashboard')` / whether any admin-console module is permitted.
- Landing redirect in `routes/index.tsx` picks first module the user can access, not a hardcoded role table.

### Phase 4 — Purge remaining literal role checks in feature code
- Replace `roleKey === "field_officer"` in employees/inventory/attendance flows with `can()`/`canSub()` for the *action* being gated (e.g. "can add employee" → `can('employees','edit')`, "can approve" → `can('employees','approve')`, "can direct-activate" → `canSub('employees','activate')` after adding that sub-module).
- Data filters that mean "show me guards" or "show me FOs" (e.g. `.filter(role_key === 'guard')`) stay — those are **data segmentation**, not permission checks — but move the role literals into a `ROLE_KEYS` constants module so grep hits one file.
- Seed `role_permissions` rows for the newly-declared modules so existing roles keep their current effective access on day one.

### Phase 5 — Verify
- Playwright: log in as super-admin, HR, FO, guard, inventory-manager; hit each direct URL that previously rendered without a guard; confirm allowed/denied match the RBAC matrix.
- Confirm the RBAC editor page (`/admin/rbac`) now 403s for non-super-admins even via direct URL.

## Technical notes

- The DB function `current_user_has_permission` already exists and is correct; no schema change needed for enforcement, only for the new module rows in `role_permissions`.
- Removing the phone bypass is safe because the three super-admin seed phones are in `candidates` with `role_key='super_admin'`; `is_admin_user()` already covers them via the email pattern branch. I'll verify this with a read-only query before the migration lands.
- `useCurrentUserRole` stays as a thin compatibility shim in Phase 1; deleted in Phase 4 once all call sites move over — avoids a 9-file atomic rewrite mid-audit.

## Scope check before I start

This is 2–3 hours of focused edits across ~80 files plus one migration. Two things I want to confirm before I touch code:

1. **Super-admin phone bypass** — OK to remove? The three seed phones (`8373914073`, `8373149073`, `8373914072`) will still work as super-admins via their `role_key`, but if any of them somehow don't have `role_key='super_admin'` in `candidates`, they'd lose access. I'll verify with a query first and only remove if safe.
2. **Phase order** — do you want all 5 phases in one go, or should I ship Phase 1+2 first (closes the actual security hole — direct-URL access to RBAC editor etc.) and then do 3+4 as a follow-up?