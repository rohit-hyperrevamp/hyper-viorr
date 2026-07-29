// Single source of truth for the RBAC module/sub-module registry.
// Both the editor (admin.rbac.tsx) and any future enforcement helpers
// import from here so module keys stay consistent.

import {
  BadgeCheck,
  Bell,
  Boxes,
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  CalendarRange,
  Car,
  ClipboardList,
  Clock,
  Coins,
  CreditCard,
  FileSignature,
  FileText,
  Files,
  Fuel,
  HandCoins,
  LayoutDashboard,
  Languages,
  LogOut,
  MapPin,
  PackageOpen,
  Receipt,
  ReceiptText,
  Shield,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
  Warehouse,
  Wind,
  Wrench,
} from "lucide-react";

export type SubModuleDef = {
  key: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type ModuleDef = {
  key: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  subModules: SubModuleDef[];
};

export const RBAC_MODULES: ModuleDef[] = [
  {
    key: "organizations",
    label: "Organizations",
    path: "/admin/customers",
    icon: LayoutDashboard,
    subModules: [
      { key: "state_manager",        label: "State Manager",        path: "/admin/customers/state-manager",    icon: MapPin },
      { key: "branch_manager",       label: "Branch Manager",       path: "/admin/customers/branch-manager",   icon: Building2 },
      { key: "organization_manager", label: "Organization Manager", path: "/admin/customers/customer-manager", icon: Users },
      { key: "unit_manager",         label: "Unit Manager",         path: "/admin/customers/unit-manager",     icon: Warehouse },
    ],
  },
  {
    key: "contracts",
    label: "Contracts",
    path: "/admin/contracts/client-contracts",
    icon: Files,
    subModules: [
      { key: "client_contracts", label: "Client Contracts", path: "/admin/contracts/client-contracts", icon: FileText },
    ],
  },
  {
    key: "employees",
    label: "Employees",
    path: "/admin/employees",
    icon: UserPlus,
    subModules: [],
  },
  {
    key: "vehicles",
    label: "Vehicles",
    path: "/admin/vehicles",
    icon: Briefcase,
    subModules: [
      { key: "vehicle_inventory",  label: "Vehicle Inventory",   path: "/admin/vehicles/inventory",  icon: Briefcase },
      { key: "fastag_manager",     label: "FastTag Manager",     path: "/admin/vehicles/fastags",    icon: Briefcase },
      { key: "insurance_manager",  label: "Insurance Manager",   path: "/admin/vehicles/insurances", icon: ShieldCheck },
      { key: "puc_manager",        label: "PUC Manager",         path: "/admin/vehicles/pucs",       icon: Briefcase },
      { key: "service_manager",    label: "Service Manager",     path: "/admin/vehicles/service-manager", icon: Wrench },
      { key: "expense_manager",    label: "Expense Manager",     path: "/admin/vehicles/expense-manager", icon: Fuel },
    ],
  },
  {
    key: "assets",
    label: "Assets",
    path: "/admin/assets",
    icon: Building2,
    subModules: [
      { key: "asset_inventory", label: "Asset Inventory", path: "/admin/assets/inventory",        icon: Building2 },
      { key: "loan_manager",    label: "Loan Manager",    path: "/admin/assets/loan-manager",     icon: HandCoins },
      { key: "expense_manager", label: "Expense Manager", path: "/admin/assets/expense-manager",  icon: ReceiptText },
    ],
  },
  {
    key: "office_assets",
    label: "Office Assets",
    path: "/admin/office-assets",
    icon: Briefcase,
    subModules: [
      { key: "office_assets_dashboard",   label: "Dashboard",   path: "/admin/office-assets",             icon: LayoutDashboard },
      { key: "office_assets_inventory",   label: "Inventory",   path: "/admin/office-assets/inventory",   icon: Boxes },
      { key: "office_assets_allocations", label: "Allocations", path: "/admin/office-assets/allocations", icon: UserPlus },
      { key: "office_assets_categories",  label: "Categories",  path: "/admin/office-assets/categories",  icon: PackageOpen },
    ],
  },
  {
    key: "inventory",
    label: "Uniform Manager",
    path: "/admin/inventory",
    icon: Boxes,
    subModules: [
      { key: "inventory_dashboard", label: "Uniform Dashboard", path: "/admin/inventory/dashboard",       icon: LayoutDashboard },
      { key: "inventory_workflows", label: "Uniform Workflows", path: "/admin/inventory/workflows",       icon: Sparkles },
      { key: "item_master",       label: "Products",          path: "/admin/inventory/items",           icon: PackageOpen },
      { key: "vendors",           label: "Vendors",           path: "/admin/inventory/vendors",         icon: ShoppingBag },
      { key: "warehouses",        label: "Warehouses",        path: "/admin/inventory/warehouses",      icon: Warehouse },
      { key: "purchase_orders",   label: "Purchase Orders",   path: "/admin/inventory/purchase-orders", icon: FileText },
      { key: "goods_receipts",    label: "Delivery Challans", path: "/admin/inventory/goods-receipts",  icon: ClipboardList },
      { key: "demands",           label: "Demands",           path: "/admin/inventory/demands",         icon: ClipboardList },
      { key: "transfers",         label: "Transfers",         path: "/admin/inventory/transfers",       icon: Boxes },
      { key: "issuances",         label: "Issuances",         path: "/admin/inventory/issuances",       icon: UserPlus },
      { key: "collections",       label: "Collections",       path: "/admin/inventory/collections",     icon: UserPlus },
      { key: "inventory_caps",    label: "Uniform Caps",      path: "/admin/inventory/caps",            icon: ShieldCheck },
      { key: "my_inventory",      label: "My Uniform",        path: "/admin/my-inventory",              icon: PackageOpen },
      { key: "field_dashboard",   label: "Field Dashboard",   path: "/admin/field-dashboard",           icon: LayoutDashboard },

      { key: "stock_report",      label: "Stock Report",      path: "/admin/inventory/stock",           icon: Wallet },
      { key: "stock_ledger",      label: "Stock Ledger",      path: "/admin/inventory/stock-ledger",    icon: Wallet },
      { key: "rate_cards",        label: "Vendor Rate Cards", path: "/admin/inventory/rate-cards",      icon: FileText },
    ],

  },
  {
    key: "attendance",
    label: "Attendance",
    path: "/admin/attendance",
    icon: ClipboardList,
    subModules: [],
  },
  {
    key: "payroll",
    label: "Payroll",
    path: "/admin/payroll",
    icon: Wallet,
    subModules: [],
  },
  {
    key: "invoice",
    label: "Invoice",
    path: "/admin/invoice",
    icon: Receipt,
    subModules: [],
  },
  {
    key: "control_center",
    label: "Control Center",
    path: "/admin/control-center",
    icon: SlidersHorizontal,
    subModules: [
      { key: "professional_tax_manager", label: "Professional Tax Manager", path: "/admin/professional-tax-manager", icon: ReceiptText },
      { key: "lwf_manager",              label: "Labour Welfare Fund",      path: "/admin/lwf-manager",              icon: HandCoins },
      { key: "duty_manager",             label: "Duty Manager",             path: "/admin/duty-manager",             icon: Clock },
      { key: "attendance_code_manager",  label: "Attendance Code Manager",  path: "/admin/attendance-code-manager",  icon: CalendarDays },
      { key: "service_type_manager",     label: "Service Type Manager",     path: "/admin/service-type-manager",     icon: Briefcase },
      { key: "payroll_manager",          label: "Payroll Manager",          path: "/admin/payroll-manager",          icon: CalendarRange },
      { key: "payroll_days_manager",     label: "Payroll Days Manager",     path: "/admin/payroll-days-manager",     icon: CalendarDays },
      { key: "allowance_manager",        label: "Allowance Manager",        path: "/admin/allowance-manager",        icon: Coins },
      { key: "addition_type_manager",    label: "Addition Type Manager",    path: "/admin/addition-type-manager",    icon: HandCoins },
      { key: "deduction_type_manager",   label: "Deduction Type Manager",   path: "/admin/deduction-type-manager",   icon: HandCoins },
      { key: "billing_type_manager",     label: "Billing Type Manager",     path: "/admin/billing-type-manager",     icon: Receipt },
      { key: "designation_manager",      label: "Designation Manager",      path: "/admin/designation-manager",      icon: BadgeCheck },
      { key: "cost_component_manager",   label: "Cost Component Manager",   path: "/admin/cost-component-manager",   icon: Calculator },
      { key: "ex_service_manager",       label: "Ex-Service Manager",       path: "/admin/ex-service-manager",       icon: Shield },
      { key: "offboarding_reason_manager", label: "Offboarding Reason Manager", path: "/admin/offboarding-reason-manager", icon: LogOut },
      { key: "esic_branch_manager",      label: "ESIC Branch Manager",      path: "/admin/esic-branch-manager",      icon: Building2 },
      { key: "asset_manager",            label: "Asset Manager",            path: "/admin/asset-manager",            icon: PackageOpen },
      { key: "language_manager",         label: "Language Manager",         path: "/admin/language-manager",         icon: Languages },
      { key: "company_documents",        label: "Company Documents",        path: "/admin/company-documents",        icon: FileSignature },
      { key: "roles_manager",            label: "Roles Manager",            path: "/admin/roles-manager",            icon: ShieldCheck },
      { key: "system_logs",              label: "System Logs",              path: "/admin/system-logs",              icon: ClipboardList },

    ],
  },

  {
    key: "field_sense",
    label: "Radar",
    path: "/admin/field-sense",
    icon: MapPin,
    subModules: [
      { key: "dashboard",       label: "Dashboard",       path: "/admin/field-sense",          icon: LayoutDashboard },
      { key: "day_patrol",      label: "Day Patrol",      path: "/admin/field-sense/team",     icon: Users },
      { key: "expense_manager", label: "Expense Manager", path: "/admin/field-sense/expenses", icon: Wallet },
      { key: "reports",         label: "Reports",         path: "/admin/field-sense/reports",  icon: FileText },
    ],
  },
  {
    key: "notification_center",
    label: "Notification Center",
    path: "/admin/notifications",
    icon: Bell,
    subModules: [],
  },
  {
    key: "dashboard",
    label: "Dashboard",
    path: "/admin/dashboard",
    icon: LayoutDashboard,
    subModules: [],
  },
  {
    key: "my_attendance",
    label: "My Attendance",
    path: "/admin/my-attendance",
    icon: ClipboardList,
    subModules: [],
  },
  {
    key: "profile",
    label: "Profile",
    path: "/admin/profile",
    icon: BadgeCheck,
    subModules: [],
  },
  {
    key: "rbac",
    label: "Role-Based Access Control",
    path: "/admin/rbac",
    icon: ShieldCheck,
    subModules: [],
  },
];

export type PermissionAction = "view" | "edit" | "delete" | "approve";
export const PERMISSION_ACTIONS: PermissionAction[] = ["view", "edit", "delete", "approve"];

// Modules where the "approve" permission is meaningful. Add module keys here
// when introducing other approval-gated workflows (e.g. write-offs, payroll runs).
// Keep this list as the single source of truth — the RBAC editor reads it to
// decide which rows show the Approve checkbox, and runtime checks call
// `moduleSupportsApprove` before evaluating an approval permission.
export const APPROVE_CAPABLE_MODULES: ReadonlySet<string> = new Set(["contracts", "attendance", "payroll", "invoice", "employees", "control_center"]);

export function moduleSupportsApprove(moduleKey: string): boolean {
  return APPROVE_CAPABLE_MODULES.has(moduleKey);
}
