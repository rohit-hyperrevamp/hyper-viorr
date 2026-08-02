import { supabase } from "@/integrations/supabase/client";
import { notifyAdmins } from "@/lib/notifications";

// Module → in-app link map for notifications.
const MODULE_LINKS: Record<string, string> = {
  "Employees": "/admin/employees",
  "Client Contracts": "/admin/contracts/client-contracts",
  "Contract Resources": "/admin/contracts/client-contracts",
  "Customer Manager": "/admin/customers/customer-manager",
  "Branch Manager": "/admin/customers/branch-manager",
  "Unit Manager": "/admin/customers/unit-manager",
  "State Manager": "/admin/customers/state-manager",
  "Designation Manager": "/admin/designation-manager",
  "Asset Manager": "/admin/asset-manager",
  "Duty Manager": "/admin/duty-manager",
  "Allowance Manager": "/admin/allowance-manager",
  "Billing Type Manager": "/admin/billing-type-manager",
  "Cost Component Manager": "/admin/cost-component-manager",
  "Company Documents": "/admin/company-documents",
  "ESIC Branch Manager": "/admin/esic-branch-manager",
  "Ex-Service Manager": "/admin/ex-service-manager",
  "Language Manager": "/admin/language-manager",
  "LWF Manager": "/admin/lwf-manager",
  "Offboarding Reason Manager": "/admin/offboarding-reason-manager",
  "Offboarding Reasons": "/admin/offboarding-reason-manager",
  "Payroll Manager": "/admin/payroll-manager",
  "Payroll Days Manager": "/admin/payroll-days-manager",
  "Professional Tax Manager": "/admin/professional-tax-manager",
  "RBAC": "/admin/rbac",
  "Role-Based Access Control": "/admin/rbac",
  "Roles Manager": "/admin/roles-manager",
  "Service Type Manager": "/admin/service-type-manager",
  "Candidate Details": "/admin/employees",
  "Vehicle Inventory": "/admin/vehicles/inventory",
  "FastTag Manager": "/admin/vehicles/fastags",
  "Vehicle Insurance Manager": "/admin/vehicles/insurances",
  "Vehicle PUC Manager": "/admin/vehicles/pucs",
  "Service Manager": "/admin/vehicles/service-manager",
  "Expense Manager": "/admin/vehicles/expense-manager",
  // Attendance / payroll
  "Attendance": "/admin/attendance",
  "Attendance Code Manager": "/admin/attendance-code-manager",
  "Payroll": "/admin/payroll",
  // Additions / deductions
  "Additions": "/admin/additions",
  "Addition Type Manager": "/admin/addition-type-manager",
  "Deductions": "/admin/deductions",
  "Deduction Type Manager": "/admin/deduction-type-manager",
  // Uniform / inventory
  "Inventory Items": "/admin/inventory/items",
  "Inventory Warehouses": "/admin/inventory/warehouses",
  "Inventory Vendors": "/admin/inventory/vendors",
  "Inventory Purchase Orders": "/admin/inventory/purchase-orders",
  "Inventory Delivery Challans": "/admin/inventory/goods-receipts",
  "Inventory Goods Receipts": "/admin/inventory/goods-receipts",
  "Inventory Demands": "/admin/inventory/demands",
  "Inventory Issuances": "/admin/inventory/issuances",
  "Inventory Transfers": "/admin/inventory/transfers",
  "Inventory Collections": "/admin/inventory/collections",
  "Inventory Caps": "/admin/inventory/caps",
  "Vendor Rate Cards": "/admin/inventory/rate-cards",
  // Organization / misc
  "Organization Manager": "/admin/org-settings",
  "My Profile": "/admin/profile",
};

// entity_type → link map, used when MODULE_LINKS doesn't resolve.
const ENTITY_LINKS: Record<string, string> = {
  candidate: "/admin/employees",
  employee: "/admin/employees",
  attendance_sheets: "/admin/attendance",
  payroll_runs: "/admin/payroll",
  client_contracts: "/admin/contracts/client-contracts",
  units: "/admin/customers/unit-manager",
  customers: "/admin/customers/customer-manager",
  branches: "/admin/customers/branch-manager",
  inventory_items: "/admin/inventory/items",
  inventory_demands: "/admin/inventory/demands",
  inventory_issuances: "/admin/inventory/issuances",
  inventory_transfers: "/admin/inventory/transfers",
  inventory_collections: "/admin/inventory/collections",
  inventory_purchase_orders: "/admin/inventory/purchase-orders",
  inventory_goods_receipts: "/admin/inventory/goods-receipts",
  inventory_warehouses: "/admin/inventory/warehouses",
  inventory_vendors: "/admin/inventory/vendors",
  vendor_rate_cards: "/admin/inventory/rate-cards",
  vehicles: "/admin/vehicles/inventory",
  vehicle_insurance: "/admin/vehicles/insurances",
  vehicle_puc: "/admin/vehicles/pucs",
  vehicle_fastag: "/admin/vehicles/fastags",
  vehicle_service: "/admin/vehicles/service-manager",
  vehicle_expense: "/admin/vehicles/expense-manager",
};

// Actions that should NOT broadcast a notification (too noisy / internal).
const SILENT_ACTIONS = new Set([
  "login", "logout", "view", "open", "search", "filter", "export",
  "draft", "save_draft",
]);

function titleCase(s: string) {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const STORAGE_KEY = "radiant.auth";

let cachedIp: string | null = null;
let ipFetchPromise: Promise<string> | null = null;

export async function getClientIp(): Promise<string> {
  if (cachedIp) return cachedIp;
  if (ipFetchPromise) return ipFetchPromise;
  ipFetchPromise = fetch("https://api.ipify.org?format=json")
    .then((r) => r.json())
    .then((j: { ip?: string }) => {
      cachedIp = j.ip ?? "";
      return cachedIp;
    })
    .catch(() => "");
  return ipFetchPromise;
}

function readUser(): { phone: string; role: string } {
  if (typeof window === "undefined") return { phone: "", role: "" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { phone: "", role: "" };
    const u = JSON.parse(raw) as { phone?: string; role?: string };
    return { phone: u.phone ?? "", role: u.role ?? "" };
  } catch {
    return { phone: "", role: "" };
  }
}

export type LogParams = {
  module: string;
  action: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  status?: "success" | "failure";
  errorMessage?: string;
  details?: Record<string, unknown>;
  /** Snapshot before mutation — used to compute a field-level diff into details.changes */
  before?: Record<string, unknown> | null;
  /** Snapshot after mutation — used to compute a field-level diff into details.changes */
  after?: Record<string, unknown> | null;
  /** override actor (e.g. login flow) */
  userPhone?: string;
  userRole?: string;
  /** override IP if already known (avoids extra fetch) */
  ip?: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (isPlainObject(v)) {
    const keys = Object.keys(v).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

/** Compute a shallow diff of changed top-level fields between two objects. */
export function diffObjects(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  const a = before ?? {};
  const b = after ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (stableStringify(a[k]) !== stableStringify(b[k])) {
      out[k] = { from: a[k] ?? null, to: b[k] ?? null };
    }
  }
  return out;
}

export async function logActivity(p: LogParams): Promise<void> {
  try {
    const u = readUser();
    const phone = p.userPhone ?? u.phone;
    const role = p.userRole ?? u.role;
    const ip = p.ip ?? cachedIp ?? "";
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const { data: auth } = await supabase.auth.getUser();
    const details: Record<string, unknown> = { ...(p.details ?? {}) };
    if (p.before !== undefined || p.after !== undefined) {
      const changes = diffObjects(p.before ?? null, p.after ?? null);
      if (Object.keys(changes).length > 0) details.changes = changes;
      if (p.before !== undefined && details.before === undefined) details.before = p.before;
      if (p.after !== undefined && details.after === undefined) details.after = p.after;
    }
    await supabase.from("system_logs" as never).insert({
      module: p.module,
      action: p.action,
      entity_type: p.entityType ?? "",
      entity_id: p.entityId ?? "",
      entity_label: p.entityLabel ?? "",
      user_phone: phone,
      user_id: auth?.user?.id ?? null,
      user_role: role,
      ip_address: ip,
      user_agent: ua,
      status: p.status ?? "success",
      error_message: p.errorMessage ?? "",
      details,
    } as never);
    // Kick off IP resolution for next call if missing
    if (!cachedIp) void getClientIp();
    // Auto-broadcast a notification to admins for meaningful actions.
    if ((p.status ?? "success") === "success" && !SILENT_ACTIONS.has(p.action.toLowerCase())) {
      const link = MODULE_LINKS[p.module] ?? ENTITY_LINKS[p.entityType ?? ""] ?? "";
      const label = p.entityLabel || p.entityType || "record";
      const actionTitle = titleCase(p.action);
      await notifyAdmins({
        type: `${p.module}:${p.action}`.toLowerCase().replace(/\s+/g, "_"),
        title: `${p.module} — ${actionTitle}`,
        message: `${actionTitle} ${label}${phone ? ` by ${phone}` : ""}`,
        link,
        entityType: p.entityType ?? "",
        entityId: p.entityId ?? "",
      }).catch((err) => console.warn("notifyAdmins (auto) failed", err));
    }
  } catch (e) {
    // Logging must never break flows
    // eslint-disable-next-line no-console
    console.warn("logActivity failed", e);
  }
}

/** Convenience wrapper around an async mutation that auto-logs success/failure. */
export async function withLog<T>(
  params: Omit<LogParams, "status" | "errorMessage">,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const result = await fn();
    void logActivity({ ...params, status: "success" });
    return result;
  } catch (e) {
    void logActivity({
      ...params,
      status: "failure",
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
