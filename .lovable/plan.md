## Goal
Refactor the mobile experience at the **design-system and component level** so improvements propagate to every screen automatically. No per-screen CSS hacks, no magic numbers, no fixed pixel layouts.

Native push, `capacitor.config.ts`, `AppDelegate.swift`, `MobileBottomNav.tsx` behavior, and the push bridge are **LOCKED** per memory — I will only adjust their visual styling (padding, safe-area, elevation) without touching functional wiring.

---

## Scope (system-level only)

### 1. Spacing + sizing tokens (`src/styles.css`)
- Define a single spacing scale: `--space-xs/s/m/l/xl` (4 / 8 / 12 / 16 / 24).
- Define radius scale: `--radius-sm/md/lg/xl` (8 / 12 / 16 / 20).
- Define control-height scale: `--control-sm/md/lg` (32 / 40 / 48) — inputs/buttons.
- Density variables that shrink on mobile via `@media (max-width: 768px)`:
  - card padding, section gap, page-shell padding, control height.
- Remove ad-hoc `p-6`, `gap-6`, `rounded-[26px]` in shared components; replace with token utilities.

### 2. Typography scale (mobile-first)
- `--text-page` (page title), `--text-section`, `--text-card`, `--text-body`, `--text-caption`, `--text-meta`.
- Clamp-based sizes so tablet/desktop scale up naturally (`clamp(x, y, z)`), no per-breakpoint overrides needed.
- Rebuild `PageHeader` and card titles to consume these tokens.

### 3. Icon sizing
- One utility set: `.icon-xs/sm/md/lg` (14 / 16 / 20 / 24).
- Replace inconsistent inline `h-4 w-4` / `h-5 w-5` in shared components (`PageHeader`, `StatCard`, `MobileBottomNav`, sidebar) with these.

### 4. Shared components refactored (single source of truth)
All admin screens already consume these — fixing here fixes everywhere:
- **`PageHeader`** — compact mobile variant, tighter crumbs, smaller title on <sm.
- **`MetricTile` / `MiniStat` / `HeroTile` / `StatCard` (in `admin.assets.tsx` and duplicates)** — consolidate into one `<Metric>` primitive: compact (default) + large variants; two-column grid on mobile; no fixed heights.
- **Card primitive** (`src/components/ui/card.tsx`) — density-aware padding via tokens.
- **List row primitive** — new `<ListRow>` used by employees / units / attendance / inventory lists; single-line dense layout with avatar, title, subtitle, right meta, status chip slot.
- **Status chip** — new `<StatusChip>` with fixed compact height, one radius, semantic variants; replace scattered badge usages in shared tables.
- **Filter bar** — new `<FilterBar>` primitive: horizontally scrollable chips on mobile, collapses vertical space; used by lists.
- **Section container** — `<Section title>` with consistent gap tokens; removes ad-hoc `mt-6 space-y-4` clusters.
- **Form field** — tighter `FormRow` wrapper (label + control + hint) with token spacing; groups related fields via `<FieldGroup>`.

### 5. Responsive layout engine
- `.page-shell` rebuilt: `padding: var(--shell-pad)`, `max-width` fluid, safe-area aware (`env(safe-area-inset-*)`).
- Grid utilities: `.grid-metrics` (2 cols mobile → 4 desktop), `.grid-cards` (1 → 2 → 3), no per-page grid definitions.
- Remove fixed heights from shared tiles; use intrinsic sizing + `min-h-0` pattern from the responsive-layout rule.

### 6. Bottom navigation polish (visual only — no logic changes)
- Correct safe-area: use `padding-bottom: max(env(safe-area-inset-bottom), var(--space-s))` instead of the current `safe-bottom` util.
- Attach to screen edge (remove floating shadow gap), proper elevation token, consistent 44pt touch targets, icon+label alignment via the new icon/typography tokens.
- Keep the tab/More logic, native detection, and Link wiring exactly as-is.

### 7. Dashboard density
- Rebuild `admin.dashboard.tsx`, `admin.field-dashboard.tsx`, `admin.employee-dashboard.tsx` **only by swapping to the new shared primitives** — no bespoke styling. This alone cuts vertical space ~30–40%.

### 8. Profile screen grouping
- `admin.profile.tsx` reorganized into `<Section>` blocks (Personal / Employment / Contact / Emergency / Medical / Documents) using the new tokens. Structural refactor only, no data changes.

---

## Out of scope (locked or risky)
- Native push pipeline, `capacitor.config.ts`, `AppDelegate.swift`, push bridge files.
- Business logic, RLS, server functions, data fetching.
- Route structure and navigation targets.
- Auth / login redesign (already recently redesigned).

---

## Rollout order
1. Tokens in `src/styles.css` (spacing, radius, control, typography, icon).
2. Primitives: `Metric`, `ListRow`, `StatusChip`, `FilterBar`, `Section`, `FormRow`, updated `Card`, updated `PageHeader`.
3. Bottom nav visual pass (safe-area + tokens only).
4. Swap dashboards + profile + top list screens to new primitives.
5. Typecheck + visual verification on mobile viewport via Playwright screenshots at 375/390/430/768 widths.

---

## Technical notes
- Tailwind v4 tokens via `@theme` in `src/styles.css`; density media-query overrides in `:root` block.
- No new dependencies.
- Existing `cn`, shadcn primitives, and TanStack routing preserved.
- Each new primitive lives in `src/components/ui/` (or `src/components/` for domain ones) and is exported once.

---

## Credit / risk note
This is a large refactor touching many shared components. Even done at the system level, it's roughly a multi-hour effort and there is real risk of visual regressions on screens I don't explicitly re-test. Given the recent frustration with credit spend, please confirm before I start — or tell me to scope down to a subset (e.g. **just tokens + Metric + ListRow + BottomNav polish** for a first pass, then iterate).
