import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Globe2, Network, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/admin/hyperauth")({
  head: () => ({
    meta: [
      { title: "HyperAuth — Access Control" },
      {
        name: "description",
        content:
          "Layered sign-in security: country (geo) restriction first, then IPv4 / subnet restriction.",
      },
      { property: "og:title", content: "HyperAuth — Access Control" },
      {
        property: "og:description",
        content: "Country and network level sign-in restrictions in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HyperAuthPage,
});

function HyperAuthPage() {
  const { data: counts } = useQuery({
    queryKey: ["admin", "hyperauth", "counts"],
    queryFn: async () => {
      const [geo, ip] = await Promise.all([
        supabase
          .from("geo_access_rules" as never)
          .select("id,mode,is_active"),
        supabase.from("ip_access_rules" as never).select("id,mode,is_active"),
      ]);
      const g = ((geo.data ?? []) as unknown as Record<string, unknown>[]).filter(
        (r) => Boolean(r.is_active),
      );
      const i = ((ip.data ?? []) as unknown as Record<string, unknown>[]).filter((r) =>
        Boolean(r.is_active),
      );
      return {
        geoAllow: g.filter((r) => r.mode !== "deny").length,
        geoDeny: g.filter((r) => r.mode === "deny").length,
        ipAllow: i.filter((r) => r.mode !== "deny").length,
        ipDeny: i.filter((r) => r.mode === "deny").length,
      };
    },
  });

  const tiles = [
    {
      to: "/admin/country-restriction" as const,
      order: "Layer 1",
      label: "Country Restriction",
      description:
        "Pick the countries allowed to reach the sign-in screen. Everything outside the selection is rejected.",
      icon: Globe2,
      stat: counts
        ? `${counts.geoAllow} allowed · ${counts.geoDeny} blocked`
        : "—",
    },
    {
      to: "/admin/ip-restriction" as const,
      order: "Layer 2",
      label: "IP Restriction",
      description:
        "Whitelist office IPs/subnets or block networks. Applied only after the country check passes.",
      icon: Network,
      stat: counts ? `${counts.ipAllow} allowed · ${counts.ipDeny} blocked` : "—",
    },
  ];

  return (
    <div>
      <PageHeader
        title="HyperAuth"
        description="Layered sign-in security — country first, then network."
        crumbs={[{ label: "Control Center", to: "/admin/control-center" }, { label: "HyperAuth" }]}
      />

      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-border bg-card/60 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <p className="text-sm text-muted-foreground">
          A sign-in attempt must clear <span className="font-semibold text-foreground">Layer 1</span>{" "}
          (country) before <span className="font-semibold text-foreground">Layer 2</span> (network) is
          evaluated. Blocked users only see a generic message — the mechanism is never revealed.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className="group relative flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-accent/40 hover:bg-accent/5"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <tile.icon className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {tile.order}
              </span>
            </div>
            <div>
              <div className="font-display text-base font-bold tracking-tight text-foreground">
                {tile.label}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{tile.description}</p>
            </div>
            <div className="text-xs font-semibold text-foreground/70">{tile.stat}</div>
            <div className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-accent">
              Open
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
