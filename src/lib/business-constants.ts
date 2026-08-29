// Business constants — single source of truth.
// Do NOT hardcode these UUIDs anywhere else in the app.

/**
 * The internal / non-billable billing unit is NOT hardcoded. It is the unit
 * flagged with `units.is_internal = true`. Resolve it via
 * `useInternalUnit()` / `fetchInternalUnit()` in `@/lib/internal-unit`.
 */

/**
 * "No Man's Land" holding unit. Used to onboard guards when no client
 * unit is yet assigned; reassigned to a real unit within a week.
 */
export const NOMANS_UNIT_CODE = "NOMANS";

/** UUID of the "No Man's Land" holding unit. */
export const NOMANS_UNIT_ID = "045fc1ec-a703-494f-8cce-29d353374c60";

/** True when the unit is the No Man's Land holding unit (by id or code). */
export function isNomansUnit(u: { id?: string | null; code?: string | null } | null | undefined) {
  if (!u) return false;
  return u.id === NOMANS_UNIT_ID || (u.code ?? "").toUpperCase() === NOMANS_UNIT_CODE;
}
