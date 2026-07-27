# Field Sense for Field Officers — Site Visit Tracking

Build a mobile-first Field Sense page for FOs that maps their assigned units, tracks daily site visits with check-in/checkout, captures visit notes + customer feedback + client signature + client photo, and traces their travel path.

## 1. Database (one migration)

**New table `public.field_visits`** — one row per site visit per day:
- `id`, `candidate_id` (FO), `unit_id`, `visit_date`, `visit_seq` (1st visit, 2nd, …)
- Check-in: `check_in_at`, `check_in_lat`, `check_in_lng`, `check_in_accuracy`
- Checkout: `check_out_at`, `check_out_lat`, `check_out_lng`
- Completion: `visit_notes` (text), `customer_rating` (int 1–5), `client_signature_url`, `client_photo_url`, `client_name` (optional)
- `distance_from_prev_m` (int, from previous checkpoint / attendance base)
- Timestamps, RLS: FO reads/writes own; HR/Leadership/Super Admin read all.
- Grants + indexes on `(candidate_id, visit_date)`, `(unit_id, visit_date)`.

**New table `public.field_track_points`** — GPS breadcrumbs for path drawing:
- `id`, `candidate_id`, `track_date`, `lat`, `lng`, `accuracy`, `recorded_at`, `visit_id` (nullable — links to active visit).
- RLS same as above. Indexed on `(candidate_id, track_date, recorded_at)`.

**Storage bucket `field-visit-proofs`** (private) with signed-URL access for signature + client photo.

**Add `latitude`/`longitude` reads on `units`** — already present per Field Sense; no schema change.

## 2. Route: `/admin/field-sense` for FO role

Reuse existing `admin.field-sense.tsx` but branch on role:
- Super Admin / Leadership → existing admin dashboard (unchanged).
- Field Officer → new FO view (below).

## 3. FO Field Sense page structure

**Top bar**
- Title + date, Map/Satellite toggle (Leaflet with OSM tiles + Esri World Imagery tile layer).

**Primary CTA (dynamic)**
- If today's attendance not checked in → disabled "Check in attendance first" (link to dashboard Mark Attendance).
- Else if no open visit → "Check in your Nth visit" — opens sheet showing auto-detected nearest unit (Haversine over assigned units), confirm; creates `field_visits` row with `check_in_at`.
- Else (open visit) → "Complete visit at {unit name}" — opens Checkout sheet.

**Map (fixed height ~360px mobile / 520px desktop)**
- FO's current position (blue dot, live via `pushTelemetry`-style poll every 30s).
- Assigned unit pins (green = not visited today, amber = in progress, emerald ✓ = completed).
- Polyline of today's `field_track_points` from attendance base → each visit checkpoint.
- Map/Satellite tile toggle.

**Distance tiles (horizontal scroll strip)**
- For each assigned unit: unit name, address, distance from FO's current location (km/m), last-visit timestamp (today or all-time), status pill.

**Below map — Units list**
- Card per assigned unit: name, address, lat/lng (Google Maps link), last visit date+time, total visits this month, today's status.

## 4. Check-in flow (sheet)
- Grab GPS, compute nearest assigned unit within 500m (fallback: manual pick from assigned units).
- Show "Nearest unit: {name} · {distance}" with Confirm / Change.
- Insert `field_visits` row (visit_seq = count today + 1), start recording track points, mark unit pin amber.

## 5. Checkout flow (sheet, multi-step, all required)
1. **Visit notes** — textarea, min 10 chars.
2. **Customer feedback** — 1–5 star picker.
3. **Client signature** — reuse existing `SignaturePad` component, upload PNG to `field-visit-proofs`.
4. **Client photo** — camera capture (`<input type="file" capture="environment" accept="image/*">`), upload.
5. Optional client name field.
- "Complete checkout" disabled until all 4 required fields present.
- On submit: update `field_visits` with checkout data, compute distance from check-in point, mark pin emerald.

## 6. Background telemetry
- While page mounted and FO checked into attendance, poll GPS every 45s and insert `field_track_points` (linked to open `visit_id` if any).
- Realtime channel on `field_visits` invalidates dashboard "last visit" / "visits this month".

## 7. Dashboard integration
- On FO dashboard, existing "My summary" — add "Last visit" (relative time) and "Visits this month" (count) tiles, sourced from `field_visits`.

## 8. Admin Field Sense enhancements
- Add Map/Satellite toggle to existing admin map (small addition).

## Technical notes
- Distance: Haversine (already in `self-attendance.ts` as `distanceMeters`).
- Leaflet already installed for admin Field Sense — reuse layer setup, add `L.tileLayer` for Esri satellite.
- Signature upload path: `field-visit-proofs/{candidate_id}/{visit_id}/signature.png`; photo: `.../client.jpg`.
- All server writes via existing `supabase` client with RLS (FO scoped by `auth.uid()` → candidate via mobile lookup, same pattern as `self_attendance_punches`).
- Reuse `MarkAttendanceCard` pattern for GPS + haversine.
- No changes to native push, capacitor config, or auth.

## Out of scope (per your instructions)
- No site pictures (removed as requested).
- No changes to admin Field Sense data model beyond tile toggle.
