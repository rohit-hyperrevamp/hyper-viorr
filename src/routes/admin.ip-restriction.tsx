import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Edit2, Globe, Plus, Search, ShieldBan, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMyIp } from "@/lib/ip-access.functions";
import {
  SUBNET_MASKS,
  evaluateIp,
  isValidIpv4,
  normalizeCidr,
  type IpAccessRule,
  type IpRuleMode,
} from "@/lib/ip-access";
import { logActivity } from "@/lib/activity-log";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirmAction } from "@/components/ConfirmProvider";

export const Route = createFileRoute("/admin/ip-restriction")({
  head: () => ({
    meta: [
      { title: "IP Restriction — Control Center" },
      {
        name: "description",
        content:
          "Whitelist or block IPv4 addresses and subnets that may access the application.",
      },
      { property: "og:title", content: "IP Restriction — Control Center" },
      {
        property: "og:description",
        content: "Control which networks are allowed to sign in.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IpRestrictionPage,
});

const QK = ["admin", "ip-access-rules"] as const;
const MODULE = "IP Restriction";

type Draft = {
  label: string;
  ip: string;
  bits: number;
  mode: IpRuleMode;
  is_active: boolean;
  notes: string;
};

const emptyDraft: Draft = {
  label: "",
  ip: "",
  bits: 32,
  mode: "allow",
  is_active: true,
  notes: "",
};

function IpRestrictionPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IpAccessRule | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [myIp, setMyIp] = useState("");

  useEffect(() => {
    void getMyIp()
      .then((r) => setMyIp(r.ip ?? ""))
      .catch(() => setMyIp(""));
  }, []);

  const { data: rules = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<IpAccessRule[]> => {
      const { data, error } = await supabase
        .from("ip_access_rules" as never)
        .select("id,label,ip_cidr,mode,is_active,notes")
        .order("mode", { ascending: true })
        .order("ip_cidr", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        label: String(r.label ?? ""),
        ip_cidr: String(r.ip_cidr ?? ""),
        mode: r.mode === "deny" ? "deny" : "allow",
        is_active: Boolean(r.is_active),
        notes: String(r.notes ?? ""),
      }));
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const saveMut = useMutation({
    mutationFn: async ({ id, d }: { id?: string; d: Draft }) => {
      if (!isValidIpv4(d.ip)) throw new Error("Enter a valid IPv4 address");
      const cidr = normalizeCidr(`${d.ip.trim()}/${d.bits}`);
      const row = {
        label: d.label.trim(),
        ip_cidr: cidr,
        mode: d.mode,
        is_active: d.is_active,
        notes: d.notes.trim() || null,
      };
      if (id) {
        const { error } = await supabase
          .from("ip_access_rules" as never)
          .update(row as never)
          .eq("id", id);
        if (error) throw error;
        void logActivity({
          module: MODULE,
          action: "update",
          entityType: "ip_access_rules",
          entityId: id,
          entityLabel: cidr,
          details: row as Record<string, unknown>,
        });
      } else {
        const { error } = await supabase
          .from("ip_access_rules" as never)
          .insert(row as never);
        if (error) throw error;
        void logActivity({
          module: MODULE,
          action: "create",
          entityType: "ip_access_rules",
          entityLabel: cidr,
          details: row as Record<string, unknown>,
        });
      }
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast.success("Rule saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save rule"),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ rule, active }: { rule: IpAccessRule; active: boolean }) => {
      const { error } = await supabase
        .from("ip_access_rules" as never)
        .update({ is_active: active } as never)
        .eq("id", rule.id);
      if (error) throw error;
      void logActivity({
        module: MODULE,
        action: active ? "enable" : "disable",
        entityType: "ip_access_rules",
        entityId: rule.id,
        entityLabel: rule.ip_cidr,
        details: { is_active: active },
      });
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async (rule: IpAccessRule) => {
      const { error } = await supabase
        .from("ip_access_rules" as never)
        .delete()
        .eq("id", rule.id);
      if (error) throw error;
      void logActivity({
        module: MODULE,
        action: "delete",
        entityType: "ip_access_rules",
        entityId: rule.id,
        entityLabel: rule.ip_cidr,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Rule removed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter(
      (r) =>
        r.ip_cidr.toLowerCase().includes(q) ||
        r.label.toLowerCase().includes(q) ||
        r.notes.toLowerCase().includes(q),
    );
  }, [rules, query]);

  const activeAllow = rules.filter((r) => r.is_active && r.mode === "allow").length;
  const activeDeny = rules.filter((r) => r.is_active && r.mode === "deny").length;
  const myDecision = myIp ? evaluateIp(myIp, rules) : null;

  function openAdd(prefillIp?: string) {
    setEditing(null);
    setDraft({ ...emptyDraft, ip: prefillIp ?? "" });
    setDialogOpen(true);
  }

  function openEdit(rule: IpAccessRule) {
    const [ip, bits] = rule.ip_cidr.split("/");
    setEditing(rule);
    setDraft({
      label: rule.label,
      ip: ip ?? "",
      bits: Number(bits ?? 32),
      mode: rule.mode,
      is_active: rule.is_active,
      notes: rule.notes,
    });
    setDialogOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="IP Restriction"
        description="Control which networks may sign in. Add a whitelist to lock access down to your offices, or block specific networks."
        crumbs={[
          { label: "Control Center", to: "/admin/control-center" },
          { label: "IP Restriction" },
        ]}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Mode
          </div>
          <div className="mt-1 text-base font-bold text-foreground">
            {activeAllow > 0 ? "Whitelist enforced" : "Open (deny-list only)"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeAllow > 0
              ? `Only ${activeAllow} allowed network${activeAllow === 1 ? "" : "s"} can sign in.`
              : "Add an allow rule to restrict sign-in to your networks only."}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Active rules
          </div>
          <div className="mt-1 text-base font-bold text-foreground">
            {activeAllow} allowed · {activeDeny} blocked
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Blocked rules always win over allowed rules.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Your current IP
          </div>
          <div className="mt-1 font-mono text-base font-bold text-foreground">
            {myIp || "—"}
          </div>
          <div className="mt-1 flex items-center gap-2">
            {myDecision ? (
              <Badge
                variant="outline"
                className={
                  myDecision.allowed
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                    : "border-destructive/40 bg-destructive/10 text-destructive"
                }
              >
                {myDecision.allowed ? "Allowed" : "Would be blocked"}
              </Badge>
            ) : null}
            {myIp ? (
              <button
                type="button"
                className="text-xs font-semibold text-accent hover:underline"
                onClick={() => openAdd(myIp)}
              >
                Add this network
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search IP, subnet or label…"
            className="h-10 rounded-lg pl-9"
          />
        </div>
        <Button onClick={() => openAdd()} className="h-10 rounded-lg font-semibold">
          <Plus className="mr-1.5 h-4 w-4" />
          Add rule
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="ios-table w-full text-sm">
          <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-5 py-3">IP / Subnet</th>
              <th className="px-5 py-3">Label</th>
              <th className="px-5 py-3">Access</th>
              <th className="px-5 py-3">Active</th>
              <th className="px-5 py-3 text-right" data-col="actions">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-secondary/30">
                <td className="px-5 py-3 font-mono font-medium text-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    {r.ip_cidr}
                  </span>
                </td>
                <td className="px-5 py-3 text-foreground/90">{r.label || "—"}</td>
                <td className="px-5 py-3">
                  <Badge
                    variant="outline"
                    className={
                      r.mode === "allow"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                        : "border-destructive/40 bg-destructive/10 text-destructive"
                    }
                  >
                    {r.mode === "allow" ? (
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    ) : (
                      <ShieldBan className="mr-1 h-3.5 w-3.5" />
                    )}
                    {r.mode === "allow" ? "Allowed" : "Blocked"}
                  </Badge>
                </td>
                <td className="px-5 py-3">
                  <Switch
                    checked={r.is_active}
                    onCheckedChange={(v) => toggleMut.mutate({ rule: r, active: v })}
                  />
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(r)}
                      aria-label="Edit rule"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      aria-label="Delete rule"
                      onClick={async () => {
                        const ok = await confirmAction({
                          title: "Remove rule?",
                          description: `${r.ip_cidr} will no longer be ${r.mode === "allow" ? "allowed" : "blocked"}.`,
                          confirmText: "Remove",
                        });
                        if (ok) deleteMut.mutate(r);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No rules yet — access is open to every network.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit rule" : "Add rule"}</DialogTitle>
            <DialogDescription>
              Enter an IPv4 address and pick a subnet mask. Blocked rules always take
              priority; once any allowed rule is active, every other network is refused.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Label</Label>
              <Input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="Head office — Pune"
                className="h-10"
              />
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="grid gap-1.5">
                <Label>IPv4 address</Label>
                <Input
                  value={draft.ip}
                  onChange={(e) =>
                    setDraft({ ...draft, ip: e.target.value.replace(/[^\d.]/g, "") })
                  }
                  placeholder="203.0.113.10"
                  inputMode="decimal"
                  className="h-10 font-mono"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Subnet</Label>
                <Select
                  value={String(draft.bits)}
                  onValueChange={(v) => setDraft({ ...draft, bits: Number(v) })}
                >
                  <SelectTrigger className="h-10 w-[230px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBNET_MASKS.map((m) => (
                      <SelectItem key={m.value} value={String(m.value)}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Access</Label>
              <Select
                value={draft.mode}
                onValueChange={(v) => setDraft({ ...draft, mode: v as IpRuleMode })}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow (whitelist)</SelectItem>
                  <SelectItem value="deny">Reject (blacklist)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Input
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Optional"
                className="h-10"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Active</div>
                <p className="text-xs text-muted-foreground">
                  Inactive rules are ignored during sign-in checks.
                </p>
              </div>
              <Switch
                checked={draft.is_active}
                onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
              />
            </div>

            {isValidIpv4(draft.ip) ? (
              <p className="text-xs text-muted-foreground">
                Saves as{" "}
                <span className="font-mono font-semibold text-foreground">
                  {normalizeCidr(`${draft.ip}/${draft.bits}`)}
                </span>
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={saveMut.isPending || !isValidIpv4(draft.ip)}
              onClick={() => saveMut.mutate({ id: editing?.id, d: draft })}
            >
              Save rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
