import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-log";

type FieldOfficerRow = {
  id: string;
  full_name: string;
  employee_code: string | null;
  mobile: string | null;
};

type ManagerRow = {
  id: string;
  manager_id: string;
  is_primary: boolean;
  source: string;
  unit_id: string | null;
};

export function GuardReportingManagersEditor({
  candidateId,
  candidateName,
}: {
  candidateId: string;
  candidateName: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: officers = [], isLoading: loadingOfficers } = useQuery({
    queryKey: ["active-field-officers"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_active_field_officers" as never);
      if (error) throw error;
      return (data as FieldOfficerRow[]) ?? [];
    },
  });

  const { data: current = [], isLoading: loadingCurrent } = useQuery({
    queryKey: ["candidate-reporting-managers", candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_reporting_managers" as never)
        .select("id,manager_id,is_primary,source,unit_id")
        .eq("candidate_id", candidateId);
      if (error) throw error;
      return (data as ManagerRow[]) ?? [];
    },
  });

  const currentIds = useMemo(() => new Set(current.map((r) => r.manager_id)), [current]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPendingIds(new Set(currentIds));
  }, [currentIds]);

  const dirty = useMemo(() => {
    if (pendingIds.size !== currentIds.size) return true;
    for (const id of pendingIds) if (!currentIds.has(id)) return true;
    return false;
  }, [pendingIds, currentIds]);

  const officerMap = useMemo(() => {
    const m = new Map<string, FieldOfficerRow>();
    for (const o of officers) m.set(o.id, o);
    return m;
  }, [officers]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const toAdd = [...pendingIds].filter((id) => !currentIds.has(id));
      const toRemove = current.filter((r) => !pendingIds.has(r.manager_id));

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("candidate_reporting_managers" as never)
          .delete()
          .in("id", toRemove.map((r) => r.id));
        if (error) throw error;
      }
      if (toAdd.length > 0) {
        const rows = toAdd.map((manager_id, idx) => ({
          candidate_id: candidateId,
          manager_id,
          source: "manual",
          is_primary: current.length === 0 && idx === 0,
        }));
        const { error } = await supabase
          .from("candidate_reporting_managers" as never)
          .insert(rows as never);
        if (error) throw error;
      }
      await logActivity({
        module: "Employees",
        action: "update_reporting_managers",
        entityType: "candidate",
        entityId: candidateId,
        entityLabel: candidateName,
        before: { manager_ids: [...currentIds] },
        after: { manager_ids: [...pendingIds] },
      });
    },
    onSuccess: () => {
      toast.success("Reporting managers updated");
      qc.invalidateQueries({ queryKey: ["candidate-reporting-managers", candidateId] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update managers"),
  });

  const setPrimaryMut = useMutation({
    mutationFn: async (managerId: string) => {
      const { error: e1 } = await supabase
        .from("candidate_reporting_managers" as never)
        .update({ is_primary: false } as never)
        .eq("candidate_id", candidateId);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("candidate_reporting_managers" as never)
        .update({ is_primary: true } as never)
        .eq("candidate_id", candidateId)
        .eq("manager_id", managerId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Primary manager updated");
      qc.invalidateQueries({ queryKey: ["candidate-reporting-managers", candidateId] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to set primary"),
  });

  const isLoading = loadingOfficers || loadingCurrent;

  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-sm font-semibold">Reporting Managers</div>
            <div className="text-[11px] text-muted-foreground">
              Field Officers this guard reports to. Multiple allowed for guards covering more than one unit.
            </div>
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen((o) => !o)} className="h-7 rounded-md text-xs">
          {open ? "Close" : "Edit"}
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {!isLoading && current.length === 0 && (
          <span className="text-xs text-muted-foreground">No reporting manager assigned yet.</span>
        )}
        {current.map((r) => {
          const fo = officerMap.get(r.manager_id);
          const label = fo?.full_name ?? r.manager_id.slice(0, 8);
          return (
            <Badge
              key={r.id}
              variant={r.is_primary ? "default" : "secondary"}
              className="gap-1 rounded-full text-[11px] font-medium"
              title={r.is_primary ? "Primary manager" : "Additional manager"}
            >
              {r.is_primary && <span className="text-[9px] uppercase tracking-wide">Primary ·</span>}
              {label}
              {!r.is_primary && current.length > 1 && (
                <button
                  type="button"
                  onClick={() => setPrimaryMut.mutate(r.manager_id)}
                  className="ml-1 rounded px-1 text-[9px] uppercase tracking-wide text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="Set as primary"
                >
                  Make primary
                </button>
              )}
            </Badge>
          );
        })}
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
          <div className="max-h-56 overflow-y-auto rounded-md border border-border/60 bg-background/70 p-1">
            {officers.length === 0 && !loadingOfficers && (
              <div className="p-3 text-xs text-muted-foreground">No active Field Officers found.</div>
            )}
            {officers.map((o) => {
              const checked = pendingIds.has(o.id);
              return (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-secondary"
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setPendingIds((prev) => {
                          const next = new Set(prev);
                          if (v) next.add(o.id);
                          else next.delete(o.id);
                          return next;
                        });
                      }}
                    />
                    <div>
                      <div className="font-medium">{o.full_name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {o.employee_code ?? "—"}{o.mobile ? ` · ${o.mobile}` : ""}
                      </div>
                    </div>
                  </div>
                  {currentIds.has(o.id) && (
                    <span className="text-[9px] uppercase tracking-wide text-emerald-600">Current</span>
                  )}
                </label>
              );
            })}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setPendingIds(new Set(currentIds))}
              disabled={!dirty || saveMut.isPending}
              className="h-7 rounded-md text-xs"
            >
              <X className="mr-1 h-3 w-3" /> Reset
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => saveMut.mutate()}
              disabled={!dirty || saveMut.isPending}
              className="h-7 rounded-md text-xs"
            >
              {saveMut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
