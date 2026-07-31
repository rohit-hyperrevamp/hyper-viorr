import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  Car,
  FileWarning,
  Files,
  ShieldCheck,
  Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { MiniStat } from "@/components/MiniStat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadCsv } from "@/lib/csv-export";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/compliance")({
  component: CompliancePage,
  head: () => ({
    meta: [
      { title: "Compliance Calendar — Radiant Guard" },
      {
        name: "description",
        content:
          "One calendar for every expiry: vehicle PUC, insurance, FASTag, client contracts and unit agreements — overdue, due this week and due this month.",
      },
      { property: "og:title", content: "Compliance Calendar" },
      {
        property: "og:description",
        content: "Track every statutory and contractual expiry across vehicles, contracts and units.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Category = "PUC" | "Insurance" | "FASTag" | "Contract" | "Unit agreement";

type ComplianceItem = {
  id: string;
  category: Category;
  title: string;
  subject: string;
  reference: string | null;
  dueDate: string;
  daysLeft: number;
};

const CATEGORY_ICON: Record<Category, React.ComponentType<{ className?: string }>> = {
  PUC: Car,
  Insurance: ShieldCheck,
  FASTag: Car,
  Contract: Files,
  "Unit agreement": FileWarning,
};

function daysBetween(due: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function fmt(date: string) {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function useComplianceItems() {
  return useQuery({
    queryKey: ["compliance-calendar"],
    queryFn: async (): Promise<ComplianceItem[]> => {
      const [pucs, insurances, fastags, contracts, units] = await Promise.all([
        supabase
          .from("vehicle_pucs")
          .select("id, expiry_date, puc_number, vehicles(vehicle_number, name)")
          .eq("enabled", true),
        supabase
          .from("vehicle_insurances")
          .select("id, end_date, policy_number, insurance_company, vehicles(vehicle_number, name)")
          .eq("enabled", true),
        supabase
          .from("vehicle_fastags")
          .select("id, expiry_date, fastag_number, bank_name, vehicles(vehicle_number, name)")
          .eq("enabled", true),
        supabase
          .from("client_contracts")
          .select("id, contract_code, end_date, expiry_date, status, record_type"),
        supabase.from("units").select("id, name, code, contract_end_date, status"),
      ]);

      const out: ComplianceItem[] = [];
      const push = (item: Omit<ComplianceItem, "daysLeft">) => {
        if (!item.dueDate) return;
        out.push({ ...item, daysLeft: daysBetween(item.dueDate) });
      };

      const vname = (v: unknown) => {
        const rec = (Array.isArray(v) ? v[0] : v) as { vehicle_number?: string | null; name?: string | null } | null;
        return rec?.vehicle_number || rec?.name || "Vehicle";
      };

      for (const p of pucs.data ?? []) {
        push({
          id: `puc-${p.id}`,
          category: "PUC",
          title: "PUC certificate expiry",
          subject: vname(p.vehicles),
          reference: p.puc_number,
          dueDate: (p.expiry_date as string) ?? "",
        });
      }
      for (const i of insurances.data ?? []) {
        push({
          id: `ins-${i.id}`,
          category: "Insurance",
          title: `Insurance renewal${i.insurance_company ? ` · ${i.insurance_company}` : ""}`,
          subject: vname(i.vehicles),
          reference: i.policy_number,
          dueDate: (i.end_date as string) ?? "",
        });
      }
      for (const f of fastags.data ?? []) {
        push({
          id: `tag-${f.id}`,
          category: "FASTag",
          title: `FASTag expiry${f.bank_name ? ` · ${f.bank_name}` : ""}`,
          subject: vname(f.vehicles),
          reference: f.fastag_number,
          dueDate: (f.expiry_date as string) ?? "",
        });
      }
      for (const c of contracts.data ?? []) {
        if (c.record_type && c.record_type !== "contract") continue;
        if (c.status && ["lost", "expired"].includes(String(c.status).toLowerCase())) continue;
        const due = (c.end_date as string) || (c.expiry_date as string) || "";
        push({
          id: `con-${c.id}`,
          category: "Contract",
          title: "Client contract expiry",
          subject: c.contract_code ?? "Contract",
          reference: c.contract_code,
          dueDate: due,
        });
      }
      for (const u of units.data ?? []) {
        if (u.status && String(u.status).toLowerCase() !== "active") continue;
        push({
          id: `unit-${u.id}`,
          category: "Unit agreement",
          title: "Unit agreement end date",
          subject: u.name || u.code || "Unit",
          reference: u.code,
          dueDate: (u.contract_end_date as string) ?? "",
        });
      }

      return out.sort((a, b) => a.daysLeft - b.daysLeft);
    },
  });
}

type Bucket = "overdue" | "week" | "month" | "quarter" | "all";

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "week", label: "Next 7 days" },
  { key: "month", label: "Next 30 days" },
  { key: "quarter", label: "Next 90 days" },
  { key: "all", label: "All" },
];

function inBucket(item: ComplianceItem, bucket: Bucket) {
  if (bucket === "all") return true;
  if (bucket === "overdue") return item.daysLeft < 0;
  if (bucket === "week") return item.daysLeft >= 0 && item.daysLeft <= 7;
  if (bucket === "month") return item.daysLeft >= 0 && item.daysLeft <= 30;
  return item.daysLeft >= 0 && item.daysLeft <= 90;
}

function CompliancePage() {
  const { data: items = [], isLoading } = useComplianceItems();
  const [bucket, setBucket] = useState<Bucket>("month");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");

  const counts = useMemo(
    () => ({
      overdue: items.filter((i) => i.daysLeft < 0).length,
      week: items.filter((i) => i.daysLeft >= 0 && i.daysLeft <= 7).length,
      month: items.filter((i) => i.daysLeft >= 0 && i.daysLeft <= 30).length,
      quarter: items.filter((i) => i.daysLeft >= 0 && i.daysLeft <= 90).length,
    }),
    [items],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (!inBucket(i, bucket)) return false;
      if (category !== "all" && i.category !== category) return false;
      if (!needle) return true;
      return `${i.subject} ${i.title} ${i.reference ?? ""}`.toLowerCase().includes(needle);
    });
  }, [items, bucket, category, q]);

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category))) as Category[],
    [items],
  );

  return (
    <div className="page-shell">
      <PageHeader
        icon={CalendarClock}
        eyebrow="Governance"
        title="Compliance Calendar"
        description="Every statutory and contractual expiry in one place — vehicles, contracts and unit agreements."
        crumbs={[{ label: "Compliance" }]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv({
                filename: "compliance-calendar",
                rows: rows.map((r) => ({
                  category: r.category,
                  subject: r.subject,
                  item: r.title,
                  reference: r.reference ?? "",
                  due_date: r.dueDate,
                  days_left: r.daysLeft,
                  state: r.daysLeft < 0 ? "Overdue" : "Upcoming",
                })),
                columns: [
                  { key: "category", header: "Category" },
                  { key: "subject", header: "Subject" },
                  { key: "item", header: "Item" },
                  { key: "reference", header: "Reference" },
                  { key: "due_date", header: "Due date" },
                  { key: "days_left", header: "Days left" },
                  { key: "state", header: "State" },
                ],
              })
            }
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>
        }
        kpis={
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="Overdue" value={counts.overdue} tone="destructive" icon={AlertTriangle} />
            <MiniStat label="Due in 7 days" value={counts.week} tone="warning" icon={CalendarClock} />
            <MiniStat label="Due in 30 days" value={counts.month} icon={CalendarClock} />
            <MiniStat label="Due in 90 days" value={counts.quarter} subtle="rolling" icon={CalendarClock} />
          </div>
        }
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {BUCKETS.map((b) => (
            <button
              key={b.key}
              onClick={() => setBucket(b.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors",
                bucket === b.key
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-border/60 bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category | "all")}
            className="h-9 rounded-lg border border-border/60 bg-card px-2 text-xs"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search vehicle, unit, reference…"
            className="h-9 w-full sm:w-64 text-xs"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">Loading compliance items…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Nothing due in this window. You are compliant.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((r) => {
              const Icon = CATEGORY_ICON[r.category];
              const overdue = r.daysLeft < 0;
              const soon = r.daysLeft >= 0 && r.daysLeft <= 7;
              return (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                  <div
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset",
                      overdue
                        ? "bg-destructive/10 text-destructive ring-destructive/20"
                        : soon
                          ? "bg-amber-500/10 text-amber-600 ring-amber-500/20"
                          : "bg-accent/10 text-accent ring-accent/20",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{r.subject}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {r.title}
                      {r.reference ? ` · ${r.reference}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[12px] font-semibold tabular-nums">{fmt(r.dueDate)}</p>
                    <p
                      className={cn(
                        "text-[11px] font-medium tabular-nums",
                        overdue ? "text-destructive" : soon ? "text-amber-600" : "text-muted-foreground",
                      )}
                    >
                      {overdue ? `${Math.abs(r.daysLeft)} days overdue` : `in ${r.daysLeft} days`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
