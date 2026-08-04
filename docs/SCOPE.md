# Radiant Workforce Platform — Detailed Scope & Feature List

Prepared for proposal documentation.
Platform: unified Web application + native iOS & Android apps (single codebase, shared backend).
Domain: private security / manpower services — workforce, deployment, attendance, payroll, billing, compliance.

---

## 0. Executive Summary

An end-to-end Workforce & Compliance Management Platform purpose-built for security
and facility manpower operations. It covers the complete lifecycle: client acquisition
(organizations, units, contracts) → workforce (onboarding, work orders, deployment,
rehire, offboarding) → daily operations (attendance, extra duty, field tracking via
Radar) → money (payroll, statutory deductions, employer contributions, invoicing) →
material (inventory, uniforms, assets, vehicles) → governance (statutory compliance,
RBAC, audit trail, notifications).

Delivered on **web (desktop console)** and **native mobile (iOS + Android)** with
biometric login (Face ID / Touch ID / Android biometrics), push notifications,
GPS + selfie-based attendance and offline-tolerant field workflows.

---

## 1. Organization & Client Structure

Multi-level hierarchy that mirrors how a security company actually operates.

- **State Manager** — master list of operating states; drives statutory lookups (PT, LWF).
- **Branch Manager** — internal branches; every user, unit and record is branch-scoped.
- **Organization / Customer Manager** — client companies with GSTIN, PAN, registered &
  billing address, contact matrix, auto-generated client codes (e.g. `CLI4375`).
- **Unit Manager** — the client site where guards are deployed:
  - unit code (e.g. `UN-CPL-BARAMATI`), address, state, branch, service mix
  - sanctioned strength by designation
  - unit-level commercial switches: EPF cap applicability, ESI applicability,
    recruitment fee (one-time), GPAIP (annual, recurring on joining anniversary)
  - deployment tree: field officers mapped to the unit and the guards reporting into them
  - deployed people view with live headcount vs sanctioned strength
- **Company Settings** — own legal entity name, GSTIN, home state; drives CGST/SGST vs
  IGST determination on every invoice.

## 2. Client Contracts

- Contract creation with auto contract number (e.g. `CON16021`), client, unit(s),
  start/end dates, renewal dates.
- **Service-line configuration per designation**: pay rate bifurcation (basic, DA, HRA,
  washing allowance, conveyance, other allowances), billing rate, service charge,
  duty hours (8/12 hr), billing type.
- **Statutory configuration per contract**: EPF (with ₹15,000 wage ceiling and cap
  toggle), ESI, Bonus, Gratuity, LWF, Professional Tax — each as employee component,
  employer component, or both.
- **Payroll-days basis** per contract: actual calendar days / fixed 26 / actual minus
  Sundays — enforced as a hard cap at attendance entry.
- **Billing types**: Man-Hours, Man-Days, Man-Months, Special.
- **Duplicate / clone contract** for fast onboarding of similar sites.
- **Document upload & e-signature** — signature pad, signed copy storage, versioning.
- **Approval workflow**: draft → pending approval → approved; statuses unified as
  active / inactive / expired / pending approval / lost.
- **Contract dashboard** with clickable KPI tiles that filter the portfolio by status,
  contract value, and expiring-soon buckets.

## 3. Workforce — Candidates & Employees

### 3.1 Onboarding
- Candidate creation with auto **Candidate Number** (`CAN-` prefix) converting to an
  Employee Code on approval (e.g. `EMP-39636`).
- Personal, contact, address, family & nominee details, languages, gender, DOB,
  joining date (drives GPAIP, recruitment fee and first-payroll logic).
- **KYC & documents**: Aadhaar, PAN, bank proof, photo, police verification,
  ex-service records, education, previous employment.
- **Aadhaar OCR** — capture card image, auto-extract and auto-fill fields; duplicate
  Aadhaar detection triggers the rehire pipeline instead of a silent duplicate.
- **Role assignment** (security guard, supervisor, field officer, HR, accounts, etc.)
  — roles drive access; **designations** drive salary and payable-day caps.
- Branch, unit and designation mapping.
- Approval workflow: submit → review → approve → convert to employee.

### 3.2 Deployment model
- A guard can work at **multiple units**; exactly **one primary unit** (where the work
  order is dispatched); all other units are **reliever / extra-duty only**.
- **Per-unit designation** — the same guard can be a Security Guard at one site and a
  Supervisor at another; attendance and payroll consume the unit-specific designation.
- Admin and Field Officer can **set primary unit**, add/remove unit mappings, or
  **remove a guard from all units**.
- **Work Orders / Posting Orders** — auto-issued on primary-unit assignment or change;
  printable posting order document with company stamp and signature.
- Unmapped-staff alert: guards not mapped to any unit surface in red on the workforce
  coverage KPI with a drill-down list.

### 3.3 Rehire
- Configurable, data-driven rehire chain: Aadhaar duplicate detected → Field Officer
  raises rehire request → Operations Manager → VP Operations → HR enable.
- Rehire pipeline card, request/review/enable dialogs, full history retained.

### 3.4 Offboarding
- Reason master (Resignation, Termination, Absconding, Death), exit date, notice
  handling, final-settlement flag, asset & uniform recovery check, records section
  with audit trail.

### 3.5 Directory & insights
- Searchable employee directory with advanced filters (branch, unit, designation,
  role, status), sortable headers, CSV export.
- Employee profile with full history and audit metadata.
- **Employee Insights / People Insights** — headcount, attrition, joiners/leavers,
  coverage, gated by role.
- **ID Card Editor** — CR80 credit-card-size ID card designer with photo, code, QR.
- **FORM VII** and other statutory registers auto-generated.
- **Employee Attendance Lookup** — per-employee attendance across all units.
- **My Reportees** — field officers see every guard reporting to them, searchable.

## 4. Attendance Management

- **Payroll-window aware periods** — contract window (e.g. 26th → 25th), not just
  calendar month; attendance and payroll always agree on the window.
- **Muster roll grid** per unit: per-employee, per-designation, per-date.
- **Attendance codes** master: P, A, L, HD, WO, CL, SL + custom codes.
- **Rectangular multi-cell selection** — drag/select a block of cells and apply a code
  in one action; keyboard friendly for large units.
- **Extra Duty (ED)** — company-wide nomenclature (DB retains `ot_hours`/`ot_days`);
  quarter-hour (0.125) increments; surplus present days beyond the payable-day cap
  automatically convert to ED.
- **Hard caps enforced at DB level** — a trigger blocks present days exceeding the
  contract's payroll-days basis (e.g. fixed 26), with human-readable error messages.
- **Total Payable / Paid Days** = P + PH + ED (+ configured paid leave); WO and unpaid
  codes never inflate the total.
- **Automated attendance** from field punches (check-in/check-out with GPS + selfie);
  missing check-out is marked absent after the shift window closes.
- Manual entries always take precedence over derived punch data.
- **OCR import** of physical attendance sheets.
- **Approval workflow**: draft → submitted → approved → locked; approved attendance is
  the only input payroll and invoicing accept.
- Unit listing with period status badges, coverage %, and pending-approval queue.
- **Non-billable / internal staff attendance** derived from punches, with ED.

## 5. Radar — Field Operations & Tracking

- **Live field officer tracking** — real-time location, last ping, current unit.
- **Field visits** — scheduled and ad-hoc visits, check-in with GPS + photo, visit
  notes, escalations.
- **Proximity-gated attendance** — a guard can mark attendance only within the unit
  geofence.
- **Mark Attendance card** — face capture + GPS on mobile.
- **Visit progress, escalation requests, live feed** dashboards for admins.
- **Field expenses** capture and approval.
- **Field Sense reports** — per-officer and consolidated PDF reports with date-range
  filters.
- **Daily people pings** — automated scheduled job driving live status.

## 6. Payroll

- Per-unit payroll sheet generated from **approved attendance + contract rates**.
- Earnings: basic, DA, HRA, washing and other allowances, extra duty, paid holidays,
  bonus/incentive additions.
- **Deductions section** (searchable, chip-filterable by bucket): EPF (EE), ESI (EE),
  Professional Tax, Uniform, Advance, Fines, GPAIP, Recruitment Fee, Other; per-employee
  rows with totals.
- **Employer Contribution section** (searchable, chip-filterable): EPF (ER), ESI (ER),
  LWF, Bonus, Gratuity, admin charges — dynamic columns generated from configured heads.
- Clickable KPI tiles that jump straight to the relevant breakdown table.
- **Statutory correctness built in:**
  - EPF wage ceiling (₹15,000) hard-clamped for both EE and ER, unless the unit opts out
  - ESI applicability and thresholds
  - Professional Tax by state schedule and gender, once per employee per month
  - LWF by state and periodicity
  - **Extra Duty is excluded from every deduction and employer-contribution base**
- **One-time & recurring fees** — recruitment fee on joining; **GPAIP recurring annually
  on the joining anniversary**, driven by a scheduled job; carry-forward of joining
  fees into the first payroll window only for genuine new joiners.
- Additions & deductions masters, employee-level additions/deductions entry.
- Payroll windows and salary-processing day configuration.
- Approval workflow: draft → approved → locked; payslip-ready output; CSV export.

## 7. Invoicing

- Per-unit invoice generation from approved attendance + contract commercials.
- Billing types: Man-Hours, Man-Days, Man-Months, Special.
- Service charge, reimbursables, extra duty billing.
- **Tax engine**: CGST/SGST vs IGST decided from company home state vs client state.
- Invoice preview dialog, PDF output, invoice numbering.
- Approval workflow, listing and search by unit, period and status.
- **P&L guardrails** — reconciliation logic ensuring invoice value never falls below
  payroll cost, with variance highlighting.
- **Finance Coverage / Finance Charter** dashboards with pace-vs-plan colour thresholds
  (green / amber / red) and 5% delta highlighting.

## 8. Inventory & Uniform Management

- **Item master** with categories, sizes and units of measure.
- **Vendor master** with GSTIN, contact and payment terms; **vendor rate cards**.
- **Warehouses** and stock locations.
- **Purchase Orders** — create, approve, print PDF.
- **Goods Receipts / Delivery Challans** against PO with invoice number and upload.
- **Demands** — unit-level requisitions with requester tracking and branch scoping.
- **Transfers** — warehouse↔warehouse, warehouse↔unit, with in-transit visibility.
- **Issuances** — issue uniform/stock to employees or units; recovery on offboarding.
- **Collections** and returns.
- **Stock report** (on-hand by warehouse) and **stock ledger** (chronological movements).
- **My Inventory / My Stock** — field officer and unit-level view of own stock and net
  possession.
- **Inventory dashboard** — KPIs, low-stock alerts, in-transit, ageing.
- Inventory approval workflows.

## 9. Asset Management

- Asset inventory and registration; assignment to employees or units.
- Asset master categories (Uniform, ID Card, Laptop, SIM, Handset, etc.).
- **Asset loans** and recovery scheduling into payroll deductions.
- Asset expense manager and lifecycle tracking.

## 10. Vehicle & Fleet Management

- Vehicle inventory, ownership and assignment.
- **FastTag manager** — tag numbers, balances, linkage.
- **Insurance manager** with policy details and expiry alerts.
- **PUC manager** with expiry tracking.
- **Service manager** — service logs and schedules.
- **Expense manager** — fuel, tolls, repairs.
- **Insight Lab** — fleet utilisation and cost analytics.

## 11. Statutory Compliance

A dedicated Compliance Command Center plus configuration masters that keep every
statutory calculation auditable and state-accurate.

- **EPF (Provident Fund)** — 12% EE / 13% ER (incl. admin charges), ₹15,000 wage
  ceiling with per-unit opt-out, UAN capture, hard clamp on every line.
- **ESIC** — 0.75% EE / 3.25% ER, wage-threshold applicability, ESIC branch code master
  by zone, IP number capture.
- **Professional Tax** — state-wise slab master, gender-aware schedules, once-per-month
  enforcement.
- **Labour Welfare Fund (LWF)** — state-wise rules, contribution periodicity, EE/ER split.
- **Bonus** — statutory bonus accrual per contract configuration.
- **Gratuity** — accrual as a cost component; eligibility tracking.
- **Minimum Wages** — designation- and state-linked pay rates in the contract.
- **GPAIP** — group personal accident insurance, annual recurring on joining anniversary.
- **Recruitment fee** — one-time, joining-date driven.
- **Statutory registers & forms** — FORM VII, muster roll, wage register, attendance
  register; export-ready.
- **Document expiry tracking** — police verification, insurance, PUC, contracts.
- Compliance Command Center surfacing pending/expiring/non-compliant items by unit.

## 12. Control Center (Configuration Masters)

Every business rule is data-driven, no hardcoding:

Professional Tax Manager · LWF Manager · Duty Manager (8hr/12hr) · Attendance Code
Manager · Service Type Manager · Payroll Manager (window + salary day) · Payroll Days
Manager · Allowance Manager · Addition Type Manager · Deduction Type Manager · Billing
Type Manager · Designation Manager · **Cost Component Manager** (EPF/ESI/Bonus/Gratuity/
LWF with party = employee / employer / both, formula builder, description) · Ex-Service
Manager · Offboarding Reason Manager · ESIC Branch Manager · Asset Manager · Language
Manager · Company Documents (NDA, Appointment Letter templates) · Roles Manager · RBAC ·
**Workflow Manager** (configurable approval chains, steps, roles, order) · Company
Settings · **System Logs**.

## 13. Role-Based Access Control & Security

- Roles: Super Admin, Admin, HR, Leadership, Branch Manager, Branch Admin, Operations,
  Operations Manager, VP Operations, Accounts, Finance, Inventory Manager, Transport,
  Field Officer, Security Guard/Guard — extensible via Roles Manager.
- Permission matrix: **view / edit / delete / approve** per module and sub-module.
- **Branch-scoped visibility** — users only see their branch's data.
- **Unit-scoped visibility** for field officers; guard self-service scope.
- Route-level permission guards on web and mobile.
- Approval-capable modules: Contracts, Attendance, Payroll, Invoice, Inventory, Rehire.
- Phone + OTP authentication, managed sessions, Google OAuth ready.
- **Biometric login** — Face ID / Touch ID on iOS, biometrics on Android, with keychain
  wipe on user switch.
- Append-only **activity log** on every create / update / enable / disable / delete,
  with actor, module, entity and timestamp.

## 14. Dashboards & Analytics

- **Admin / Leadership dashboard** — cross-module KPIs, workforce coverage, finance
  charter, attendance charter, pace-vs-plan colour coding.
- **Field Officer dashboard** — photo header, my units, team size (drill-down to
  reportees), today's attendance, visits, escalations.
- **Employee / Guard dashboard** — my attendance, my units, my inventory, payslip view.
- **Inventory dashboard**, **Contract portfolio dashboard**, **Vehicle Insight Lab**.
- Workforce Coverage (committed vs actual, 100% turns green), Attendance Coverage,
  Finance Coverage with 5% delta highlighting.

## 15. Notifications

- In-app notification bell with unread badge, notification centre with full history.
- Module-driven events: approvals pending, attendance not submitted, contract expiry,
  document expiry, rehire steps, stock low, payroll locked.
- **Native push notifications** on iOS (APNs) and Android.
- Deep-link routing from notification to the exact record.
- Notification sound and read/unread state sync across web and mobile.

## 16. Mobile Applications (iOS & Android)

- Native shells over a shared codebase; installable from App Store / Play Store.
- **Biometric app lock** (Face ID / Touch ID / Android biometric).
- **Native camera** for selfie attendance and document/Aadhaar capture.
- **GPS/location** for proximity-gated attendance and Radar pings.
- **Push notifications** via APNs and FCM.
- High-density mobile UI: compact page headers, mini-stats, hero tiles, bottom nav,
  slide-up native-style menus, safe-area handling, 16px minimum font sizes.
- Offline-tolerant interactions with graceful retry and stale-build recovery.
- Device telemetry plugin for app health.

## 17. Cross-Cutting Platform Capabilities

- Activity logging and audit metadata (created_by, updated_by, timestamps) on all entities.
- CSV export on every listing and on System Logs (filtered rows).
- Advanced filters, sortable headers, saved search patterns.
- Delete guard with confirmation on destructive actions.
- Document upload with signed-URL storage and previews.
- PDF generation: posting orders, purchase orders, invoices, field reports, ID cards.
- Configurable, data-driven approval workflows (no hardcoded roles or step order).
- Scheduled jobs: annual GPAIP, daily people pings, derived attendance close-out.
- Multi-language scaffolding (i18n) and light/dark theming.
- Error resilience: stale-chunk auto-recovery, global error capture.

---

## 18. Scale & Deployment Assumptions

- Target scale: ~7,000 employees, multi-branch, multi-state.
- Web console for HO/HR/Finance; mobile apps for field officers and guards.
- Cloud-hosted (AWS ap-south-1 Mumbai recommended) with data residency in India,
  encryption at rest and in transit, RBAC, MFA for privileged roles, and immutable
  audit logging.

---

## 19. Module Count Summary

| # | Module | Sub-modules |
|---|--------|-------------|
| 1 | Organizations & Units | 4 |
| 2 | Client Contracts | 8 |
| 3 | Candidates & Employees | 12 |
| 4 | Attendance | 10 |
| 5 | Radar / Field Operations | 7 |
| 6 | Payroll | 10 |
| 7 | Invoicing | 7 |
| 8 | Inventory & Uniform | 14 |
| 9 | Assets | 4 |
| 10 | Vehicles | 7 |
| 11 | Statutory Compliance | 10 |
| 12 | Control Center | 24 |
| 13 | RBAC & Security | 8 |
| 14 | Dashboards | 7 |
| 15 | Notifications | 4 |
| 16 | Mobile (iOS + Android) | 8 |

---

## 20. Banking & Disbursement Integrations

- **Bank integration** for direct salary disbursement from the payroll module.
- **Tele file generation** in the format required by Tele's banking/specification standards, produced automatically per payroll run.
- **API integration** with Tele / banking partner if supported by the provider, enabling straight-through payment posting and status callbacks.
- Reconciliation of disbursement status (success / failure / pending) back against individual employee payroll records.

---

## 21. Third-Party Integrations

This section lists every external integration planned for the Radiant Workforce Platform, its purpose, current status, what is included in the project cost, and what remains the client's / third-party's responsibility.

### 21.1 Integration Cost Matrix

| Integration | Purpose | Status | Implementation Cost | API / Usage Cost | Notes |
|---|---|---|---|---|---|
| **ICICI Bank** | Direct salary disbursement, payment posting, status callbacks | Awaiting API details from ICICI Bank | Included | Not applicable (to be borne by Radiant as per bank agreement) | Tele file generation is built-in; the API layer will be added once ICICI shares the specifications. |
| **Tally** | Accounting / GST invoice sync, ledger push | API integration included | No implementation charge | Unknown (Tally may charge for API / cloud connector; to be confirmed) | One-way / bi-directional sync scope to be finalized with the finance team. |
| **Aadhaar Verification** | Validate Aadhaar during onboarding, duplicate detection, rehire trigger | Provider to be selected (Karza / AuthBridge / HyperVerge / Signzy / Cashfree / Decentro) | Included | ~₹10 – ₹20 per verification; volume discounts available | Cost is on actual usage. Connector development, validation workflow, and audit logging are included. |
| **WhatsApp Business API** | Transactional alerts, OTP fallback, approval notifications | Implementation ready | Included | On actuals (conversation-based Meta pricing) | Sailesh (Radiant IT) already has WhatsApp APIs which can be reused to minimize cost. |
| **Email OTP (MSG91)** | OTP and transactional emails for login and notifications | Ready to configure | Included | 3,000 emails / OTP free per month; thereafter as per MSG91 tariff | Personal email login flows will use this service. |
| **SMS OTP** | Backup OTP channel when email delivery fails | Ready to configure | Included | On actuals | Will use Sailesh's SMS gateway or WhatsApp OTP as fallback. |
| **GST Integration** | Auto GST return push / e-invoicing / GSTR reconciliation | Implementation pre-included | Included | Unknown; GST API availability and pricing to be confirmed | GSTIN validation is already built into the platform. |
| **Google Gemini 2.5 Flash** | Document scanning, OCR, and data extraction from attendance sheets, invoices, Aadhaar cards, POs, GRNs | Active (via Lovable AI Gateway) | Included | ~₹500 – ₹1,500 / month estimated at current USD/INR rates (~₹29 per million input tokens, ~₹239 per million output tokens) | Cost scales with the number of documents scanned; a free tier is available from Google. |

### 21.2 What Is Included

- All connector development, API wrappers, webhook handlers, and error-handling logic within the Radiant platform.
- Configuration UI and field-mapping screens where required.
- Rate-limit handling, retry logic, idempotency keys, and audit logging for every integration call.
- Fallback routing (for example, WhatsApp or SMS OTP fallback when email OTP fails).
- Security controls: credential vaulting, request signing, and token refresh handled server-side.

### 21.3 What Is Not Included

- Third-party subscription fees, per-transaction charges, or API usage bills:
  - MSG91 email beyond the 3,000 free OTP/month tier.
  - Aadhaar per-verification charges.
  - WhatsApp conversation charges.
  - Tally / GST API costs.
  - Google Gemini token usage beyond the free tier.
- Custom hardware, dedicated bank POS devices, or biometric scanners.
- Licenses for Tally, GST Suvidha Provider (GSP), or Aadhaar Authentication User Agency (AUA) registrations if required by the chosen provider.
- Changes forced by third-party API version upgrades after go-live (these will be handled under AMC if opted).

### 21.4 Assumptions & Dependencies

- **ICICI Bank:** API documentation and sandbox/test credentials are required from the bank before development can start.
- **Tally:** Tally Prime / Tally.ERP 9 with GST enabled and API/cloud connector access must be available.
- **Aadhaar:** The selected provider must share API credentials and acceptable-use documentation; Radiant will sign required agreements directly with the provider.
- **WhatsApp:** Business phone number verification and a Meta Business Manager account must be provided by Radiant.
- **MSG91:** Account to be created and funded by Radiant for volumes beyond the free tier.
- **GST:** GSP / API access and credentials to be arranged by Radiant once the API is available / selected.
- **Google Gemini:** Document volume assumptions are indicative; actual cost will depend on pages scanned, image resolution, and extraction complexity.

---

## 22. Data Migration Plan

A structured, phase-wise data migration plan will be executed to move Radiant's existing operational data into the Radiant Workforce Platform without disrupting live operations. For every module listed below, a dedicated **migration utility / data loader** will be developed and tested before cutover. Each utility will support validation, dry-run, error reporting, and rollback capability.

### 22.1 Migration Sequence

The migration will follow a dependency-driven order so that master data is loaded before transactional data:

````text
Phase 1: Master Data
  ├─ Employees (workforce master)
  ├─ Organizations / Customers
  ├─ Branches & States
  ├─ Units (client sites)
  └─ Client Contracts (with service lines, designation rates, statutory config)

Phase 2: Historical Operations
  ├─ Past attendance registers (muster rolls)
  ├─ Leave balances and attendance codes
  └─ Extra Duty / reliever historical records

Phase 3: Financial & Compliance
  ├─ Payroll runs (earnings, deductions, employer contributions)
  ├─ Invoices (raised and pending)
  ├─ Statutory compliances:
  │   ├─ EPF (employee & employer, UAN mapping, wage ceiling history)
  │   ├─ ESIC (employee & employer, IP number mapping)
  │   ├─ Professional Tax (state-wise, gender-aware slabs)
  │   ├─ Labour Welfare Fund (LWF)
  │   ├─ Bonus accrual records
  │   ├─ Gratuity accrual records
  │   └─ GPAIP and recruitment fee ledgers

Phase 4: Material & Assets
  ├─ Inventory opening stock (warehouses, units)
  ├─ Item master, vendor rate cards, purchase orders
  ├─ Goods receipts, transfers, issuances, collections
  ├─ Asset master and employee/unit assignments
  └─ Vehicle fleet, insurance, PUC, FastTag, service history
````

### 22.2 Module-wise Migration Utilities

| # | Module | Source Data Expected From Radiant | Migration Utility Output |
|---|--------|-----------------------------------|--------------------------|
| 1 | **Employees** | Employee master (personal, KYC, bank, family, designation, joining date, role, branch, primary/reliever unit mappings) | Validated employee records with auto-generated EMP codes; Aadhaar duplicate flagging routed to rehire workflow |
| 2 | **Organizations** | Client company list with GSTIN, PAN, registered/billing addresses, contacts | Organization records with auto client codes (e.g., CLI4375) |
| 3 | **Units** | Site/unit list with addresses, states, branches, sanctioned strength by designation, commercial switches (EPF cap, ESI, recruitment fee, GPAIP) | Unit records with auto unit codes (e.g., UN-CPL-BARAMATI) and deployment tree scaffolding |
| 4 | **Client Contracts** | Contract headers, start/end/renewal dates, designation-wise pay/billing bifurcation, statutory applicability, billing type, payroll-days basis | Contract records with auto contract numbers (e.g., CON16021), linked service lines and cost-component configuration |
| 5 | **Attendance** | Historical muster rolls / punch data (date-wise P/A/L/HD/WO/CL/SL/ED codes) | Window-aware attendance grids; hard cap validation against contract payroll-days basis; surplus P days converted to ED |
| 6 | **Payroll** | Historical salary sheets, earnings, deductions, employer contributions, loan/advance/fine records | Period-wise payroll runs with statutory-accurate EPF/ESI/PT/LWF/Bonus/Gratuity/GPAIP/recruitment fee calculations |
| 7 | **Invoicing** | Past invoices, billing rates, service charges, GST splits | Invoice records with CGST/SGST/IGST determination and P&L reconciliation against payroll |
| 8 | **Statutory Compliance** | EPF/ESI/UAN/IP histories, PT/LWF payment records, bonus/gratuity accruals, FORM VII data | Compliance registers and expiry-tracked document records |
| 9 | **Inventory** | Item master, opening stock by warehouse/unit, vendor master, PO/GRN/transfer/issuance history | Stock ledger, on-hand balances, demand/transfer workflows |
| 10 | **Assets** | Asset categories, asset register, employee/unit assignments, loan/recovery schedules | Asset lifecycle records with recovery linkage to payroll deductions |
| 11 | **Vehicles** | Vehicle inventory, ownership, insurance/PUC/FastTag/service logs, fuel/expense records | Fleet records with expiry alerts and Insight Lab analytics |

### 22.3 Migration Approach

- **Data templates:** Standardized Excel/CSV templates will be provided to Radiant for each module so the source data can be collected in the exact format the loader expects.
- **Validation engine:** Every loader will run pre-validation (data type, referential integrity, duplicate detection, statutory rule checks) and produce an error report before any write operation.
- **Dry-run mode:** Each utility supports a dry-run that simulates the full migration and reports counts, errors, and warnings without touching production data.
- **Incremental loading:** Master data can be loaded incrementally; transactional data can be loaded period by period (month/window) to avoid lock contention.
- **Audit trail:** Every migrated record will carry `created_by`, `created_at`, and a migration batch identifier so the origin of imported data remains traceable.
- **Rollback plan:** A snapshot of the target database will be taken before each phase; rollback scripts will be maintained for the duration of the cutover window.

### 22.4 Cutover & Sign-off

- **UAT parallel run:** Migrated data will first be loaded into a UAT/staging environment where Radiant's operations team can reconcile reports against their existing records.
- **Reconciliation reports:** Module-wise reconciliation reports (record counts, totals, sample spot checks) will be generated for sign-off.
- **Go-live cutover:** After sign-off, the final migration utilities will be executed in a maintenance window, followed by smoke tests on login, attendance capture, payroll generation, and invoice generation.

---

## 23. Hosting Architecture & Infrastructure Cost (AWS + Database)

The platform is deployed on a hybrid model: **AWS (Mumbai, ap-south-1)** hosts the application tier and static/CDN delivery, while the backend database layer will be either **Supabase (managed PostgreSQL)** or **MongoDB (managed NoSQL)**. Both options are kept contractually open and the final selection will be made after load testing and data-access pattern validation. This split keeps the stack production-grade and horizontally scalable without the cost and operational overhead of self-managing a database cluster.

> **Database decision note:** Supabase/PostgreSQL is the current implementation and is preferred for relational integrity, complex payroll/invoice joins, Row-Level Security and mature auth/storage integrations. MongoDB is included as an alternative should load testing prove that document-oriented scaling, sharding or specific read-heavy reporting patterns deliver materially better performance or cost at 7,000 employees. The contract covers both; the final choice is confirmed before production go-live.

### 23.1 Architecture Summary

| Layer | Service | Purpose |
|-------|---------|---------|
| Edge / CDN | **Amazon CloudFront** | Global edge caching of the web app bundle, images and documents; TLS termination; DDoS absorption via AWS Shield Standard |
| Static hosting | **Amazon S3** | Hosts the built React/TanStack Start client bundle and static assets; also used as an origin for report/document downloads |
| Application compute | **Amazon ECS on AWS Fargate** | Runs the SSR / server-function containers. Serverless containers — no EC2 instances to patch, scale or pay for while idle |
| Load balancing | **Application Load Balancer (ALB)** | Routes HTTPS traffic to Fargate tasks, health checks, path-based routing for `/api/*` |
| Networking | **VPC, private subnets, NAT, Security Groups** | Compute runs in private subnets; only the ALB is internet-facing |
| Secrets | **AWS Secrets Manager / SSM Parameter Store** | Stores API keys, service credentials and connection strings; injected into Fargate tasks at runtime |
| Observability | **CloudWatch Logs, Metrics, Alarms** | Container logs, error-rate and latency alarms, auto-scaling triggers |
| Backend data | **Supabase (PostgreSQL)** or **MongoDB (NoSQL)** — to be finalized after load testing | Primary transactional database. PostgreSQL path uses Row-Level Security, PostgREST Data API, Auth, Storage, Realtime and `pg_cron`. MongoDB path uses document collections with equivalent application-level access control, Atlas Search and change streams; Auth/Storage handled by AWS/self-managed services if Supabase is not used |

### 23.2 Component Descriptions

- **Amazon CloudFront** — Content delivery network sitting in front of S3 and the ALB. Caches static assets at Indian edge locations for fast first paint on low-bandwidth field devices, serves everything over HTTPS, and shields the origin from traffic spikes and volumetric attacks.
- **Amazon S3** — Object storage for the compiled front-end bundle, images, generated PDFs (payslips, invoices, posting orders, FORM VII) and export files. Versioning and lifecycle rules retain historical artefacts; server-side encryption (SSE-KMS) is enabled by default.
- **AWS Fargate (ECS)** — Serverless container runtime for the application server: SSR rendering, server functions, payroll/invoice computation endpoints and integration connectors. Tasks scale out automatically on CPU/request count during morning attendance peaks and payroll windows, and scale back down at night, so cost tracks real usage rather than provisioned capacity.
- **Application Load Balancer** — Terminates TLS, distributes traffic across healthy Fargate tasks across two Availability Zones, and provides automatic failover if a task or AZ becomes unhealthy.
- **VPC & private networking** — Application containers have no public IP. Outbound calls (Supabase, bank APIs, WhatsApp, Gemini) route through a NAT gateway; inbound traffic arrives only through the ALB.
- **AWS Secrets Manager** — Central store for all credentials with rotation support. No secret is committed to the repository or baked into an image.
- **CloudWatch** — Centralised logging and metrics with alarms on 5xx rate, task health, latency and auto-scaling events; log retention configured for audit needs.
- **Supabase PostgreSQL (primary path)** — The system of record for all employees, units, contracts, attendance, payroll, invoicing, inventory, assets and compliance data. Row-Level Security enforces branch/unit/role scoping at the database layer, so access rules cannot be bypassed by the client. Point-in-time recovery and daily backups are enabled on the paid plan.
- **MongoDB Atlas (alternative path)** — Document database option evaluated under load testing. Provides horizontal scaling via sharding, flexible schema for evolving compliance forms, and Atlas Search for fast guard/client lookup. Access control, audit logging and encryption are configured at the Atlas project level; application-layer middleware enforces branch/unit/role scoping equivalent to PostgreSQL RLS.
- **Supabase Auth (primary path)** — Handles user identity, JWT issuance, session refresh, OTP flows and integration with device biometrics (Face ID / fingerprint) on the mobile apps.
- **MongoDB-backed Auth (alternative path)** — If MongoDB is selected, authentication is implemented with AWS Cognito or a self-managed JWT/OTP service inside Fargate, still integrating with device biometrics on mobile.
- **Supabase Storage (primary path)** — Bucketed file storage for KYC documents, photographs, uniform/asset images and signed attendance evidence, protected by the same RLS-driven access policies.
- **S3-backed Storage (alternative path)** — If MongoDB is selected, document and image storage moves to encrypted S3 buckets with signed-URL access controlled by the application tier.
- **Supabase Realtime & pg_cron (primary path)** — Powers live dashboards (Radar tracking, coverage tiles) and scheduled jobs such as annual GPAIP accrual, document-expiry alerts and daily attendance derivation.
- **MongoDB Change Streams / Atlas Triggers (alternative path)** — Provides realtime notifications and scheduled data jobs if the MongoDB route is chosen.

### 23.3 Scalability Posture

- 7,000 registered users translate to a few hundred to low-thousand concurrent sessions at attendance and payroll peaks; the Fargate + Supabase combination absorbs this comfortably, and the Fargate + MongoDB Atlas combination is expected to scale similarly with appropriate indexing and sharding.
- Horizontal scaling is achieved by increasing Fargate task count (auto-scaling policy). On the data side: Supabase scales by moving up compute tiers and adding read replicas; MongoDB scales vertically and horizontally via sharding/partitioning if load testing justifies it.
- A formal load-testing cycle will compare PostgreSQL vs MongoDB response times for the heaviest operations (bulk payroll generation, attendance roster load, invoice aggregation, guard search) before the database is finalized.
- Long-running jobs (bulk payroll generation, invoice PDF batches, migration loaders) run on a separate worker service so they never block the interactive web API.

### 23.4 Infrastructure Cost (Included in Scope)

| Component | Plan / Sizing | Indicative Monthly Cost | Commercial Treatment |
|-----------|---------------|-------------------------|----------------------|
| **Database — Supabase (PostgreSQL)** | Paid plan (Pro tier and above, sized to load) | **USD 25 – USD 150 per month** | **Included** |
| **Database — MongoDB Atlas (NoSQL)** | M10/M30 tier or equivalent, sized to load; includes backups & monitoring | **USD 60 – USD 200 per month (~INR 5,400 – 18,000)** | **Included** |
| **AWS (ECS Fargate + S3 + CloudFront + ALB + CloudWatch + supporting services)** | Mumbai region (ap-south-1), auto-scaled | **INR 25,000 – INR 35,000 per month** | **Included** |

- Both hosting costs above are **included** in the engagement; no separate infrastructure billing is raised for the ranges stated.
- The ranges reflect normal operating load for the stated user base. Sustained usage materially beyond this scope (significant increase in headcount, data volume, media storage or reporting concurrency) would be reviewed jointly before any revision.
- Third-party usage charges described in Section 21 (Aadhaar verification, WhatsApp messaging, SMS/email beyond free tiers, bank/GST/Tally API fees) are separate from these hosting costs.

---

### 23.5 Line-Item Infrastructure Cost Breakdown (AWS Mumbai, ap-south-1)

All figures are indicative monthly costs at the expected operating load (7,000 registered users, a few hundred to low-thousand concurrent sessions at peaks). USD figures converted at approximately INR 90 per USD. AWS pricing is usage-based, so actuals move with traffic, storage and data transfer.

| # | Service | What it is charged on | List rate (ap-south-1) | Assumed usage | Indicative INR / month |
|---|---------|----------------------|------------------------|---------------|------------------------|
| 1 | **ECS on AWS Fargate** (application containers) | Per vCPU-hour and per GB-hour, billed per second while a task runs | ~USD 0.04048 per vCPU-hr; ~USD 0.004445 per GB-hr | 2 baseline tasks (1 vCPU / 2 GB) running 24x7, auto-scaling to 4-6 tasks during morning attendance and payroll peaks | **INR 8,000 – 13,000** |
| 2 | **Fargate worker service** (payroll, invoices, batch jobs) | Same Fargate rates | As above | 1 task (1 vCPU / 2 GB), running mostly during batch windows | **INR 1,500 – 3,500** |
| 3 | **Application Load Balancer (ELB)** | Fixed hourly charge + LCU (Load Balancer Capacity Unit) charge | ~USD 0.0225 per ALB-hour (~USD 16.4 / month fixed) + ~USD 0.008 per LCU-hour | 1 ALB, 2-5 LCUs average | **INR 2,500 – 4,000** |
| 4 | **Amazon S3** (static bundle, PDFs, exports, documents) | Storage per GB-month + PUT/GET requests + data transfer out | ~USD 0.025 per GB-month (Standard); ~USD 0.005 per 1,000 PUT; ~USD 0.0004 per 1,000 GET | 150 – 400 GB growing storage with moderate request volume | **INR 700 – 2,000** |
| 5 | **Amazon CloudFront (CDN)** | Data transfer out to internet + HTTPS requests, priced by region of the viewer | ~USD 0.109 per GB for India edge locations; ~USD 0.0120 per 10,000 HTTPS requests | 300 – 600 GB egress per month (app bundle, images, PDFs, mobile assets) | **INR 3,000 – 6,000** |
| 6 | **Public dedicated IPv4 addresses** | Per in-use public IPv4 address, per hour (charged since Feb 2024 on all public IPv4) | **USD 0.005 per IP-hour = ~USD 3.60 per IP-month = ~INR 325 per IP-month** | 2 ALB public IPs (one per AZ) + 1 NAT gateway IP = 3 IPs | **INR 950 – 1,300** |
| 7 | **NAT Gateway** (outbound access for private subnets) | Hourly charge + per-GB processed | ~USD 0.056 per NAT-hour (~USD 41 / month) + ~USD 0.056 per GB processed | 1 NAT gateway, 50 – 150 GB processed | **INR 4,000 – 5,000** |
| 8 | **CloudWatch** (logs, metrics, alarms) | Log ingestion per GB, storage per GB, custom metrics, alarms | ~USD 0.57 per GB ingested; ~USD 0.03 per GB-month archived; ~USD 0.30 per custom metric | 15 – 30 GB logs per month with retention | **INR 900 – 2,000** |
| 9 | **AWS Secrets Manager** | Per secret per month + API calls | ~USD 0.40 per secret / month; ~USD 0.05 per 10,000 API calls | 8 – 15 secrets | **INR 350 – 700** |
| 10 | **Amazon ECR** (container image registry) | Storage per GB-month | ~USD 0.10 per GB-month | 5 – 15 GB of images | **INR 50 – 150** |
| 11 | **Route 53** (DNS) | Per hosted zone + per million queries | ~USD 0.50 per hosted zone; ~USD 0.40 per million queries | 1 – 2 zones | **INR 100 – 200** |
| 12 | **AWS WAF** (web application firewall) — **not included in base; billed on actuals, see Section 25** | Per web ACL + per rule + per million requests | ~USD 5.00 per web ACL; ~USD 1.00 per rule; ~USD 0.60 per million requests | 1 web ACL with managed rule groups | **INR 900 – 1,800 (additional)** |
| 13 | **AWS Backup / snapshots, KMS, misc data transfer** | Storage, key usage, inter-AZ transfer | ~USD 1.00 per KMS key/month; snapshot storage per GB | Standard configuration | **INR 800 – 1,500** |
| | **Total AWS** | | | | **INR ~24,000 – 41,000; budgeted at INR 25,000 – 35,000** |

**Database backend — separate from AWS (either Supabase PostgreSQL or MongoDB Atlas):**

| Plan | What it includes | Cost |
|------|------------------|------|
| **Supabase Pro** | Dedicated project compute, 8 GB database storage baseline, 100 GB file storage, daily backups, 7-day point-in-time recovery, 100,000 monthly active auth users, email support | **USD 25 per month (~INR 2,250)** |
| **Supabase Pro with scaled compute / add-ons** | Larger compute instance (more CPU/RAM for reporting and payroll load), extended PITR, additional database and file storage, higher egress | **USD 60 – 150 per month (~INR 5,400 – 13,500)** |
| **MongoDB Atlas M10 / M30** | Managed MongoDB cluster, 10–40 GB storage baseline, automated backups, monitoring, Atlas Search, encryption at rest | **USD 60 – 120 per month (~INR 5,400 – 10,800)** |
| **MongoDB Atlas with scaling / add-ons** | Larger tier (M40+), sharding, extended backups, higher ops/sec, cross-region replica | **USD 120 – 200 per month (~INR 10,800 – 18,000)** |

Expected steady state is **USD 25 – 200 per month** depending on the chosen database and load, i.e. approximately **INR 2,250 – 18,000 per month**, and this is **included** in the engagement. The final database and tier are selected after load testing; both Supabase and MongoDB costs are contractually covered.

**Notes on cost behaviour**

- **Fargate is the single biggest lever.** Because it bills per second, scaling to zero-idle at night and using right-sized tasks (1 vCPU / 2 GB) keeps compute far cheaper than always-on EC2 instances of equivalent peak capacity.
- **Public IPv4 is a small but real fixed cost** — INR ~325 per IP per month — which is why containers run in private subnets with no public IPs; only the load balancer and NAT gateway hold public addresses.
- **NAT gateway and CloudFront egress** are the two costs that grow fastest with usage; document/photo heavy months (bulk KYC uploads, large report exports) push these up.
- **Single-AZ vs Multi-AZ:** the figures assume two Availability Zones for resilience. A single-AZ configuration would cut ALB, NAT and IPv4 costs by roughly a third but removes automatic AZ failover, so it is not recommended for production.
- Reserved capacity options (Compute Savings Plans on Fargate) can reduce compute cost by 20 – 30 percent once the steady-state baseline is measured after go-live.

---
## 24. Disaster Recovery (DR)

> **Commercial note: Disaster Recovery is NOT included in the base engagement.** The DR process, runbooks and architecture are defined here, and can be implemented and operated **on actuals** — i.e. the client is billed the incremental infrastructure cost plus a one-time DR setup effort, over and above the base hosting cost in Section 23.

### 24.0 Write-up — What Disaster Recovery Means Here

The production system runs in AWS Mumbai with the database and authentication on a managed PostgreSQL backend. Day-to-day resilience is already built in: the application runs as multiple containers spread across two Availability Zones, the load balancer removes any unhealthy container automatically, and the database is backed up daily with point-in-time recovery. If a single container, or even a whole Availability Zone inside Mumbai, fails, the system keeps running with no manual action. **That level of protection is included in the base price.**

Disaster Recovery addresses a different and much rarer class of event: the **entire Mumbai region becomes unavailable**, the **database is corrupted or maliciously encrypted**, or **someone with administrator credentials deletes data**. In those situations there is nothing left in Mumbai to fail over to, so recovery depends on having a second, independent copy of the platform in another region, kept continuously up to date.

The proposed posture is **Warm Standby**. A permanently running but deliberately small copy of the application sits in a second AWS region (Hyderabad). It runs the identical container image, has the identical configuration and secrets, and receives a continuous stream of data from the primary — documents replicate to a second S3 bucket, the database replicates to a standby copy, and immutable backups are written into a separate, locked AWS account that production credentials cannot reach. In normal operation this standby costs very little because it is running at minimum size and serving no traffic.

When a disaster is declared, the standby is promoted rather than built: the database replica is promoted to primary, the application is scaled from one container to full production size, and the public hostname is switched to the standby load balancer through Route 53. In practice this brings the platform back in **30 to 120 minutes**, with **5 to 15 minutes of data loss at most**. Without DR, the same event means rebuilding the environment from backups — realistically **4 to 12 hours down and up to a day of lost data**, which for this system means a lost day of attendance marking across every unit and a delayed payroll close.

The ransomware case is handled slightly differently from a region outage. Replication alone does not help against ransomware, because malicious changes replicate too. The defence is the **immutable backup vault**: backups are written under Vault Lock in compliance mode in a separate AWS account, meaning nobody — including a fully compromised administrator — can delete them or shorten their retention. Recovery is then a point-in-time restore into a clean, freshly provisioned environment, using the append-only activity log to identify the exact moment before the first malicious write.

DR is not a one-time build. It only holds value if it is exercised, so the plan includes automated weekly backup-restore verification, a quarterly tabletop walkthrough, and a half-yearly failover drill that produces a signed report of the measured RTO and RPO against target.

Commercially, DR is quoted separately from the base hosting for a simple reason: it roughly doubles the running infrastructure, and the client should be able to see exactly what that second copy costs and decide whether the warm-standby posture, the cheaper backup-and-restore posture, or no DR at all is the right fit. Section 24.7 gives that cost component by component, with AWS unit rates, and includes WAF and Shield pricing separately since those are usually decided at the same time.

### 24.1 Objectives

| Parameter | Base (included) | With DR (additional, on actuals) |
|---|---|---|
| **RPO** (max acceptable data loss) | Up to 24 hours (daily backup) with 7-day PITR on the database | **5 – 15 minutes** (continuous replication + PITR) |
| **RTO** (max acceptable downtime) | 4 – 12 hours (rebuild from backups into the same region) | **30 – 120 minutes** (warm standby in a second region) |
| **Scope of failure covered** | Single task / single AZ failure, accidental data deletion | Full AWS region outage, backend region outage, ransomware / malicious deletion |

### 24.2 DR Strategy — Warm Standby (recommended)

Three DR postures were evaluated:

| Posture | How it works | RTO / RPO | Relative monthly cost |
|---|---|---|---|
| **Backup & Restore** (cheapest) | Backups and container images copied cross-region; infrastructure rebuilt from Infrastructure-as-Code only when disaster is declared | RTO 4 – 12 hrs, RPO up to 24 hrs | Lowest |
| **Warm Standby** (recommended) | A minimal always-on copy of the stack in a second region (Hyderabad / Singapore) with data continuously replicated; scaled up on failover | RTO 30 – 120 min, RPO 5 – 15 min | Moderate |
| **Active-Active** | Full production capacity live in both regions behind global routing | RTO near zero, RPO near zero | Highest (roughly 2x base) |

**Recommendation: Warm Standby**, primary in **Mumbai (ap-south-1)**, secondary in **Hyderabad (ap-south-2)** for data residency, with **Singapore (ap-southeast-1)** as an alternative if a wider blast radius is required.

### 24.3 DR Architecture Components

1. **DNS-level failover** — Route 53 health checks on the primary ALB; automatic (or one-click manual) failover of the application hostname to the standby region's ALB.
2. **Standby application tier** — ECS Fargate service in the secondary region running a minimal task count (1 web task, worker at zero) from the same container image, scaled out on failover via auto-scaling policy.
3. **Cross-region container registry replication** — ECR replication so the exact production image is already present in the DR region.
4. **Static assets & documents** — S3 **Cross-Region Replication (CRR)** for the document/asset bucket; CloudFront configured with an origin group (primary origin + failover origin) so static delivery survives a region loss with no DNS change.
5. **Database** — strategy depends on the database selected after load testing:
   - **Supabase / PostgreSQL:** Supabase **Point-in-Time Recovery** plus scheduled logical dumps shipped to a locked S3 bucket in the DR region (lower cost), or a **continuously replicated read replica / logical replication target** in the DR region promoted to primary on failover (lower RPO, higher cost).
   - **MongoDB Atlas:** **Atlas cross-region replication** to a secondary node in Hyderabad (or Singapore), with automated cloud backups and snapshot export to a locked S3 bucket. On failover, the secondary region is promoted to primary through Atlas tooling.
6. **Secrets & configuration** — AWS Secrets Manager multi-region secret replication so credentials exist in the DR region.
7. **Infrastructure as Code** — the entire stack defined in Terraform/CDK so the standby is provably identical and can be re-created on demand.
8. **Immutable backup vault** — AWS Backup with **Vault Lock (compliance mode)** in a separate AWS account: backups cannot be deleted or shortened by any operator, including a compromised administrator. This is the primary ransomware defence.

### 24.4 DR Process (Runbook)

**Detection**
1. CloudWatch alarms and Route 53 health checks fire on sustained failure of the primary region (ALB 5xx, health-check failure, database unreachable).
2. On-call is paged; incident severity classified (P1 = region loss / data corruption).

**Declaration**
3. Nominated authority (client IT head + vendor lead) formally declares a disaster. Declaration is logged with timestamp and reason.

**Failover**
4. Promote the DR database (replica promotion or restore from latest PITR / immutable snapshot).
5. Scale the standby ECS service to production task counts; start the worker service.
6. Point the application hostname to the DR ALB via Route 53 failover record.
7. Verify S3/CloudFront origin failover is serving assets.
8. Smoke-test: login, attendance mark, payroll read, invoice read, notification dispatch.
9. Communicate to users (in-app banner, WhatsApp/email broadcast) with expected data-loss window.

**Operate in DR**
10. Run in the DR region with monitoring; backups continue from the DR region.

**Failback**
11. Re-establish the primary region; replicate data back from DR to primary.
12. Schedule a low-traffic cutover window (typically a Sunday night, outside the 26th–25th payroll close).
13. Reverse replication direction, switch DNS back, verify, and close the incident.

**Post-incident**
14. Root-cause analysis document, corrective actions, and runbook update within 10 working days.

### 24.5 Ransomware-Specific Recovery

- **Immutable, air-gapped backups** in a separate AWS account with Vault Lock — cannot be encrypted or deleted by an attacker holding production credentials.
- **S3 Object Lock + Versioning + MFA Delete** on document buckets; every prior version recoverable.
- **Point-in-time restore** to a timestamp immediately before the first malicious write, identified from the append-only system activity log.
- **Clean-room restore**: recovery into a freshly provisioned account/VPC from IaC, never back into the compromised environment.
- **Credential rotation** of all secrets, API keys and service accounts as part of recovery.

### 24.6 DR Testing & Governance

| Activity | Frequency |
|---|---|
| Backup restore verification (automated) | Weekly |
| Tabletop DR walkthrough | Quarterly |
| Full failover drill (non-production traffic) | Half-yearly |
| Full failover drill including production cutover | Annually (optional, on actuals) |
| Runbook review and contact-list refresh | Quarterly |

Each drill produces a signed report recording measured RTO/RPO against target.

### 24.7 DR Cost — Component by Component (DR ONLY)

Everything below is **DR-only incremental cost**. It excludes the base production hosting in Section 23 entirely. Assumptions: secondary region **ap-south-2 (Hyderabad)**, warm-standby posture, **1 USD = INR 90**, ~730 hours per month, ~250 GB of documents/assets replicated, ~120 GB of database + backup data, ~150 GB per month of cross-region replication traffic.

#### A. Standby compute & networking

| # | Component | Unit rate (Mumbai/Hyderabad, USD) | Sizing assumed | INR / month |
|---|---|---|---|---|
| 1 | ECS Fargate standby web task | $0.04656 per vCPU-hr, $0.00511 per GB-hr | 1 task, 0.5 vCPU + 1 GB, 24x7 (~$20/mo) | **1,700 – 2,000** |
| 2 | ECS Fargate scale-out headroom (pre-warmed second task during business hours) | same as above | 1 extra task, 12 hrs/day | **900 – 1,200** |
| 3 | Application Load Balancer (standby) | $0.0225 per ALB-hr (~$16.4/mo) + LCU $0.008/hr | 1 ALB, low LCU | **1,700 – 2,600** |
| 4 | NAT Gateway (standby VPC) | $0.056 per NAT-hr (~$41/mo) + $0.056 per GB processed | 1 NAT (2 NATs if 2-AZ DR) | **3,700 – 5,000** |
| 5 | Public IPv4 addresses | $0.005 per IP-hr = **INR ~325 per IP / month** | 2 – 3 IPs (ALB/NAT) | **650 – 975** |
| 6 | VPC, security groups, route tables | No charge | — | **0** |
| | **Sub-total A** | | | **8,650 – 11,775** |

#### B. Data replication & storage

| # | Component | Unit rate (USD) | Sizing assumed | INR / month |
|---|---|---|---|---|
| 7 | S3 storage in DR region (replicated copy of documents/assets) | $0.025 per GB-month (S3 Standard, Hyderabad) | 250 GB | **560 – 900** |
| 8 | S3 Cross-Region Replication — replication PUT requests | $0.005 per 1,000 PUTs | ~300k objects/month | **135 – 300** |
| 9 | Cross-region data transfer (S3 CRR + app replication egress) | $0.086 per GB inter-region | ~150 GB/month | **1,160 – 3,000** |
| 10 | Database replication target / cross-region PITR (Supabase read replica add-on **or** self-managed logical replica on RDS) | Supabase read replica add-on from ~$100/mo; or db.t4g.medium replica ~$0.096/hr + storage | 1 replica + 120 GB storage | **6,500 – 14,000** |
| 11 | Scheduled logical dumps to locked S3 bucket in DR region | S3 storage + PUT | 120 GB retained | **300 – 700** |
| 12 | AWS Backup — cross-region + cross-account copies with Vault Lock | $0.05 per GB-month warm backup + $0.086/GB copy transfer | 120 GB + monthly copies | **1,100 – 2,600** |
| 13 | ECR cross-region image replication | $0.10 per GB-month + transfer | ~10 GB of images | **200 – 500** |
| | **Sub-total B** | | | **9,955 – 22,000** |

#### C. Failover control, monitoring & drills

| # | Component | Unit rate (USD) | Sizing assumed | INR / month |
|---|---|---|---|---|
| 14 | Route 53 health checks | $0.50 per basic health check, $1.00 with HTTPS/string match | 3 – 5 checks | **200 – 500** |
| 15 | Route 53 failover records + DNS queries | $0.50 per hosted zone + $0.40 per million queries | 1 zone, low volume | **100 – 250** |
| 16 | CloudWatch in DR region (logs, metrics, alarms) | $0.57 per GB ingested, $0.10 per alarm | ~10 GB + 20 alarms | **700 – 1,600** |
| 17 | CloudWatch Synthetics canary probing the DR stack | $0.0012 per canary run | 1 canary every 5 min | **500 – 900** |
| 18 | Secrets Manager multi-region secret replication | $0.40 per secret-month per region | 8 – 12 secrets | **300 – 500** |
| 19 | AWS Config + drift detection in DR region | $0.003 per configuration item | Small footprint | **300 – 800** |
| | **Sub-total C** | | | **2,100 – 4,550** |

#### D. DR total (recurring)

| Bucket | INR / month |
|---|---|
| A. Standby compute & networking | 8,650 – 11,775 |
| B. Data replication & storage | 9,955 – 22,000 |
| C. Failover control, monitoring & drills | 2,100 – 4,550 |
| **Total DR-only recurring cost** | **INR ~20,700 – 38,300 per month** |
| Budget figure to quote (with 15% buffer) | **INR 25,000 – 45,000 per month** |

#### E. DR one-time and periodic cost

| Item | Basis | Indicative cost |
|---|---|---|
| DR build-out: Terraform/CDK for the secondary region, replication setup, failover automation, runbook authoring | 3 – 5 person-weeks | **On actuals at agreed rate card** |
| First validated failover drill with signed RTO/RPO report | Included in build-out | — |
| Half-yearly failover drill | ~3 – 5 person-days each | **On actuals** |
| Quarterly tabletop walkthrough | ~1 person-day each | **On actuals** |
| Failover event itself (DR region running at full production size) | Duration of the incident only | Approx. **INR 700 – 1,200 per day** additional while scaled up |

#### F. Cheaper DR option — Backup & Restore (no standby running)

| Component | INR / month |
|---|---|
| Cross-region immutable backups (AWS Backup + Vault Lock) | 3,000 – 6,000 |
| S3 CRR storage + replication traffic | 1,900 – 4,200 |
| Database dumps shipped cross-region | 1,500 – 3,000 |
| ECR replication + Route 53 health checks + minimal monitoring | 700 – 1,500 |
| **Total** | **INR ~7,100 – 14,700 per month** |
| Trade-off | RTO 4 – 12 hours, RPO up to 24 hours (vs 30 – 120 min / 5 – 15 min for warm standby) |

#### G. WAF, Shield and related protection — DR-adjacent, priced separately

These are **not part of the DR delta above** and are **not part of the base price**. They are listed here with real unit rates because they are usually bought at the same time as DR.

| # | Control | Unit rate (USD) | Sizing assumed | INR / month |
|---|---|---|---|---|
| 1 | **AWS Shield Standard** (automatic L3/L4 DDoS protection on CloudFront, ALB, Route 53) | **Free** | Always on | **0** |
| 2 | **AWS WAF** — Web ACL | $5.00 per Web ACL / month | 1 ACL (2 if DR region also protected) | **450 – 900** |
| 3 | **AWS WAF** — rules | $1.00 per rule / month | 8 – 12 rules | **720 – 1,080** |
| 4 | **AWS WAF** — request charges | $0.60 per million requests | 5 – 20 M requests/month | **270 – 1,080** |
| 5 | **AWS Managed Rule Groups** (OWASP Top 10 / SQLi / bad inputs) | Most $0 – $1.00 per group / month | 3 – 4 groups | **0 – 360** |
| 6 | **WAF Bot Control** (managed rule group) | $10 per month + $1.00 per million requests inspected | 5 – 20 M requests | **1,350 – 2,700** |
| 7 | **WAF Rate-based rules** (login/OTP brute-force protection) | Counted as a standard rule | 2 – 3 rules | **180 – 270** |
| 8 | **WAF Fraud Control / Account Takeover Prevention** (optional, protects the login endpoint) | $10 per month + $1.00 per 1,000 login attempts inspected | ~200k logins/month | **On actuals, typically 900 – 18,000** |
| 9 | **WAF logging to S3 / CloudWatch** | Storage + ingestion | ~20 GB/month | **500 – 1,200** |
| | **WAF subtotal (typical, without Fraud Control)** | | | **INR ~3,500 – 7,500 per month** |
| 10 | **AWS Shield Advanced** | **USD 3,000 per month per organisation** (12-month commitment) + data-transfer-out fees; includes DDoS Response Team and DDoS cost protection | Enterprise DDoS mandate only | **INR ~2,70,000 per month** |

**Recommendation on DDoS:** Shield **Standard** (free) plus **CloudFront + WAF with rate-based rules** is the correct posture for this workload — roughly **INR 3,500 – 7,500 per month**. Shield **Advanced** at INR ~2.7 lakh per month is only justified if the client's own security policy or a regulator contractually mandates it; we do not recommend it at this scale.

#### H. What the client actually pays for DR — single view

| Line | INR / month |
|---|---|
| DR infrastructure (warm standby) | **20,700 – 38,300** (quote 25,000 – 45,000) |
| — or — DR infrastructure (backup & restore) | **7,100 – 14,700** |
| WAF + Shield Standard (recommended add-on) | **3,500 – 7,500** |
| Shield Advanced (only if mandated) | **2,70,000** |
| DR build-out, drills, failover events | On actuals |

All AWS/vendor charges are passed through at actual invoice value with no margin. Rates are AWS ap-south-1/ap-south-2 list prices as of the proposal date and are subject to AWS revision and INR/USD movement.


---

## 25. Additional Security Hardening (Not Included — On Actuals)

The base engagement already includes: TLS 1.2/1.3 in transit, encryption at rest, Row-Level Security on every table, role-based access control, append-only system activity logs, private-subnet application containers, secrets in AWS Secrets Manager, and biometric/device-bound mobile authentication.

The controls below are **security enhancements that are explicitly NOT included in the base price**. Each can be enabled on request and is **billed on actuals** (AWS/vendor usage charges) plus a small one-time configuration effort.

### 25.1 Perimeter & Application Protection

| # | Control | What it protects against | Indicative additional INR / month |
|---|---|---|---|
| 1 | **AWS WAF** with AWS Managed Rules (OWASP Top 10, SQL injection, XSS, bad inputs) | Web exploitation of the application layer | **900 – 2,500** |
| 2 | **WAF Bot Control + Rate-based rules** | Credential stuffing, scraping, brute-force on login/OTP | **1,500 – 4,000** |
| 3 | **AWS Shield Advanced** (optional, enterprise DDoS) | Large-scale volumetric and application DDoS, with DDoS cost protection and 24x7 response team | **~USD 3,000 / month (~INR 2,70,000)** — recommended only if contractually mandated |
| 4 | **CloudFront geo-restriction + origin shield** | Traffic from out-of-scope geographies, origin overload | **500 – 1,500** |

### 25.2 Ransomware & Data Integrity Defence

| # | Control | What it protects against | Indicative additional INR / month |
|---|---|---|---|
| 5 | **AWS Backup Vault Lock (compliance mode) in a separate, isolated AWS account** | Backup deletion/encryption by a compromised admin — the single most important ransomware control | **3,000 – 7,000** |
| 6 | **S3 Object Lock + Versioning + MFA Delete** on document and export buckets | Malicious or accidental overwrite/deletion of KYC documents, payslips, invoices | **1,000 – 3,000** |
| 7 | **Amazon GuardDuty** (threat detection incl. Malware Protection and S3 protection) | Credential misuse, crypto-mining, anomalous API activity, malicious uploads | **2,500 – 7,000** |
| 8 | **Amazon Inspector** (continuous container image & workload vulnerability scanning) | Vulnerable dependencies and OS packages shipped in container images | **1,500 – 4,000** |
| 9 | **Clean-room recovery environment** (pre-built isolated account + IaC for restore after compromise) | Re-infection when restoring into a compromised environment | One-time setup + **1,000 – 2,500** standby |
| 10 | **Anti-malware scanning of user uploads** (documents, KYC photos) before storage | Malicious files entering the document store | **2,000 – 5,000** (volume-based) |

### 25.3 Detection, Audit & Governance

| # | Control | What it protects against | Indicative additional INR / month |
|---|---|---|---|
| 11 | **AWS CloudTrail organisation trail with log-file validation, to a locked S3 bucket** | Tampering with the audit trail; loss of forensic evidence | **1,000 – 3,000** |
| 12 | **AWS Security Hub + AWS Config conformance packs** (CIS / PCI-aligned) | Configuration drift, non-compliant resources | **2,000 – 6,000** |
| 13 | **Centralised SIEM / log analytics with alerting** (OpenSearch or third-party) | Slow detection of an in-progress attack | **6,000 – 20,000** |
| 14 | **24x7 managed SOC / incident response retainer** (third party) | No out-of-hours human response | **On quotation** |

### 25.4 Identity & Access Hardening

| # | Control | What it protects against | Indicative additional cost |
|---|---|---|---|
| 15 | **Mandatory TOTP / passkey MFA for HR, Finance, Admin and Leadership roles** | Account takeover of high-privilege users | Implementation effort only; no recurring AWS cost |
| 16 | **Hardware FIDO2 security keys for infrastructure administrators** | Phishing of cloud admin credentials | **One-time INR ~5,000 – 9,000 per key** |
| 17 | **Just-in-time privileged access with approval workflow and session recording** | Standing admin privileges being abused | **Effort + INR 2,000 – 6,000 / month** |
| 18 | **IP allow-listing / private access for admin console** | Admin access from untrusted networks | Effort only |

### 25.5 Assurance Activities (One-Time / Periodic, On Actuals)

| # | Activity | Frequency | Indicative cost |
|---|---|---|---|
| 19 | **Third-party VAPT** (web + mobile + API) with remediation retest | Annual or pre-go-live | **INR 1,50,000 – 4,00,000 per cycle** |
| 20 | **Source-code security review / SAST tooling licence** | Continuous | **On quotation** |
| 21 | **DPDP Act readiness / data-protection audit** | Annual | **On quotation** |
| 22 | **Security awareness training for HR/Finance users** | Annual | **On quotation** |

### 25.6 Commercial Summary

| Bucket | Status |
|---|---|
| Base hosting & platform security (Section 23) | **Included** — INR 25,000 – 35,000 / month AWS + USD 25 – 150 / month backend |
| **Disaster Recovery (Section 24)** | **Not included — on actuals.** Warm standby: **INR 25,000 – 45,000 / month** delta + one-time 3 – 5 person-weeks setup. Backup & Restore alternative: **INR 8,000 – 15,000 / month** |
| **Additional security hardening (Section 25)** | **Not included — on actuals.** Recommended starter bundle (WAF + rate limiting + Vault Lock + GuardDuty + CloudTrail lock + Object Lock): **INR ~10,000 – 25,000 / month** |
| Shield Advanced, managed SOC, VAPT, SIEM | **Not included — on quotation / actuals** |

All "on actuals" items are passed through at the actual AWS/vendor invoice value with no margin, plus the agreed implementation effort. Nothing in Sections 24 and 25 is enabled without prior written approval from the client.

---

## 26. Change Management Plan

A structured change-management process keeps the platform stable while new features, fixes and statutory updates are rolled out to ~7,000 users across web and native mobile.

### 26.1 Release Cadence — 45-Day Maintenance Cycle

| Phase | Duration | Calendar position | Purpose |
|---|---|---|---|
| **Sprint** | 30 days | Day 1 – Day 30 | Feature development, bug fixes, statutory/config changes, backlog grooming |
| **QA & Staging** | 14 days | Day 31 – Day 44 | Functional, regression, security and mobile-app store testing; UAT sign-off |
| **Production deployment + maintenance** | 1 day | Day 45 | Release to production, instance maintenance, post-release monitoring |
| **Next cycle begins** | — | Day 46 | New sprint planning with the prioritized change board |

**Key rule:** every **45th day** is treated as a scheduled maintenance window. Production deployments happen on this day, not ad-hoc, unless a critical security or business-continuity fix is required.

### 26.2 Change Request Process

1. **Intake** — Business user / client sponsor logs a change request (CR) via email or the agreed support channel.
2. **Triage** — Product owner and tech lead classify the CR as:
   - **Standard** — fits the next 45-day release cycle.
   - **Expedited** — security, compliance or revenue-impacting; may be hot-fixed outside the cycle.
   - **Deferred** — low priority or out of scope; parked for a future cycle.
3. **Impact assessment** — Effort, dependencies, affected modules (payroll, attendance, mobile app, etc.), regression risk and data-migration needs are documented.
4. **Approval** — Client approves scope, effort and any cost impact before development begins.
5. **Build & QA** — Changes are built in the 30-day sprint and hardened in the 14-day QA window.
6. **Release note & communication** — A release note is shared at least 48 hours before Day 45, listing what is changing, who is affected and any action required.
7. **Deploy & validate** — Production release on Day 45, followed by smoke tests and a 24-hour watch period.
8. **Retro** — Sprint retrospective captures what went well, incidents and improvements for the next cycle.

### 26.3 Environment Strategy

| Environment | Purpose | Who accesses |
|---|---|---|
| **Development** | Active feature work | Internal engineering team |
| **Staging / UAT** | Pre-release QA and client acceptance | QA, product owner, client business users |
| **Production** | Live users | All end-users |

No code reaches production without passing staging UAT. Mobile app binaries are submitted to App Store / Play Console during the QA phase so they are ready for release on Day 45.

### 26.4 Communication & Training

- **Release notes** — published before every Day-45 release.
- **In-app banners** — used for high-impact changes (e.g., attendance workflow changes, new statutory deductions).
- **Training sessions** — conducted for major modules (payroll, attendance, Radar) when the UX changes significantly.
- **Admin guides** — updated in the shared documentation repository with every release.
- **Rollback plan** — every release has a documented rollback procedure and a database snapshot taken before deployment.

### 26.5 Emergency Change Protocol

For critical production defects (payroll incorrect, attendance data corruption, auth failure, mobile crash):
- A hot-fix branch is created immediately.
- Fix is peer-reviewed and smoke-tested on staging.
- Client is notified before and after deployment.
- Post-incident report is shared within 48 hours.

---

## 27. Support Plan

A multi-channel support model is provided for end-users, field officers, HR, finance, operations and leadership.

### 27.1 Support Channels

| Channel | How to reach | Best for |
|---|---|---|
| **Email support** | `support@radiantworkforce.in` (example; actual address configured at go-live) | Detailed issues, attachments (screenshots, payslip queries, document uploads), non-urgent requests |
| **WhatsApp support** | Dedicated WhatsApp business number | Quick queries, screenshots, field officer issues, attendance/punch problems |
| **SMS support** | Short-code / long-code SMS helpline | Users with no data connectivity; used for ticket creation and status updates |

All channels feed into a single ticketing system so nothing is lost, and every request gets a ticket number for tracking.

### 27.2 Support Hours

| Tier | Hours | Coverage |
|---|---|---|
| **Standard support** | Monday – Saturday, 09:00 – 19:00 IST | General queries, functional help, minor bugs |
| **Extended support** | Monday – Saturday, 07:00 – 22:00 IST | Payroll window days, month-end attendance closure, invoice generation periods |
| **Critical / on-call** | 24 x 7 | Production downtime, data corruption, security incidents, auth failure, mobile app crash affecting attendance |

### 27.3 Severity Levels & Response Targets

| Severity | Definition | First response | Resolution target |
|---|---|---|---|
| **P1 — Critical** | Production down, payroll blocked, mass attendance failure, data breach / auth compromise | 30 minutes | 4 hours |
| **P2 — High** | Major feature broken, invoice/payslip incorrect for a unit, mobile app crash on key workflow | 2 hours | 1 business day |
| **P3 — Medium** | Non-critical bug, report formatting issue, minor UI defect, how-to question | 4 hours | 3 business days |
| **P4 — Low** | Cosmetic issue, enhancement request, documentation update | 1 business day | Next 45-day release cycle |

### 27.4 Escalation Path

1. **L1 Support** — triage, basic how-to, password/reset help, ticket creation.
2. **L2 Support / Product Team** — functional bugs, configuration issues, payroll/attendance, data fixes.
3. **L3 Engineering** — code defects, database issues, mobile app crashes, integrations.
4. **Client Success / Account Manager** — commercial, scope or SLA disputes.

Escalation is automatic if a P1/P2 ticket is not acknowledged within the target time.

### 27.5 Maintenance Windows

- **Scheduled maintenance** happens every **45th day** as part of the release cycle.
- Maintenance windows are communicated at least **72 hours in advance** via email, WhatsApp and in-app banner.
- During maintenance, the web console may be in read-only mode; mobile attendance is queued locally and synced once service resumes.
- **Emergency maintenance** (security patch, critical hot-fix) is communicated as soon as it is scheduled.

### 27.6 What Is Covered vs. What Is Billable

| Item | Coverage |
|---|---|
| Bugs/defects in delivered scope | Included |
| How-to training and name/code changes, report formatting tweaks | Included (P3/P4) |
| New modules, major workflow changes, third-party integration changes | Billable / scoped as a new CR |
| Additional support hours beyond agreed SLA window | Billable on actuals |
| Data recovery due to client-induced deletion | Billable on actuals |

### 27.7 Reporting

A monthly support report is shared with the client containing:
- Ticket volume by channel (email, WhatsApp, SMS).
- Ticket volume by severity and module.
- Average first-response and resolution times.
- Top recurring issues and preventive actions planned.
- Upcoming release and maintenance schedule.

---
