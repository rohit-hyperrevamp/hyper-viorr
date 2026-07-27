// Business constants — single source of truth.
// Do NOT hardcode these UUIDs anywhere else in the app.

/**
 * Radiant Guards head-office unit (UN-RGS-PUNE, non-billable).
 * Every Field Officer's payroll `unit_id` MUST be this. Client-unit
 * assignments live in `candidate_units` only.
 */
export const RADIANT_BILLING_UNIT_ID = "92541381-14d3-4be6-ae8c-078b79c2e0f1";

/**
 * "No Man's Land" holding unit. Used to onboard guards when no client
 * unit is yet assigned; reassigned to a real unit within a week.
 */
export const NOMANS_UNIT_CODE = "NOMANS";
