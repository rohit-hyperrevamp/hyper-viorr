import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ListSkeleton } from "@/components/Skeletons";
import { useCurrentUserRole } from "@/lib/use-current-user-role";
import { useFieldOfficerUnitScope } from "@/lib/use-fo-unit-scope";

export const Route = createFileRoute("/admin/my-reportees")({
  component: MyReporteesPage,
});

type Placement = { unitId: string; unitName: string; unitCode: string; designation: string; isPrimary: boolean };
type Reportee = {
  id: string;
  name: string;
  code: string | null;
  mobile: string | null;
  photo: string | null;
  status: string | null;
  placements: Placement[];
  direct: boolean;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function MyReporteesPage() {
  const { candidateId } = useCurrentUserRole();
  const foScope = useFieldOfficerUnitScope();
  const unitIds = useMemo(() => Array.from(foScope.unitIds), [foScope.unitIds]);
  const [q, setQ] = useState("");
  const [unitFilter, setUnitFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["my-reportees", candidateId, unitIds.join(",")],
    enabled: !!candidateId,
    queryFn: async (): Promise<{ rows: Reportee[]; units: { id: string; name: string; code: string }[] }> => {
      const [crmRes, cuRes] = await Promise.all([
        supabase.from("candidate_reporting_managers").select("candidate_id").eq("manager_id", candidateId!),
        unitIds.length
          ? supabase.from("candidate_units").select("candidate_id,unit_id,is_primary,designation_id").in("unit_id", unitIds)
          : Promise.resolve({ data: [] as Array<{ candidate_id: string; unit_id: string; is_primary: boolean; designation_id: string | null }> }),
      ]);

      const directIds = new Set(((crmRes.data ?? []) as Array<{ candidate_id: string }>).map((r) => r.candidate_id));
      const links = (cuRes.data ?? []) as Array<{ candidate_id: string; unit_id: string; is_primary: boolean; designation_id: string | null }>;

      // Reportees are derived from the FO's current units. A historical manager
      // link alone must not keep an employee after the FO changes posting.
      const ids = new Set<string>(links.map((l) => l.candidate_id));

      // Legacy candidates.unit_id mirrors the primary placement and remains a
      // valid unit-derived fallback for records not yet present in candidate_units.
      const { data: legacy } = unitIds.length
        ? await supabase
            .from("candidates")
            .select("id,reports_to,unit_id")
            .in("unit_id", unitIds)
        : { data: [] };
      for (const r of (legacy ?? []) as Array<{ id: string; reports_to: string | null }>) {
        ids.add(r.id);
      }
      ids.delete(candidateId!);
      if (ids.size === 0) return { rows: [], units: [] };

      const [candRes, unitsRes, desigRes] = await Promise.all([
        supabase
          .from("candidates")
          .select("id,full_name,employee_code,mobile,photo_url,status,is_enabled,role_key,unit_id,designation_id")
          .in("id", Array.from(ids))
          .eq("is_enabled", true)
          .in("status", ["active", "approved"]),
        unitIds.length
          ? supabase.from("units").select("id,name,code").in("id", unitIds)
          : Promise.resolve({ data: [] as Array<{ id: string; name: string; code: string }> }),
        supabase.from("designations").select("id,name"),
      ]);

      const unitMap = new Map(((unitsRes.data ?? []) as Array<{ id: string; name: string; code: string }>).map((u) => [u.id, u]));
      const desigMap = new Map(((desigRes.data ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]));

      const byCandidate = new Map<string, Placement[]>();
      for (const l of links) {
        const u = unitMap.get(l.unit_id);
        if (!u) continue;
        const arr = byCandidate.get(l.candidate_id) ?? [];
        arr.push({
          unitId: u.id,
          unitName: u.name,
          unitCode: u.code,
          designation: (l.designation_id && desigMap.get(l.designation_id)) || "—",
          isPrimary: !!l.is_primary,
        });
        byCandidate.set(l.candidate_id, arr);
      }

      const rows: Reportee[] = ((candRes.data ?? []) as Array<{
        id: string; full_name: string; employee_code: string | null; mobile: string | null;
        photo_url: string | null; status: string | null; unit_id: string | null; designation_id: string | null;
      }>).map((c) => {
        const placements = byCandidate.get(c.id) ?? [];
        if (!placements.length && c.unit_id && unitMap.has(c.unit_id)) {
          const u = unitMap.get(c.unit_id)!;
          placements.push({
            unitId: u.id,
            unitName: u.name,
            unitCode: u.code,
            designation: (c.designation_id && desigMap.get(c.designation_id)) || "—",
            isPrimary: true,
          });
        }
        placements.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.unitName.localeCompare(b.unitName));
        return {
          id: c.id,
          name: c.full_name,
          code: c.employee_code,
          mobile: c.mobile,
          photo: c.photo_url,
          status: c.status,
          placements,
          direct: directIds.has(c.id),
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      return {
        rows,
        units: Array.from(unitMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      };
    },
  });

  const rows = data?.rows ?? [];
  const units = data?.units ?? [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (unitFilter !== "all" && !r.placements.some((p) => p.unitId === unitFilter)) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        (r.code ?? "").toLowerCase().includes(needle) ||
        (r.mobile ?? "").includes(needle)
      );
    });
  }, [rows, q, unitFilter]);

  const primaryCount = rows.filter((r) => r.placements.some((p) => p.isPrimary)).length;

  return (
    <div className="page-shell space-y-4">
      <PageHeader
        eyebrow="Field operations"
        title="My reportees"
        crumbs={[{ label: "Field dashboard", to: "/admin/field-dashboard" }, { label: "My reportees" }]}
        description="Every security guard mapped to you across all your units."
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatBox label="Reportees" value={rows.length} />
        <StatBox label="Primary" value={primaryCount} />
        <StatBox label="Units" value={units.length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, code or mobile"
            className="h-9 pl-9 text-sm"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={unitFilter === "all"} onClick={() => setUnitFilter("all")}>All units</FilterChip>
          {units.map((u) => (
            <FilterChip key={u.id} active={unitFilter === u.id} onClick={() => setUnitFilter(u.id)}>
              {u.code}
            </FilterChip>
          ))}
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-card/90 p-8 text-center text-sm text-muted-foreground">
          No reportees found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-sm backdrop-blur-xl">
          {filtered.map((r) => (
            <div key={r.id} className="flex items-start gap-3 border-b border-border/50 px-3.5 py-3 last:border-b-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-bold text-foreground/70">
                {r.photo ? <img src={r.photo} alt={r.name} className="h-full w-full object-cover" /> : initials(r.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold text-foreground">{r.name}</span>
                  {r.code && <span className="text-[11px] text-muted-foreground">{r.code}</span>}
                  {r.direct && (
                    <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      Direct
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {r.placements.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground">No unit mapping</span>
                  ) : (
                    r.placements.map((p) => (
                      <span
                        key={p.unitId}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                          p.isPrimary
                            ? "bg-primary/10 text-primary ring-primary/20"
                            : "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300"
                        }`}
                      >
                        {p.unitCode} · {p.designation} · {p.isPrimary ? "Primary" : "Reliever · ED"}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {r.mobile && (
                  <a
                    href={`tel:${r.mobile}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border/70 text-muted-foreground"
                    aria-label={`Call ${r.name}`}
                  >
                    <Phone className="h-3.5 w-3.5" />
                  </a>
                )}
                <Button asChild size="sm" variant="ghost" className="h-8 rounded-full px-2 text-[11px]">
                  <Link to="/admin/candidates/$id/details" params={{ id: r.id }}>View</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/90 px-3 py-2.5 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xl font-bold text-foreground">
        {label === "Reportees" ? <ShieldCheck className="h-4 w-4 text-primary" /> : <UserRound className="h-4 w-4 text-muted-foreground" />}
        {value}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset transition ${
        active ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-muted-foreground ring-border/70"
      }`}
    >
      {children}
    </button>
  );
}
