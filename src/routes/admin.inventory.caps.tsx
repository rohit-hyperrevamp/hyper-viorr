import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Gauge, Building2, UserCog, Pencil, Save, X, Bell } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentPermissions } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { createNotification } from "@/lib/notifications";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/inventory/caps")({
  component: CapsPage,
});

type Cap = { id: string; scope_type: "branch" | "field_officer"; scope_id: string | null; min_value: number; max_value: number };
type Balance = { location_type: string; location_id: string; item_id: string; qty: number };
type Item = { id: string; standard_cost: number };
type Branch = { id: string; name: string; code: string };
type Cand = { id: string; full_name: string; employee_code: string; role_key: string };

type Status = "green" | "amber" | "red";

function statusFor(value: number, min: number, max: number): Status {
  if (max > 0 && value >= max) return "red";
  if (min > 0 && value >= min) return "amber";
  return "green";
}

function inr(n: number) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function statusBadge(s: Status) {
  if (s === "red")
    return <Badge className="bg-rose-500/15 text-rose-600 border border-rose-500/30">Cap reached</Badge>;
  if (s === "amber")
    return <Badge className="bg-amber-500/15 text-amber-700 border border-amber-500/30">Nearing cap</Badge>;
  return <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">Within limits</Badge>;
}

function CapsPage() {
  const { isSuperAdmin, roleKey, isLoading } = useCurrentPermissions();
  const isInvAdmin = isSuperAdmin || roleKey === "inventory_manager" || roleKey === "inventory";

  if (!isLoading && !isInvAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Uniform Cap" crumbs={[{ label: "Uniform Manager", to: "/admin/inventory" }, { label: "Uniform Cap" }]} icon={Gauge} />
        <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground">
          You do not have permission to manage inventory caps.
        </div>
      </div>
    );
  }

  return <CapsInner />;
}

function CapsInner() {
  const qc = useQueryClient();

  // Realtime: auto-refresh when branches, field officers, or caps change
  useEffect(() => {
    const ch = supabase
      .channel("inv-caps-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "branches" }, () => {
        qc.invalidateQueries({ queryKey: ["branches-caps"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "candidates" }, () => {
        qc.invalidateQueries({ queryKey: ["candidates-fo-caps"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "inv_caps" }, () => {
        qc.invalidateQueries({ queryKey: ["inv", "caps"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "inv_stock_balances" }, () => {
        qc.invalidateQueries({ queryKey: ["inv", "stock-all-for-caps"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [qc]);


  const { data: caps = [] } = useQuery({
    queryKey: ["inv", "caps"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_caps" as never).select("*");
      if (error) throw error;
      return (data as unknown as Cap[]) ?? [];
    },
  });
  const { data: balances = [] } = useQuery({
    queryKey: ["inv", "stock-all-for-caps"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_stock_balances" as never).select("location_type,location_id,item_id,qty");
      if (error) throw error;
      return (data as unknown as Balance[]) ?? [];
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ["inv", "items-cost"],
    queryFn: async () => {
      const { data } = await supabase.from("inv_items" as never).select("id,standard_cost");
      return (data as unknown as Item[]) ?? [];
    },
  });
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-caps"],
    queryFn: async () => {
      const { data } = await supabase.from("branches" as never).select("id,name,code").order("name");
      return (data as unknown as Branch[]) ?? [];
    },
  });
  const { data: candidates = [] } = useQuery({
    queryKey: ["candidates-fo-caps"],
    queryFn: async () => {
      const { data } = await supabase
        .from("candidates" as never)
        .select("id,full_name,employee_code,role_key")
        .eq("status", "active")
        .eq("role_key", "field_officer");
      return (data as unknown as Cand[]) ?? [];
    },
  });

  const itemCost = useMemo(() => new Map(items.map((i) => [i.id, Number(i.standard_cost || 0)])), [items]);

  const valueByLocation = useMemo(() => {
    const m = new Map<string, number>(); // key = type:id
    for (const b of balances) {
      const cost = itemCost.get(b.item_id) ?? 0;
      const key = `${b.location_type}:${b.location_id}`;
      m.set(key, (m.get(key) ?? 0) + Number(b.qty) * cost);
    }
    return m;
  }, [balances, itemCost]);

  const branchDefault = useMemo(
    () => caps.find((c) => c.scope_type === "branch" && c.scope_id === null) ?? null,
    [caps],
  );
  const foDefault = useMemo(
    () => caps.find((c) => c.scope_type === "field_officer" && c.scope_id === null) ?? null,
    [caps],
  );
  const overrideByScope = useMemo(() => {
    const m = new Map<string, Cap>();
    for (const c of caps) {
      if (c.scope_id) m.set(`${c.scope_type}:${c.scope_id}`, c);
    }
    return m;
  }, [caps]);

  type Row = { kind: "branch" | "field_officer"; id: string; name: string; sub?: string; value: number; min: number; max: number; isOverride: boolean; capRow: Cap | null };

  const branchRows: Row[] = useMemo(() => {
    return branches.map<Row>((b) => {
      const ov = overrideByScope.get(`branch:${b.id}`) ?? null;
      const min = ov?.min_value ?? branchDefault?.min_value ?? 0;
      const max = ov?.max_value ?? branchDefault?.max_value ?? 0;
      const value = valueByLocation.get(`branch:${b.id}`) ?? 0;
      return { kind: "branch", id: b.id, name: b.code ? `${b.code} – ${b.name}` : b.name, value, min, max, isOverride: !!ov, capRow: ov };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [branches, overrideByScope, branchDefault, valueByLocation]);

  const foRows: Row[] = useMemo(() => {
    return candidates.map<Row>((c) => {
      const ov = overrideByScope.get(`field_officer:${c.id}`) ?? null;
      const min = ov?.min_value ?? foDefault?.min_value ?? 0;
      const max = ov?.max_value ?? foDefault?.max_value ?? 0;
      const value = valueByLocation.get(`field_officer:${c.id}`) ?? 0;
      return {
        kind: "field_officer",
        id: c.id,
        name: c.full_name,
        sub: c.employee_code,
        value, min, max, isOverride: !!ov, capRow: ov,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [candidates, overrideByScope, foDefault, valueByLocation]);

  const [editing, setEditing] = useState<{ kind: "default" | "row"; scope: "branch" | "field_officer"; id: string | null; name: string; min: number; max: number; capRow: Cap | null } | null>(null);

  const upsert = useMutation({
    mutationFn: async (p: { scope_type: "branch" | "field_officer"; scope_id: string | null; min: number; max: number; capRow: Cap | null }) => {
      if (p.capRow) {
        const { error } = await supabase
          .from("inv_caps" as never)
          .update({ min_value: p.min, max_value: p.max } as never)
          .eq("id", p.capRow.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("inv_caps" as never)
          .insert({ scope_type: p.scope_type, scope_id: p.scope_id, min_value: p.min, max_value: p.max } as never);
        if (error) throw error;
      }
    },
    onSuccess: async (_d, vars) => {
      await qc.invalidateQueries({ queryKey: ["inv", "caps"] });
      toast.success("Cap saved");
      void logActivity({
        module: "Inventory Cap Manager",
        action: editing?.capRow ? "update" : "create",
        entityType: "inv_cap",
        entityId: editing?.capRow?.id ?? `${vars.scope_type}:${vars.scope_id ?? 'default'}`,
        entityLabel: `${vars.scope_type === 'branch' ? 'Branch' : 'Field Officer'} cap (${vars.scope_id ? 'override' : 'default'})`,
        after: { min_value: vars.min, max_value: vars.max },
        before: editing?.capRow ? { min_value: editing.capRow.min_value, max_value: editing.capRow.max_value } : null,
      });
      setEditing(null);
    },
    onError: (e: unknown) => toast.error((e as Error).message ?? "Could not save cap"),
  });

  const removeOverride = useMutation({
    mutationFn: async (capRow: Cap) => {
      const { error } = await supabase.from("inv_caps" as never).delete().eq("id", capRow.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["inv", "caps"] });
      toast.success("Override removed — using default");
    },
    onError: (e: unknown) => toast.error((e as Error).message ?? "Could not remove override"),
  });

  // ---- Alerting: auto-send (deduped per day per scope per status) on load ----
  useEffect(() => {
    if (!branchRows.length && !foRows.length) return;
    if (!branchDefault && !foDefault) return;
    void dispatchAlerts([...branchRows, ...foRows]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchRows.length, foRows.length, branchDefault?.id, foDefault?.id]);

  async function dispatchAlerts(rows: Row[]) {
    const today = new Date().toISOString().slice(0, 10);
    const alerts = rows
      .map((r) => ({ r, s: statusFor(r.value, r.min, r.max) }))
      .filter((x) => x.s !== "green");
    if (alerts.length === 0) return;

    // Resolve recipient lists
    const { data: invIdsRaw } = await supabase.rpc("get_inventory_admin_user_ids" as never);
    const invAdminIds = ((invIdsRaw as unknown) as Array<{ user_id: string }> | null)?.map((x) => x.user_id) ?? [];

    for (const { r, s } of alerts) {
      const entityId = `cap:${r.kind}:${r.id}:${s}:${today}`;
      // Dedup: skip if already a notif today for this scope+status
      const { data: existing } = await supabase
        .from("notifications" as never)
        .select("id")
        .eq("entity_type", "inventory_cap")
        .eq("entity_id", entityId)
        .limit(1);
      if (existing && (existing as unknown as { id: string }[]).length > 0) continue;

      // Resolve owner recipients
      const owners: string[] = [];
      if (r.kind === "field_officer") {
        const { data: ownerId } = await supabase.rpc("get_user_id_by_candidate" as never, { _candidate_id: r.id } as never);
        if (ownerId) owners.push(String(ownerId));
      } else {
        const { data: ownerRows } = await supabase.rpc("get_user_ids_by_branch" as never, { _branch_id: r.id } as never);
        for (const row of ((ownerRows as unknown) as Array<{ user_id: string }> | null) ?? []) owners.push(row.user_id);
      }

      const recipients = Array.from(new Set([...invAdminIds, ...owners]));
      if (recipients.length === 0) continue;

      const verb = s === "red" ? "exceeded" : "is about to reach";
      const title = s === "red" ? `Inventory cap exceeded: ${r.name}` : `Inventory cap nearing: ${r.name}`;
      const message = `${r.kind === "branch" ? "Branch" : "Field Officer"} ${r.name} ${verb} cap (current ${inr(r.value)} / max ${inr(r.max)}).`;
      await Promise.all(
        recipients.map((uid) =>
          createNotification({
            userId: uid,
            type: "inventory_cap",
            title,
            message,
            link: "/admin/inventory/caps",
            entityType: "inventory_cap",
            entityId,
          }).catch(() => null),
        ),
      );
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Uniform Cap"
        description="Hold-value limits per branch and field officer. Green = safe, amber = nearing cap, red = cap reached."
        crumbs={[{ label: "Uniform Manager", to: "/admin/inventory" }, { label: "Uniform Cap" }]}
        icon={Gauge}
        actions={
          <Button variant="outline" asChild>
            <Link to="/admin/notifications">
              <Bell className="h-4 w-4 mr-1.5" /> View alerts
            </Link>
          </Button>
        }
      />

      {/* Defaults strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DefaultCard
          icon={Building2}
          label="Branch default cap"
          cap={branchDefault}
          onEdit={() => branchDefault && setEditing({ kind: "default", scope: "branch", id: null, name: "Branch default", min: branchDefault.min_value, max: branchDefault.max_value, capRow: branchDefault })}
        />
        <DefaultCard
          icon={UserCog}
          label="Field officer default cap"
          cap={foDefault}
          onEdit={() => foDefault && setEditing({ kind: "default", scope: "field_officer", id: null, name: "Field officer default", min: foDefault.min_value, max: foDefault.max_value, capRow: foDefault })}
        />
      </div>

      <CapsTable
        title="Branches"
        icon={Building2}
        rows={branchRows}
        onEdit={(r) => setEditing({ kind: "row", scope: "branch", id: r.id, name: r.name, min: r.min, max: r.max, capRow: r.capRow })}
        onResetOverride={(r) => r.capRow && removeOverride.mutate(r.capRow)}
      />

      <CapsTable
        title="Field Officers"
        icon={UserCog}
        rows={foRows}
        onEdit={(r) => setEditing({ kind: "row", scope: "field_officer", id: r.id, name: r.name, min: r.min, max: r.max, capRow: r.capRow })}
        onResetOverride={(r) => r.capRow && removeOverride.mutate(r.capRow)}
      />

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit cap — {editing?.name}</DialogTitle>
            <DialogDescription>
              {editing?.kind === "default"
                ? "These values apply to every entity that does not have an override."
                : "Setting an override stops the default from applying for this entity."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Min cap (₹)</label>
              <Input
                type="number"
                value={editing?.min ?? 0}
                onChange={(e) => setEditing((s) => (s ? { ...s, min: Number(e.target.value) } : s))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Max cap (₹)</label>
              <Input
                type="number"
                value={editing?.max ?? 0}
                onChange={(e) => setEditing((s) => (s ? { ...s, max: Number(e.target.value) } : s))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              <X className="h-4 w-4 mr-1.5" /> Cancel
            </Button>
            <Button
              disabled={upsert.isPending || !editing || editing.max <= 0 || editing.max < editing.min}
              onClick={() =>
                editing &&
                upsert.mutate({
                  scope_type: editing.scope,
                  scope_id: editing.id,
                  min: editing.min,
                  max: editing.max,
                  capRow: editing.capRow,
                })
              }
            >
              <Save className="h-4 w-4 mr-1.5" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DefaultCard({ icon: Icon, label, cap, onEdit }: { icon: React.ComponentType<{ className?: string }>; label: string; cap: Cap | null; onEdit: () => void }) {
  return (
    <div className="rounded-2xl border bg-card p-5 flex items-center gap-4">
      <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center">
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-base font-medium">
          Min {inr(cap?.min_value ?? 0)} · Max {inr(cap?.max_value ?? 0)}
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onEdit} disabled={!cap}>
        <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
      </Button>
    </div>
  );
}

type Row = { kind: "branch" | "field_officer"; id: string; name: string; sub?: string; value: number; min: number; max: number; isOverride: boolean; capRow: Cap | null };

function CapsTable({
  title, icon: Icon, rows, onEdit, onResetOverride,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: Row[];
  onEdit: (r: Row) => void;
  onResetOverride: (r: Row) => void;
}) {
  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex items-center gap-2 px-5 py-3 border-b">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div className="font-medium">{title}</div>
        <Badge variant="outline" className="ml-2">{rows.length}</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-2.5">Name</th>
              <th className="px-5 py-2.5 text-right">Current value</th>
              <th className="px-5 py-2.5 text-right">Min cap</th>
              <th className="px-5 py-2.5 text-right">Max cap</th>
              <th className="px-5 py-2.5">Utilisation</th>
              <th className="px-5 py-2.5">Status</th>
              <th className="px-5 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = statusFor(r.value, r.min, r.max);
              const pct = r.max > 0 ? Math.min(100, Math.round((r.value / r.max) * 100)) : 0;
              const barColor = s === "red" ? "bg-rose-500" : s === "amber" ? "bg-amber-500" : "bg-emerald-500";
              return (
                <tr key={`${r.kind}-${r.id}`} className="border-t">
                  <td className="px-5 py-3">
                    <div className="font-medium">{r.name}</div>
                    {r.sub && <div className="text-xs text-muted-foreground">{r.sub}</div>}
                    {r.isOverride && <div className="text-[10px] uppercase tracking-wider text-primary mt-0.5">Override</div>}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{inr(r.value)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{inr(r.min)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{inr(r.max)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-32 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums w-10 text-right">{pct}%</div>
                    </div>
                  </td>
                  <td className="px-5 py-3">{statusBadge(s)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => onEdit(r)}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" /> {r.isOverride ? "Edit" : "Override"}
                      </Button>
                      {r.isOverride && (
                        <Button variant="ghost" size="sm" onClick={() => onResetOverride(r)}>
                          Reset
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-6 text-center text-muted-foreground">No rows.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
