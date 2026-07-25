import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Bell,
  Building2,
  Boxes,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Wallet,
  FileText,
  Files,
  Fuel,
  Gauge,
  Home,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Car,
  CreditCard,
  MapPin,
  Menu,
  PackageOpen,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  UserPlus,
  Users,
  Warehouse,
  Wind,
  Wrench,
  X,
  Briefcase,
  Tag,
  UserCheck,
  Moon,
  Sun,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { MobileBottomNav, type BottomNavItem } from "@/components/MobileBottomNav";
import { useT } from "@/lib/i18n";
import { NotificationBell } from "@/components/NotificationBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";
import { useMe } from "@/lib/use-me";
import { useCurrentPermissions } from "@/lib/rbac";
import { RBAC_MODULES } from "@/lib/rbac-modules";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/lib/use-theme";
import { toast } from "sonner";



export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

type LeafItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  search?: Record<string, unknown>;
  sub?: string; // optional sub-module key for RBAC filtering
  adminOnly?: boolean; // only super admins & inventory managers
};

type GroupItem = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  module?: string;
  to?: string;
  children?: LeafItem[];
  activePrefixes?: string[];
  exact?: boolean;
};

const customersChildren: LeafItem[] = [
  { to: "/admin/customers/state-manager", label: "State Manager", icon: MapPin, sub: "state_manager" },
  { to: "/admin/customers/branch-manager", label: "Branch Manager", icon: Building2, sub: "branch_manager" },
  { to: "/admin/customers/customer-manager", label: "Organization Manager", icon: Users, sub: "organization_manager" },
  { to: "/admin/customers/unit-manager", label: "Unit Manager", icon: Warehouse, sub: "unit_manager" },
];

const contractsChildren: LeafItem[] = [
  { to: "/admin/contracts/client-contracts", label: "Client Contracts", icon: FileText, sub: "client_contracts" },
];

const vehiclesChildren: LeafItem[] = [
  { to: "/admin/vehicles/inventory", label: "Vehicle Inventory", icon: Car, sub: "vehicle_inventory" },
  { to: "/admin/vehicles/fastags", label: "FastTag Manager", icon: CreditCard, sub: "fastag_manager" },
  { to: "/admin/vehicles/insurances", label: "Insurance Manager", icon: ShieldCheck, sub: "insurance_manager" },
  { to: "/admin/vehicles/pucs", label: "PUC Manager", icon: Wind, sub: "puc_manager" },
  { to: "/admin/vehicles/service-manager", label: "Service Manager", icon: Wrench, sub: "service_manager" },
  { to: "/admin/vehicles/expense-manager", label: "Expense Manager", icon: Fuel, sub: "expense_manager" },
];

const assetsChildren: LeafItem[] = [
  { to: "/admin/assets/inventory", label: "Asset Inventory", icon: Home, sub: "asset_inventory" },
  { to: "/admin/assets/loan-manager", label: "Loan Manager", icon: Banknote, sub: "loan_manager" },
  { to: "/admin/assets/expense-manager", label: "Expense Manager", icon: Receipt, sub: "expense_manager" },
];

const officeAssetsChildren: LeafItem[] = [
  { to: "/admin/office-assets", label: "Dashboard", icon: LayoutDashboard, sub: "office_assets_dashboard" },
  { to: "/admin/office-assets/inventory", label: "Inventory", icon: Boxes, sub: "office_assets_inventory" },
  { to: "/admin/office-assets/allocations", label: "Allocations", icon: UserCheck, sub: "office_assets_allocations" },
  { to: "/admin/office-assets/categories", label: "Categories", icon: Tag, sub: "office_assets_categories" },
];

const inventoryChildren: LeafItem[] = [
  { to: "/admin/inventory", label: "Uniform Command Center", icon: LayoutDashboard },
  { to: "/admin/inventory/workflows", label: "Uniform Workflows", icon: Boxes },
  { to: "/admin/inventory/items", label: "Products", icon: PackageOpen, sub: "item_master" },
  { to: "/admin/inventory/vendors", label: "Vendors", icon: ShoppingBag, sub: "vendors" },
  { to: "/admin/inventory/warehouses", label: "Warehouses", icon: Warehouse, sub: "warehouses" },
  { to: "/admin/inventory/purchase-orders", label: "Purchase Orders", icon: FileText, sub: "purchase_orders" },
  { to: "/admin/inventory/demands", label: "Demands", icon: Inbox, sub: "demands" },
  { to: "/admin/inventory/goods-receipts", label: "Delivery Challans", icon: ClipboardList, sub: "goods_receipts" },
  { to: "/admin/inventory/transfers", label: "Transfers", icon: Boxes, sub: "transfers" },
  { to: "/admin/inventory/issuances", label: "Issuances", icon: UserPlus, sub: "issuances" },
  { to: "/admin/inventory/collections", label: "Collections", icon: Inbox, sub: "collections" },

  { to: "/admin/inventory/stock", label: "Stock Report", icon: Wallet, sub: "stock_report" },
  { to: "/admin/inventory/stock-ledger", label: "Stock Ledger", icon: Banknote, sub: "stock_ledger" },
  { to: "/admin/inventory/rate-cards", label: "Vendor Rate Cards", icon: FileText, sub: "rate_cards" },
  { to: "/admin/inventory/caps", label: "Uniform Cap", icon: Gauge, adminOnly: true },
];



const payrollChildren: LeafItem[] = [
  { to: "/admin/payroll", label: "Payroll Runs", icon: Wallet },
  { to: "/admin/additions", label: "Additions", icon: Wallet, search: { mode: "list" } },
  { to: "/admin/deductions", label: "Deductions", icon: Wallet, search: { mode: "list" } },
];

function maskPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  return `+91 ••• ••• ${d.slice(-4)}`;
}
// Derived path→(module,sub) map from the RBAC registry so any sub-module route
// can be gated by canSub without hand-maintaining a duplicate list.
const subPathList: { prefix: string; module: string; sub: string }[] = (() => {
  const list: { prefix: string; module: string; sub: string }[] = [];
  for (const m of RBAC_MODULES) {
    for (const s of m.subModules) {
      if (s.path) list.push({ prefix: s.path, module: m.key, sub: s.key });
    }
  }
  return list.sort((a, b) => b.prefix.length - a.prefix.length);
})();


function AdminLayout() {
  const navigate = useNavigate();
  const { user, logout, isReady } = useAuth();
  const me = useMe();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { can, canSub, isLoading: permsLoading, isSuperAdmin, roleKey } = useCurrentPermissions();
  // Frontline / FO-onboarded employees (guards, VMS/BMS operators, housekeeping,
  // drivers, etc.) — anyone who is not super admin, not a field officer, and
  // not on an admin-console role. They see only the employee dashboard,
  // their uniform, notifications and their own profile.
  // Users with NO role_key at all (freshly onboarded frontline staff) are
  // treated as frontline too — otherwise they'd land on the admin dashboard
  // with an empty sidebar.
  const ADMIN_CONSOLE_ROLES = new Set([
    "admin","super_admin","hr","leadership","branch_manager","branch_admin",
    "inventory_manager","inventory","accounts","finance","operations","field_officer",
  ]);
  const isGuardRole =
    !isSuperAdmin &&
    !permsLoading &&
    (!roleKey || !ADMIN_CONSOLE_ROLES.has(roleKey));
  const dashboardHref =
    isGuardRole
      ? "/admin/employee-dashboard"
      : roleKey === "field_officer" && !isSuperAdmin
        ? "/admin/field-dashboard"
        : "/admin/dashboard";


  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const { theme, toggle: toggleTheme, mounted: themeMounted } = useTheme();


  // One-time backfill of stored public URLs → signed URLs after buckets were privatized.
  useEffect(() => {
    if (!isSuperAdmin) return;
    const key = "radiant.backfill.signed-urls.v1";
    if (typeof window === "undefined" || window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "running");
    (async () => {
      try {
        const mod = await import("@/lib/backfill-signed-urls.functions");
        const res = await mod.backfillSignedUrls();
        window.localStorage.setItem(key, JSON.stringify({ done: true, at: Date.now(), res }));
        console.info("[backfill] signed URLs", res);
      } catch (e) {
        window.localStorage.removeItem(key);
        console.error("[backfill] failed", e);
      }
    })();
  }, [isSuperAdmin]);

  const pathToModule: { prefix: string; module: string }[] = [
    { prefix: "/admin/customers", module: "organizations" },
    { prefix: "/admin/contracts", module: "contracts" },
    { prefix: "/admin/employees", module: "employees" },
    { prefix: "/admin/deductions", module: "payroll" },
    { prefix: "/admin/additions", module: "payroll" },
    { prefix: "/admin/deduction-type-manager", module: "control_center" },
    { prefix: "/admin/addition-type-manager", module: "control_center" },
    { prefix: "/admin/vehicles", module: "vehicles" },
    { prefix: "/admin/assets", module: "assets" },
    { prefix: "/admin/office-assets", module: "office_assets" },
    { prefix: "/admin/inventory", module: "inventory" },
    { prefix: "/admin/attendance", module: "attendance" },
    { prefix: "/admin/payroll", module: "payroll" },
    { prefix: "/admin/invoice", module: "invoice" },
    { prefix: "/admin/rbac", module: "rbac" },
    { prefix: "/admin/control-center", module: "control_center" },
    { prefix: "/admin/professional-tax-manager", module: "control_center" },
    { prefix: "/admin/lwf-manager", module: "control_center" },
    { prefix: "/admin/duty-manager", module: "control_center" },
    { prefix: "/admin/service-type-manager", module: "control_center" },
    { prefix: "/admin/payroll-manager", module: "control_center" },
    { prefix: "/admin/payroll-days-manager", module: "control_center" },
    { prefix: "/admin/allowance-manager", module: "control_center" },
    { prefix: "/admin/billing-type-manager", module: "control_center" },
    { prefix: "/admin/designation-manager", module: "control_center" },
    { prefix: "/admin/cost-component-manager", module: "control_center" },
    { prefix: "/admin/ex-service-manager", module: "control_center" },
    { prefix: "/admin/offboarding-reason-manager", module: "control_center" },
    { prefix: "/admin/language-manager", module: "control_center" },
    { prefix: "/admin/company-documents", module: "control_center" },
    { prefix: "/admin/system-logs", module: "control_center" },
    { prefix: "/admin/asset-manager", module: "control_center" },
    { prefix: "/admin/attendance-code-manager", module: "control_center" },
    { prefix: "/admin/esic-branch-manager", module: "control_center" },
  ];
  const firstAllowedPath = () => {
    const order = [
      "organizations","contracts","employees","vehicles","assets","office_assets","inventory","attendance",
      "payroll","invoice","control_center","notification_center","rbac",
    ];
    const pathFor: Record<string, string> = {
      organizations: "/admin/customers",
      contracts: "/admin/contracts/client-contracts",
      employees: "/admin/employees",
      vehicles: "/admin/vehicles/inventory",
      assets: "/admin/assets/inventory",
      office_assets: "/admin/office-assets",
      inventory: "/admin/inventory",
      attendance: "/admin/attendance",
      payroll: "/admin/payroll",
      invoice: "/admin/invoice",
      control_center: "/admin/control-center",
      notification_center: "/admin/notifications",
      rbac: "/admin/rbac",
    };
    for (const m of order) if (can(m)) return pathFor[m];
    return null;
  };
  useEffect(() => {
    if (!isReady || permsLoading || !user) return;
    // Guards have no module-based permissions; restrict them to their personal pages.
    if (isGuardRole) {
      const allowed =
        pathname === "/admin/employee-dashboard" ||
        pathname === "/admin/my-inventory" ||
        pathname === "/admin/profile" ||
        pathname === "/admin/notifications" ||
        pathname.startsWith("/admin/my-inventory/") ||
        pathname.startsWith("/admin/notifications/");
      if (!allowed) navigate({ to: "/admin/employee-dashboard", replace: true });
      return;
    }
    // Field officers must never land on the Inventory Command Center hub.
    if (roleKey === "field_officer" && !isSuperAdmin) {
      if (pathname === "/admin/inventory" || pathname === "/admin/inventory/" || pathname.startsWith("/admin/inventory/dashboard")) {
        navigate({ to: "/admin/field-dashboard", replace: true });
        return;
      }
    }
    const hit = pathToModule.find((p) => pathname === p.prefix || pathname.startsWith(p.prefix + "/"));
    if (!hit) return;
    if (hit.module === "inventory" && roleKey === "field_officer" && pathname.startsWith("/admin/inventory/collections")) {
      return;
    }
    if (!can(hit.module)) {
      const dest = firstAllowedPath();
      if (dest) navigate({ to: dest, replace: true });
      else logout();
      return;
    }
    // Sub-module gating: enforce canSub for any known sub-module path.
    const subHit = subPathList.find((p) => pathname === p.prefix || pathname.startsWith(p.prefix + "/"));
    if (subHit) {
      if (subHit.module === "inventory" && subHit.sub === "collections" && roleKey === "field_officer") return;
      if (!canSub(subHit.module, subHit.sub)) {
        // Fall back to the module hub or first allowed path.
        const modulePath = pathToModule.find((p) => p.module === subHit.module)?.prefix;
        const dest = modulePath && can(subHit.module) ? modulePath : firstAllowedPath();
        if (dest) navigate({ to: dest, replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, permsLoading, isSuperAdmin, isReady, roleKey]);


  useEffect(() => {
    if (!isReady) return;
    if (!user) navigate({ to: "/login", replace: true });
  }, [user, isReady, navigate]);

  // Offboarding gate: if a signed-in employee is deactivated, sign them out.
  useEffect(() => {
    if (!isReady || !user || isSuperAdmin) return;
    let alive = true;
    const check = async () => {
      try {
        const { data } = await supabase.rpc("is_current_employee_active" as never);
        if (!alive) return;
        if (data === false) {
          toast.error("Your access has been disabled. Signing you out.");
          logout();
        }
      } catch { /* ignore transient */ }
    };
    void check();
    const t = setInterval(check, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [isReady, user, isSuperAdmin, logout]);

  // When the Supabase session finishes restoring (or the user signs in), drop
  // any cached empty results from queries that fired before auth was ready.
  const queryClient = useQueryClient();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        queryClient.invalidateQueries();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function handleLogout() {
    logout();
    navigate({ to: "/login", replace: true });
  }

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  const groups: GroupItem[] = useMemo(
    () => [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, to: dashboardHref, activePrefixes: ["/admin/dashboard", "/admin/field-dashboard"] },
      { key: "organizations", label: "Organizations", module: "organizations", icon: Building2, to: "/admin/customers", children: customersChildren, activePrefixes: ["/admin/customers"] },
      { key: "contracts", label: "Contracts", module: "contracts", icon: Files, children: contractsChildren, activePrefixes: ["/admin/contracts"] },
      { key: "employees", label: "Employees", module: "employees", icon: UserPlus, to: "/admin/employees", activePrefixes: ["/admin/employees"] },
      { key: "attendance", label: "Attendance", module: "attendance", icon: ClipboardList, to: "/admin/attendance", activePrefixes: ["/admin/attendance"] },
      { key: "payroll", label: "Payroll", module: "payroll", icon: Wallet, children: payrollChildren, activePrefixes: ["/admin/payroll", "/admin/additions", "/admin/deductions"] },
      { key: "invoice", label: "Invoice", module: "invoice", icon: CreditCard, to: "/admin/invoice", activePrefixes: ["/admin/invoice"] },
      { key: "inventory", label: "Uniform Manager", module: "inventory", icon: Boxes, children: inventoryChildren, activePrefixes: ["/admin/inventory"] },
      { key: "vehicles", label: "Vehicles", module: "vehicles", icon: Car, to: "/admin/vehicles", children: vehiclesChildren, activePrefixes: ["/admin/vehicles"] },
      { key: "assets", label: "Assets", module: "assets", icon: Home, to: "/admin/assets", children: assetsChildren, activePrefixes: ["/admin/assets"] },
      { key: "office-assets", label: "Office Assets", module: "office_assets", icon: Briefcase, to: "/admin/office-assets", children: officeAssetsChildren, activePrefixes: ["/admin/office-assets"] },
      { key: "control", label: "Control Center", module: "control_center", icon: SlidersHorizontal, to: "/admin/control-center", activePrefixes: ["/admin/control-center"] },
    ],
    [dashboardHref],
  );

  const isInventoryOnly =
    !isSuperAdmin &&
    can("inventory") &&
    !can("organizations") &&
    !can("contracts") &&
    !can("employees") &&
    !can("vehicles") &&
    !can("assets") &&
    !can("attendance") &&
    !can("payroll") &&
    !can("invoice");
  const filteredInventoryChildren = useMemo(
    () => {
      const isFO = roleKey === "field_officer";
      const isInvAdmin = isSuperAdmin || roleKey === "inventory_manager" || roleKey === "inventory";
      const visibleInventoryChildren = inventoryChildren.filter((c) => c.to !== "/admin/inventory/collections" || isFO);
      if (isSuperAdmin) return visibleInventoryChildren.filter((c) => !c.adminOnly || isInvAdmin);
      const list = inventoryChildren.filter((c) => {
        if (c.adminOnly) return isInvAdmin;
        // Collections is field-officer only — bypass sub-permission gating for FOs.
        if (c.to === "/admin/inventory/collections") return isFO;
        return !c.sub || canSub("inventory", c.sub);
      });
      // Field officers do not see the Inventory Command Center dashboard.
      if (isFO) return list.filter((c) => c.to !== "/admin/inventory");
      return list;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isSuperAdmin, permsLoading, roleKey],
  );

  const isGuard = isGuardRole;
  const guardGroups: GroupItem[] = useMemo(() => [
    { key: "dashboard", label: "My Dashboard", icon: LayoutGrid, to: "/admin/employee-dashboard", activePrefixes: ["/admin/employee-dashboard"] },
    { key: "my-inventory", label: "My Uniform", icon: Boxes, to: "/admin/my-inventory", activePrefixes: ["/admin/my-inventory"] },
    { key: "notifications", label: "Notifications", icon: Bell, to: "/admin/notifications", activePrefixes: ["/admin/notifications"] },
    { key: "profile", label: "My Profile", icon: Users, to: "/admin/profile", activePrefixes: ["/admin/profile"] },
  ], []);
  const isFieldOfficer = !isSuperAdmin && roleKey === "field_officer";
  const visibleGroups = (() => {
    if (isGuard) return guardGroups;
    if (isInventoryOnly) {
      return filteredInventoryChildren.map<GroupItem>((c, idx) => ({
        key: c.to,
        label: c.label,
        icon: c.icon,
        to: c.to,
        activePrefixes: [c.to],
        exact: idx === 0,
      }));
    }
    const base = groups
      .filter((g) => !g.module || can(g.module))
      .map((g) => {
        if (g.key === "inventory") return { ...g, children: filteredInventoryChildren };
        if (!g.module || !g.children) return g;
        const filtered = g.children.filter((c) => !c.sub || canSub(g.module!, c.sub));
        return { ...g, children: filtered };
      });
    if (isFieldOfficer) {
      // FO gets a single dashboard entry that already shows their units and team.
      return base;
    }
    return base;
  })();


  const isGroupActive = (g: GroupItem) =>
    (g.activePrefixes ?? []).some((p) => {
      if (g.exact) return pathname === p;
      return pathname === p || pathname.startsWith(p + "/");
    });

  const sidebarWidth = collapsed ? "lg:w-[72px]" : "lg:w-[244px]";
  const mainOffset = collapsed ? "lg:ml-24" : "lg:ml-[260px]";

  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={100}>
    <div className="relative min-h-dvh">
      {/* Soft tinted canvas — clean glass backdrop, no grid */}
      <div className="pointer-events-none fixed inset-0 z-0 app-canvas" />




      {/* Desktop vertical sidebar — glass / iPadOS */}
      <aside
        className={cn(
          "fixed inset-y-3 left-3 z-30 hidden flex-col rounded-[26px] border border-border/50 bg-card/65 shadow-[0_10px_40px_-16px_rgba(15,23,42,0.18)] backdrop-blur-2xl backdrop-saturate-150 transition-[width] duration-300 lg:flex animate-slide-in-left",
          sidebarWidth,
        )}
      >
        {/* Brand */}
        <div className={cn("flex items-center px-4 pt-5 pb-4", collapsed && "justify-center px-2")}>
          {collapsed ? (
            <Link to={dashboardHref} className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground text-[13px] font-bold">
              R
            </Link>
          ) : (
            <Link to={dashboardHref} className="flex min-w-0 items-center">
              <BrandMark />
            </Link>
          )}
        </div>

        {/* Nav — grouped like the reference portal (Menu / Operations / Finance / Admin) */}
        <nav className="scrollbar-hide flex-1 overflow-y-auto px-2.5 pb-3">
          {(() => {
            const sections: Array<{ label: string; keys: string[] }> = [
              { label: "Menu", keys: ["dashboard", "my-inventory", "profile"] },
              { label: "Operations", keys: ["organizations", "contracts", "employees", "attendance", "inventory", "vehicles", "assets", "office-assets"] },
              { label: "Finance", keys: ["payroll", "invoice"] },
              { label: "Admin", keys: ["control"] },
            ];
            const used = new Set<string>();
            return (
              <div className="space-y-3">
                {sections.map((s) => {
                  const items = visibleGroups.filter((g) => s.keys.includes(g.key));
                  if (items.length === 0) return null;
                  items.forEach((g) => used.add(g.key));
                  return (
                    <div key={s.label} className="space-y-[3px]">
                      {!collapsed && (
                        <div className="px-2.5 pt-1 pb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/70">
                          {s.label}
                        </div>
                      )}
                      {items.map((g) => (
                        <SidebarGroup key={g.key} group={g} collapsed={collapsed} isActive={isActive} groupActive={isGroupActive(g)} />
                      ))}
                    </div>
                  );
                })}
                {(() => {
                  const rest = visibleGroups.filter((g) => !used.has(g.key));
                  if (rest.length === 0) return null;
                  return (
                    <div className="space-y-[3px]">
                      {!collapsed && (
                        <div className="px-2.5 pt-1 pb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/70">More</div>
                      )}
                      {rest.map((g) => (
                        <SidebarGroup key={g.key} group={g} collapsed={collapsed} isActive={isActive} groupActive={isGroupActive(g)} />
                      ))}
                    </div>
                  );
                })()}
              </div>
            );
          })()}
        </nav>

        {/* Footer: user + collapse */}
        <div className="border-t border-border/40 p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-2xl border border-border/40 bg-card/60 p-2 text-sm font-semibold text-foreground transition hover:bg-card/80",
                  collapsed && "justify-center p-1.5",
                )}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary text-primary-foreground text-[11px] font-bold">
                  {me.photoUrl ? (
                    <img src={me.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    me.initials
                  )}
                </span>
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[13px] font-semibold leading-tight">
                        {me.fullName || (user?.phone ? maskPhone(user.phone) : "Account")}
                      </span>
                      {me.designation && (
                        <span className="block truncate text-[11px] font-medium capitalize text-muted-foreground">
                          {me.designation}
                        </span>
                      )}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right" sideOffset={10} className="w-60 rounded-2xl">
              <DropdownMenuLabel>
                <div className="text-sm font-semibold">
                  {me.fullName || (user?.phone ? maskPhone(user.phone) : "Account")}
                </div>
                <div className="text-xs text-muted-foreground capitalize">
                  {me.designation || user?.role?.replace("_", " ")}
                </div>
                {user?.phone && (
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground/80">
                    {maskPhone(user.phone)}
                  </div>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/admin/profile" className="flex items-center gap-2">
                  <Users className="h-4 w-4" /> My Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/admin/notifications" className="flex items-center gap-2">
                  <Bell className="h-4 w-4" /> Notifications
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className={cn(
              "mt-2 flex w-full items-center gap-2 rounded-xl border border-border/40 bg-card/60 px-2.5 py-2 text-[12px] font-semibold text-foreground hover:bg-card/80 transition",
              collapsed && "justify-center px-1.5",
            )}
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-foreground/70">
              {themeMounted && theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </span>
            {!collapsed && (
              <span className="flex-1 text-left text-[12px]">
                {themeMounted && theme === "dark" ? "Light mode" : "Dark mode"}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              "mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-card/60 hover:text-foreground",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
          </button>

        </div>
      </aside>

      {/* Mobile top bar — native-app style, no hamburger (bottom nav has More) */}
      <header data-app-header className="sticky top-0 z-20 flex min-h-12 items-center justify-between gap-3 border-b border-border/30 bg-card/70 px-4 backdrop-blur-2xl backdrop-saturate-150 lg:hidden animate-slide-in-top safe-top safe-x">
        <Link to={dashboardHref} className="flex min-w-0 items-center gap-2">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-1.5">
          <NotificationBell />
        </div>
      </header>

      {/* Mobile bottom-sheet drawer (slide-up) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-200"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className={cn(
              "absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col",
              "rounded-t-3xl border-t border-border/50 bg-card shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.35)]",
              "animate-in slide-in-from-bottom duration-300 ease-out",
              "safe-bottom",
            )}
          >
            {/* Grabber */}
            <div className="flex justify-center pt-2.5 pb-1">
              <div className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="flex items-center justify-between px-4 pb-2">
              <BrandMark />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-xl bg-muted/60 text-foreground"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 pt-1 pb-3">
              {visibleGroups.map((g) => (
                <MobileGroup key={g.key} group={g} isActive={isActive} isGroupActive={isGroupActive(g)} />
              ))}
              <div className="my-2 border-t border-border/40" />
              <Link
                to="/admin/profile"
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/60"
              >
                <Users className="h-4 w-4 shrink-0" /> My Profile
              </Link>
              <Link
                to="/admin/notifications"
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/60"
              >
                <Bell className="h-4 w-4 shrink-0" /> Notifications
              </Link>
              <button
                type="button"
                onClick={toggleTheme}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-foreground hover:bg-muted/60"
              >
                {themeMounted && theme === "dark" ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
                {themeMounted && theme === "dark" ? "Light mode" : "Dark mode"}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4 shrink-0" /> Sign out
              </button>
            </nav>
          </aside>
        </div>
      )}

      {/* Main */}
      <main className={cn("relative z-10 min-h-[calc(100dvh-3.5rem)] overflow-x-clip safe-x py-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] transition-[margin] duration-300 sm:px-6 sm:py-6 lg:py-8 lg:pr-6 lg:pb-8", mainOffset)}>
        {/* Desktop top utility bar — global search + notifications */}
        <div className="mb-4 hidden items-center gap-3 lg:flex animate-slide-in-top">
          <div className="flex h-10 flex-1 items-center gap-2 rounded-full border border-border/60 bg-card/70 px-4 text-sm text-muted-foreground backdrop-blur-xl shadow-[0_1px_0_0_rgba(255,255,255,0.85)_inset,0_10px_30px_-18px_rgba(15,23,42,0.18)]">
            <svg className="h-4 w-4 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input
              type="search"
              placeholder="Search employees, units, invoices…"
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            
          </div>
          <NotificationBell />
        </div>
        <div className="mx-auto max-w-[1500px]">
          <div key={pathname} className="page-enter">
            {isReady && user && !permsLoading ? (
              <Outlet />
            ) : (
              <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/70" />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile bottom tab bar — primary destinations + More opens full drawer */}
      {(() => {
        const bottomItems: BottomNavItem[] = (() => {
          if (isGuard) {
            return guardGroups.map((g) => ({
              key: g.key,
              label: g.label.replace(/^My\s+/i, ""),
              icon: g.icon,
              to: g.to,
              active: isGroupActive(g),
            }));
          }
          // Build up to 4 primary destinations in priority order, filtered by permissions.
          const priorityKeys = isFieldOfficer
            ? ["dashboard", "attendance", "employees", "inventory"]
            : ["dashboard", "employees", "attendance", "payroll", "invoice", "inventory", "organizations"];
          const byKey = new Map(visibleGroups.map((g) => [g.key, g]));
          const picked: GroupItem[] = [];
          for (const k of priorityKeys) {
            const g = byKey.get(k);
            if (g && picked.length < 4) picked.push(g);
          }
          // Fallback: fill from remaining visibleGroups
          for (const g of visibleGroups) {
            if (picked.length >= 4) break;
            if (!picked.find((p) => p.key === g.key)) picked.push(g);
          }
          return picked.map((g) => ({
            key: g.key,
            label: g.label,
            icon: g.icon,
            to: g.to ?? g.children?.[0]?.to,
            active: isGroupActive(g),
          }));
        })();
        return (
          <MobileBottomNav
            items={bottomItems}
            onMore={() => setMobileOpen(true)}
            moreActive={mobileOpen}
          />
        );
      })()}
    </div>
    </TooltipProvider>
  );
}

function SidebarGroup({
  group,
  collapsed,
  isActive,
  groupActive,
}: {
  group: GroupItem;
  collapsed: boolean;
  isActive: (p: string) => boolean;
  groupActive: boolean;
}) {
  const [open, setOpen] = useState(groupActive);
  const Icon = group.icon;
  const t = useT();

  useEffect(() => {
    if (groupActive) setOpen(true);
  }, [groupActive]);

  const itemBase =
    "group relative flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2 text-[13px] font-medium transition-all";
  const itemIdle = "text-foreground/70 hover:bg-foreground/[0.05] hover:text-foreground";
  const itemActive =
    "bg-foreground text-background shadow-[0_10px_28px_-14px_rgba(15,23,42,0.55)]";

  const iconSpanBase = "grid h-7 w-7 shrink-0 place-items-center rounded-xl transition-colors";
  const iconSpanActive = "bg-card/15 text-background";
  const iconSpanIdle = "text-foreground/60 group-hover:text-foreground";

  if (!group.children || group.children.length === 0) {
    const link = (
      <Link
        to={group.to!}
        aria-label={collapsed ? group.label : undefined}
        data-no-tip
        className={cn(itemBase, groupActive ? itemActive : itemIdle, collapsed && "justify-center px-2")}
      >
        <span className={cn(iconSpanBase, groupActive ? iconSpanActive : iconSpanIdle)}>
          <Icon className="h-4 w-4" />
        </span>
        {!collapsed && <span className="truncate">{t(group.label)}</span>}
      </Link>
    );
    if (!collapsed) return link;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={10} className="font-medium">
          {t(group.label)}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (collapsed) {
    return (
      <CollapsedGroupPopover
        group={group}
        groupActive={groupActive}
        isActive={isActive}
        itemBase={itemBase}
        itemIdle={itemIdle}
        itemActive={itemActive}
        iconSpanBase={iconSpanBase}
        iconSpanIdle={iconSpanIdle}
        iconSpanActive={iconSpanActive}
        Icon={Icon}
      />
    );
  }

  return (
    <div>
      {group.to ? (
        <div className={cn(itemBase, "gap-1 pr-1", groupActive ? itemActive : itemIdle)}>
          <Link
            to={group.to}
            className="flex flex-1 items-center gap-2.5 min-w-0"
          >
            <span className={cn(iconSpanBase, groupActive ? iconSpanActive : iconSpanIdle)}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="flex-1 truncate text-left">{t(group.label)}</span>
          </Link>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
            aria-label={open ? "Collapse" : "Expand"}
            className="grid h-6 w-6 place-items-center rounded-md hover:bg-foreground/10"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 opacity-60 transition-transform", open ? "rotate-0" : "-rotate-90")} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(itemBase, groupActive ? itemActive : itemIdle)}
        >
          <span className={cn(iconSpanBase, groupActive ? iconSpanActive : iconSpanIdle)}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="flex-1 truncate text-left">{t(group.label)}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 opacity-50 transition-transform", open ? "rotate-0" : "-rotate-90")} />
        </button>
      )}
      {open && (
        <div className="mt-0.5 ml-[22px] space-y-0.5 border-l border-foreground/10 pl-3">
          {group.children.map((c) => {
            const a = isActive(c.to);
            return (
              <Link
                key={c.to}
                to={c.to}
                search={c.search as never}
                className={cn(
                  "relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                  a
                    ? "bg-accent/10 text-accent font-semibold"
                    : "text-foreground/65 hover:bg-foreground/[0.04] hover:text-foreground",
                )}
              >
                <c.icon className="h-3.5 w-3.5 opacity-70" />
                <span className="truncate">{t(c.label)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MobileGroup({
  group,
  isActive,
  isGroupActive,
}: {
  group: GroupItem;
  isActive: (p: string) => boolean;
  isGroupActive: boolean;
}) {
  const [open, setOpen] = useState(isGroupActive);
  const Icon = group.icon;
  const t = useT();
  if (!group.children || group.children.length === 0) {
    return (
      <Link
        to={group.to!}
        className={cn(
          "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
          isGroupActive
            ? "bg-[color-mix(in_oklab,var(--accent)_12%,white)] text-accent ring-1 ring-[color-mix(in_oklab,var(--accent)_30%,transparent)]"
            : "text-foreground hover:bg-accent/10 hover:text-accent",
        )}
      >
        <Icon className="h-4 w-4" />
        {t(group.label)}
      </Link>
    );
  }
  return (
    <div>
      {group.to ? (
        <div
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
            isGroupActive
              ? "bg-[color-mix(in_oklab,var(--accent)_12%,white)] text-accent ring-1 ring-[color-mix(in_oklab,var(--accent)_30%,transparent)]"
              : "text-foreground hover:bg-accent/10 hover:text-accent",
          )}
        >
          <Link to={group.to} className="flex flex-1 items-center gap-2.5 min-w-0">
            <Icon className="h-4 w-4" />
            <span className="flex-1 truncate text-left">{t(group.label)}</span>
          </Link>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
            aria-label={open ? "Collapse" : "Expand"}
            className="grid h-7 w-7 place-items-center rounded-md hover:bg-foreground/10"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", open ? "rotate-0" : "-rotate-90")} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
            isGroupActive
              ? "bg-[color-mix(in_oklab,var(--accent)_12%,white)] text-accent ring-1 ring-[color-mix(in_oklab,var(--accent)_30%,transparent)]"
              : "text-foreground hover:bg-accent/10 hover:text-accent",
          )}
        >
          <Icon className="h-4 w-4" />
          <span className="flex-1 text-left">{t(group.label)}</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open ? "rotate-0" : "-rotate-90")} />
        </button>
      )}
      {open && (
        <div className="mt-1 space-y-0.5 pl-4">
          {group.children.map((c) => {
            const a = isActive(c.to);
            return (
              <Link
                key={c.to}
                to={c.to}
                search={c.search as never}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                  a
                    ? "bg-[color-mix(in_oklab,var(--accent)_10%,white)] text-accent ring-1 ring-[color-mix(in_oklab,var(--accent)_25%,transparent)]"
                    : "text-foreground/80 hover:bg-accent/10 hover:text-accent",
                )}
              >
                <c.icon className="h-4 w-4 opacity-80" />
                <span className="truncate">{t(c.label)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CollapsedGroupPopover({
  group,
  groupActive,
  isActive,
  itemBase,
  itemIdle,
  itemActive,
  iconSpanBase,
  iconSpanIdle,
  iconSpanActive,
  Icon,
}: {
  group: GroupItem;
  groupActive: boolean;
  isActive: (p: string) => boolean;
  itemBase: string;
  itemIdle: string;
  itemActive: string;
  iconSpanBase: string;
  iconSpanIdle: string;
  iconSpanActive: string;
  Icon: GroupItem["icon"];
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t(group.label)}
          aria-expanded={open}
          onMouseEnter={() => {
            cancelClose();
            setOpen(true);
          }}
          onMouseLeave={scheduleClose}
          onFocus={() => {
            cancelClose();
            setOpen(true);
          }}
          onBlur={scheduleClose}
          className={cn(itemBase, "justify-center px-2", groupActive ? itemActive : itemIdle)}
        >
          <span className={cn(iconSpanBase, groupActive ? iconSpanActive : iconSpanIdle)}>
            <Icon className="h-4 w-4" />
          </span>
        </button>
      </PopoverTrigger>
      {group.children && (
        <PopoverContent
          side="right"
          align="start"
          sideOffset={12}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="w-60 rounded-2xl border border-border/50 bg-card/95 p-2 shadow-2xl backdrop-blur-xl"
        >
          <div className="mb-1 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {t(group.label)}
          </div>
          <div className="space-y-0.5">
            {group.children.map((c) => {
              const a = isActive(c.to);
              return (
                <Link
                  key={c.to}
                  to={c.to}
                  search={c.search as never}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                    a
                      ? "bg-accent/10 text-accent"
                      : "text-foreground/80 hover:bg-accent/10 hover:text-accent",
                  )}
                >
                  <c.icon className="h-4 w-4" />
                  <span className="truncate">{t(c.label)}</span>
                </Link>
              );
            })}
          </div>
        </PopoverContent>
      )}
    </Popover>

  );
}
