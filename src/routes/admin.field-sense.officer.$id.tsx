import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { FieldOfficerFieldSense } from "@/components/FieldOfficerFieldSense";

export const Route = createFileRoute("/admin/field-sense/officer/$id")({
  component: OfficerViewPage,
  head: () => ({
    meta: [
      { title: "Field Sense — Officer view" },
      { name: "description", content: "Live map, visits and trajectory for a field officer." },
    ],
  }),
});

function OfficerViewPage() {
  const { id } = Route.useParams();
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

  return (
    <div className="space-y-4">
      <PageHeader
        title={q.data?.full_name ?? "Field officer"}
        description={q.data?.employee_code ? `Employee code ${q.data.employee_code}` : "Live map and trajectory"}
        crumbs={[
          { label: "Admin", to: "/admin/dashboard" },
          { label: "Field Sense", to: "/admin/field-sense" },
          { label: "My Team", to: "/admin/field-sense/team" },
          { label: q.data?.full_name ?? "Officer" },
        ]}
      />
      <div>
        <Link
          to="/admin/field-sense/team"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to My Team
        </Link>
      </div>
      <FieldOfficerFieldSense candidateId={id} />
    </div>
  );
}
