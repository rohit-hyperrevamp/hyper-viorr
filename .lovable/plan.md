# Post-payroll attendance amendments (version-controlled)

Today attendance can be reopened only while payroll is still open. Once payroll is processed the period is frozen. This adds a controlled **amendment** path: attendance stays approved, a new versioned muster roll is created, and only the affected employees get a delta payroll top-up or recovery with their own second pay sheet.

## Lifecycle

```text
Attendance approved  ->  Payroll processed
        |                      |
        |  status shown: "Approved - payroll processed"
        v
  [Amend attendance]  -> snapshot current sheet as Version 1 (locked, read-only)
        |                 open Version 2 muster roll (editable copy)
        v
  Edit -> Submit -> Approve Version 2
        |
        v
  Payroll page shows "Amendment pending" with a before/after diff
  per affected employee (paid days, ED, gross, deductions, net)
        |
        v
  [Process amendment]  -> posts only the delta for affected employees
                          (net increase -> addition, net decrease -> deduction)
                          creates Version 2 pay sheet for those employees
```

Never touched: employees with no attendance change, already-posted V1 ledger rows, invoice numbers.

## Attendance screen changes

- Status chip becomes explicit: `Approved`, `Approved - payroll ready`, `Approved - payroll processed`.
- After payroll processing the `Reopen` button is replaced by **Amend attendance**, which opens a confirmation dialog stating that the current sheet is archived as Version 1 and a Version 2 copy is created for editing.
- Version selector above the muster roll: current version editable, prior versions render read-only below the active sheet, with changed cells highlighted.
- Amended sheets go through the same Submit -> Approve flow; approving the amendment sets it live.

## Payroll screen changes

- Unit header shows `Processed` plus an `Amendment v2 pending` banner when an approved newer attendance version exists.
- **Review amendment** dialog: per-employee before/after table (paid days, ED, gross, each deduction, net) with the delta column colour-coded (increase green, recovery amber) and an overall net impact total.
- **Process amendment** posts, for each affected employee only:
  - net positive delta -> `additions` row (`Payroll arrears - <period> v2`)
  - net negative delta -> `deductions` row (`Payroll recovery - <period> v2`)
  - employer-contribution delta -> adjusting `employer_contributions` row
- Pay sheet panel gains a version switcher: `V1 (paid)` and `V2 (amended)`, and wage-slip download follows the selected version.

## Technical notes

New tables (migration, with GRANTs + RLS mirroring `attendance_sheets` / `payroll_runs`):

- `attendance_sheet_versions` - `unit_id, period_start, period_end, version, status (locked|active), reason, snapshot jsonb` (full entry set at the moment the version was frozen), `created_by, approved_by, approved_at`.
- `payroll_run_snapshots` - `payroll_run_id, version, candidate_id, paid_days, ed_days, gross, deductions jsonb, employer jsonb, additions jsonb, net_pay, posted_at`. Written by `processPayrollRun` so V1 figures are permanent and the diff is computed against stored numbers, not recomputed guesses.
- `attendance_sheets` gains `current_version int default 1` and `amendment_status text` (`none|open|submitted|approved|processed`).

Code:

- `src/lib/attendance-versions.ts` - snapshot/restore/diff helpers for entries.
- `src/lib/payroll-process.ts` - persist per-employee snapshots on process; new `processPayrollAmendment()` that takes the diff rows and posts only deltas (idempotent via `source_ref = payroll_run:<id>:v<version>`).
- `src/routes/admin.attendance.$unitId.tsx` - version bar, amend dialog, read-only prior-version roll, edit gating by amendment state.
- `src/routes/admin.payroll.$unitId.tsx` - amendment banner, diff dialog, delta processing, pay sheet version switcher.
- `src/lib/period-status.ts` / badges - add the `processed` and `amendment pending` states so attendance, payroll and invoice lists agree.

Safeguards: existing contract day-cap trigger still applies to amended entries; amendments are blocked while an amendment is already open; every transition is written to the activity log.
