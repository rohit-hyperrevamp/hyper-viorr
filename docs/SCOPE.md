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

## 23. Hosting Architecture & Infrastructure Cost (AWS + Supabase)

The platform is deployed on a hybrid model: **AWS (Mumbai, ap-south-1)** hosts the application tier and static/CDN delivery, while **Supabase** provides the managed PostgreSQL backend, authentication, storage and realtime layer. This split keeps the stack production-grade and horizontally scalable without the cost and operational overhead of self-managing a database cluster.

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
| Backend data | **Supabase (managed PostgreSQL)** | Primary transactional database with Row-Level Security, PostgREST Data API, Auth (JWT/OTP/biometric session), Storage buckets, Realtime channels and scheduled `pg_cron` jobs |

### 23.2 Component Descriptions

- **Amazon CloudFront** — Content delivery network sitting in front of S3 and the ALB. Caches static assets at Indian edge locations for fast first paint on low-bandwidth field devices, serves everything over HTTPS, and shields the origin from traffic spikes and volumetric attacks.
- **Amazon S3** — Object storage for the compiled front-end bundle, images, generated PDFs (payslips, invoices, posting orders, FORM VII) and export files. Versioning and lifecycle rules retain historical artefacts; server-side encryption (SSE-KMS) is enabled by default.
- **AWS Fargate (ECS)** — Serverless container runtime for the application server: SSR rendering, server functions, payroll/invoice computation endpoints and integration connectors. Tasks scale out automatically on CPU/request count during morning attendance peaks and payroll windows, and scale back down at night, so cost tracks real usage rather than provisioned capacity.
- **Application Load Balancer** — Terminates TLS, distributes traffic across healthy Fargate tasks across two Availability Zones, and provides automatic failover if a task or AZ becomes unhealthy.
- **VPC & private networking** — Application containers have no public IP. Outbound calls (Supabase, bank APIs, WhatsApp, Gemini) route through a NAT gateway; inbound traffic arrives only through the ALB.
- **AWS Secrets Manager** — Central store for all credentials with rotation support. No secret is committed to the repository or baked into an image.
- **CloudWatch** — Centralised logging and metrics with alarms on 5xx rate, task health, latency and auto-scaling events; log retention configured for audit needs.
- **Supabase PostgreSQL** — The system of record for all employees, units, contracts, attendance, payroll, invoicing, inventory, assets and compliance data. Row-Level Security enforces branch/unit/role scoping at the database layer, so access rules cannot be bypassed by the client. Point-in-time recovery and daily backups are enabled on the paid plan.
- **Supabase Auth** — Handles user identity, JWT issuance, session refresh, OTP flows and integration with device biometrics (Face ID / fingerprint) on the mobile apps.
- **Supabase Storage** — Bucketed file storage for KYC documents, photographs, uniform/asset images and signed attendance evidence, protected by the same RLS-driven access policies.
- **Supabase Realtime & pg_cron** — Powers live dashboards (Radar tracking, coverage tiles) and scheduled jobs such as annual GPAIP accrual, document-expiry alerts and daily attendance derivation.

### 23.3 Scalability Posture

- 7,000 registered users translate to a few hundred to low-thousand concurrent sessions at attendance and payroll peaks; the Fargate + Supabase combination absorbs this comfortably.
- Horizontal scaling is achieved by increasing Fargate task count (auto-scaling policy) and, on the data side, by moving up Supabase compute tiers and adding read replicas if reporting load grows.
- Long-running jobs (bulk payroll generation, invoice PDF batches, migration loaders) run on a separate worker service so they never block the interactive web API.

### 23.4 Infrastructure Cost (Included in Scope)

| Component | Plan / Sizing | Indicative Monthly Cost | Commercial Treatment |
|-----------|---------------|-------------------------|----------------------|
| **Supabase** | Paid plan (Pro tier and above, sized to load) | **USD 25 – USD 150 per month** | **Included** |
| **AWS (ECS Fargate + S3 + CloudFront + ALB + CloudWatch + supporting services)** | Mumbai region (ap-south-1), auto-scaled | **INR 25,000 – INR 35,000 per month** | **Included** |

- Both hosting costs above are **included** in the engagement; no separate infrastructure billing is raised for the ranges stated.
- The ranges reflect normal operating load for the stated user base. Sustained usage materially beyond this scope (significant increase in headcount, data volume, media storage or reporting concurrency) would be reviewed jointly before any revision.
- Third-party usage charges described in Section 21 (Aadhaar verification, WhatsApp messaging, SMS/email beyond free tiers, bank/GST/Tally API fees) are separate from these hosting costs.

---
