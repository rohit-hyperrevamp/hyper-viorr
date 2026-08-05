import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Globe2, MapPin, Search, ShieldBan, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMyIp } from "@/lib/ip-access.functions";
import {
  COUNTRIES,
  countryFlag,
  countryName,
  evaluateCountry,
  type GeoAccessRule,
  type GeoRuleMode,
} from "@/lib/geo-access";
import { logActivity } from "@/lib/activity-log";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { confirmAction } from "@/components/ConfirmProvider";

export const Route = createFileRoute("/admin/country-restriction")({
  head: () => ({
    meta: [
      { title: "Country Restriction — HyperAuth" },
      {
        name: "description",
        content:
          "Select the countries allowed to sign in. Sign-in attempts from anywhere else are rejected before the network check.",
      },
      { property: "og:title", content: "Country Restriction — HyperAuth" },
      {
        property: "og:description",
        content: "Geo-fence sign-in to the countries you operate from.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CountryRestrictionPage,
});

const QK = ["admin", "geo-access-rules"] as const;
const MODULE = "Country Restriction";

function CountryRestrictionPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [myCountry, setMyCountry] = useState("");

  useEffect(() => {
    void getMyIp()
      .then((r) => setMyCountry(r.country ?? ""))
      .catch(() => setMyCountry(""));
  }, []);

  const { data: rules = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<GeoAccessRule[]> => {
      const { data, error } = await supabase
        .from("geo_access_rules" as never)
        .select("id,country_code,country_name,mode,is_active,notes")
        .order("country_name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        country_code: String(r.country_code ?? "").toUpperCase(),
        country_name: String(r.country_name ?? ""),
        mode: r.mode === "deny" ? "deny" : "allow",
        is_active: Boolean(r.is_active),
        notes: String(r.notes ?? ""),
      }));
    },
  });

  const ruleByCode = useMemo(() => {
    const m = new Map<string, GeoAccessRule>();
    rules.forEach((r) => m.set(r.country_code, r));
    return m;
  }, [rules]);

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const setRule = useMutation({
    mutationFn: async ({ code, mode }: { code: string; mode: GeoRuleMode | null }) => {
      const existing = ruleByCode.get(code);
      if (mode === null) {
        if (!existing) return;
        const { error } = await supabase
          .from("geo_access_rules" as never)
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
        void logActivity({
          module: MODULE,
          action: "delete",
          entityType: "geo_access_rules",
          entityId: existing.id,
          entityLabel: countryName(code),
        });
        return;
      }
      const row = {
        country_code: code,
        country_name: countryName(code),
        mode,
        is_active: true,
        notes: "",
      };
      if (existing) {
        const { error } = await supabase
          .from("geo_access_rules" as never)
          .update({ mode, is_active: true } as never)
          .eq("id", existing.id);
        if (error) throw error;
        void logActivity({
          module: MODULE,
          action: "update",
          entityType: "geo_access_rules",
          entityId: existing.id,
          entityLabel: countryName(code),
          details: { mode },
        });
      } else {
        const { error } = await supabase
          .from("geo_access_rules" as never)
          .insert(row as never);
        if (error) throw error;
        void logActivity({
          module: MODULE,
          action: "create",
          entityType: "geo_access_rules",
          entityLabel: countryName(code),
          details: row as Record<string, unknown>,
        });
      }
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save country rule"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ rule, active }: { rule: GeoAccessRule; active: boolean }) => {
      const { error } = await supabase
        .from("geo_access_rules" as never)
        .update({ is_active: active } as never)
        .eq("id", rule.id);
      if (error) throw error;
      void logActivity({
        module: MODULE,
        action: active ? "enable" : "disable",
        entityType: "geo_access_rules",
        entityId: rule.id,
        entityLabel: rule.country_name || rule.country_code,
        details: { is_active: active },
      });
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? COUNTRIES.filter(
          (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
        )
      : COUNTRIES;
    return list.slice(0, q ? 300 : COUNTRIES.length);
  }, [query]);

  const allowed = rules.filter((r) => r.mode === "allow");
  const denied = rules.filter((r) => r.mode === "deny");
  const activeAllow = allowed.filter((r) => r.is_active);
  const myDecision = evaluateCountry(myCountry, rules);

  const applyIndiaOnly = async () => {
    const ok = await confirmAction({
      title: "Allow India only?",
      description:
        "India will be whitelisted and every other country will be blocked from signing in. Existing country rules are replaced.",
      confirmText: "Apply",
    });
    if (!ok) return;
    try {
      if (rules.length) {
        const { error } = await supabase
          .from("geo_access_rules" as never)
          .delete()
          .in(
            "id",
            rules.map((r) => r.id),
          );
        if (error) throw error;
      }
      const { error } = await supabase.from("geo_access_rules" as never).insert({
        country_code: "IN",
        country_name: "India",
        mode: "allow",
        is_active: true,
        notes: "India-only sign-in policy",
      } as never);
      if (error) throw error;
      void logActivity({
        module: MODULE,
        action: "update",
        entityType: "geo_access_rules",
        entityLabel: "India-only policy",
      });
      invalidate();
      toast.success("Sign-in restricted to India");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply policy");
    }
  };

  return (
    <div>
      <PageHeader
        title="Country Restriction"
        description="Layer 1 of HyperAuth — only the selected countries may reach sign-in."
        crumbs={[
          { label: "Control Center", to: "/admin/control-center" },
          { label: "HyperAuth", to: "/admin/hyperauth" },
          { label: "Country Restriction" },
        ]}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Policy
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">
            {activeAllow.length === 0
              ? denied.length
                ? "Blocklist — all countries except blocked ones"
                : "Open — no country restriction"
              : `Whitelist — ${activeAllow.length} ${activeAllow.length === 1 ? "country" : "countries"} allowed`}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Your location
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-foreground">
            <MapPin className="h-4 w-4 text-accent" />
            {myCountry ? `${countryFlag(myCountry)} ${countryName(myCountry)}` : "Unknown"}
            <Badge variant={myDecision.allowed ? "secondary" : "destructive"}>
              {myDecision.allowed ? "Allowed" : "Blocked"}
            </Badge>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quick policy
          </div>
          <Button size="sm" className="mt-2" onClick={() => void applyIndiaOnly()}>
            <Globe2 className="mr-1.5 h-4 w-4" /> India only
          </Button>
        </div>
      </div>

      {rules.length > 0 && (
        <div className="mb-5 rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 text-sm font-semibold text-foreground">Active country rules</div>
          <div className="flex flex-wrap gap-2">
            {rules.map((r) => (
              <div
                key={r.id}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                  r.mode === "deny"
                    ? "border-destructive/40 bg-destructive/10"
                    : "border-accent/40 bg-accent/10"
                } ${r.is_active ? "" : "opacity-50"}`}
              >
                <span>{countryFlag(r.country_code)}</span>
                <span className="font-medium text-foreground">
                  {r.country_name || countryName(r.country_code)}
                </span>
                <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                  {r.mode === "deny" ? "blocked" : "allowed"}
                </span>
                <Switch
                  checked={r.is_active}
                  onCheckedChange={(v) => toggleActive.mutate({ rule: r, active: v })}
                />
                <button
                  type="button"
                  aria-label={`Remove ${r.country_name}`}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  onClick={() => setRule.mutate({ code: r.country_code, mode: null })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-foreground">World selection</div>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country…"
              className="pl-9"
            />
          </div>
        </div>

        <div className="grid max-h-[520px] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const rule = ruleByCode.get(c.code);
            const isAllowed = rule?.mode === "allow";
            const isDenied = rule?.mode === "deny";
            return (
              <div
                key={c.code}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
                  isAllowed
                    ? "border-accent/50 bg-accent/10"
                    : isDenied
                      ? "border-destructive/50 bg-destructive/10"
                      : "border-border bg-background/40"
                }`}
              >
                <span className="text-base">{c.flag}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{c.name}</span>
                <span className="text-[11px] font-semibold text-muted-foreground">{c.code}</span>
                <Button
                  size="icon"
                  variant={isAllowed ? "default" : "ghost"}
                  aria-label={`Allow ${c.name}`}
                  title="Allow"
                  className="h-7 w-7"
                  onClick={() =>
                    setRule.mutate({ code: c.code, mode: isAllowed ? null : "allow" })
                  }
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant={isDenied ? "destructive" : "ghost"}
                  aria-label={`Block ${c.name}`}
                  title="Block"
                  className="h-7 w-7"
                  onClick={() => setRule.mutate({ code: c.code, mode: isDenied ? null : "deny" })}
                >
                  <ShieldBan className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
