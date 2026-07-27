import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { FieldOfficerFieldSense } from "@/components/FieldOfficerFieldSense";

export const Route = createFileRoute("/admin/field-sense/officer/$id")({
  component: OfficerViewPage,
  validateSearch: (search: Record<string, unknown>) => ({
    date: (search.date as string | undefined) ?? undefined,
    from: (search.from as string | undefined) ?? undefined,
  }),
  head: () => ({
    meta: [
      { title: "Field Sense — Officer view" },
      { name: "description", content: "Live map, visits and trajectory for a field officer." },
    ],
  }),
});

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function OfficerViewPage() {
  const { id } = Route.useParams();
  const { date, from } = Route.useSearch();
  const q = useQuery({
    queryKey: ["field-sense-officer-meta", id],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("candidates" as never)
        .select("id, full_name, employee_code")
        .eq("id", id)
        .maybeSingle();
      return (data as { id: string; full_name: string; employee_code: string | null } | null) ?? null;
    },
  });

  const backTo = from === "expenses" ? "/admin/field-sense/expenses" : "/admin/field-sense/team";
  const backLabel = from === "expenses" ? "Back to Expense Manager" : "Back to Day Patrol";
  const crumbLabel = from === "expenses" ? "Expense Manager" : "Day Patrol";
  const historyLabel = date ? fmtDate(date) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={q.data?.full_name ?? "Field officer"}
        description={
          historyLabel
            ? `Trail for ${historyLabel}${q.data?.employee_code ? ` · ${q.data.employee_code}` : ""}`
            : q.data?.employee_code
              ? `Employee code ${q.data.employee_code}`
              : "Live map and trajectory"
        }
        crumbs={[
          { label: "Admin", to: "/admin/dashboard" },
          { label: "Field Sense", to: "/admin/field-sense" },
          { label: crumbLabel, to: backTo },
          { label: q.data?.full_name ?? "Officer" },
        ]}
      />
      <div>
        <Link
          to={backTo}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLabel}
        </Link>
      </div>
      {historyLabel && (
        <div className="rounded-2xl border border-primary/25 bg-primary/5 px-3 py-2 text-[12px] font-semibold text-primary">
          Viewing archived trail — {historyLabel}. Live actions are disabled.
        </div>
      )}
      <FieldOfficerFieldSense candidateId={id} viewDate={date} />
    </div>
  );
}
