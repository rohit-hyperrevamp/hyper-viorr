import { evaluateCountry, type GeoAccessRule } from "@/lib/geo-access";
import { evaluateIp, normalizeIpv4, type IpAccessRule } from "@/lib/ip-access";

async function resolveCountry(ip: string, rawHeaderCountry: string): Promise<string> {
  const headerCountry = rawHeaderCountry.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(headerCountry)) return headerCountry;
  if (!ip) return "";

  const lookups = [
    async () => {
      const response = await fetch(
        `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code`,
        { signal: AbortSignal.timeout(2500), headers: { accept: "application/json" } },
      );
      if (!response.ok) return "";
      const payload = (await response.json()) as { success?: boolean; country_code?: string };
      return payload.success === false ? "" : String(payload.country_code ?? "");
    },
    async () => {
      const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, {
        signal: AbortSignal.timeout(2500),
        headers: { accept: "text/plain" },
      });
      return response.ok ? response.text() : "";
    },
  ];

  for (const lookup of lookups) {
    try {
      const country = (await lookup()).trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(country)) return country;
    } catch {
      // Try the next independent provider.
    }
  }
  return "";
}

export async function checkRequestAccess(rawIps: string | string[], rawHeaderCountry: string) {
  const ips = (Array.isArray(rawIps) ? rawIps : [rawIps])
    .flatMap((value) => value.split(","))
    .map(normalizeIpv4)
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
  const fallbackIp = ips[0] ?? "";

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: geoData, error: geoError } = await supabaseAdmin
      .from("geo_access_rules")
      .select("id,country_code,country_name,mode,is_active,notes");
    if (geoError) throw geoError;
    const geoRules = ((geoData ?? []) as unknown as Record<string, unknown>[]).map(
      (rule): GeoAccessRule => ({
        id: String(rule.id),
        country_code: String(rule.country_code ?? "").toUpperCase(),
        country_name: String(rule.country_name ?? ""),
        mode: rule.mode === "deny" ? "deny" : "allow",
        is_active: Boolean(rule.is_active),
        notes: String(rule.notes ?? ""),
      }),
    );
    const { data, error } = await supabaseAdmin
      .from("ip_access_rules")
      .select("id,label,ip_cidr,mode,is_active,notes");
    if (error) throw error;
    const rules = ((data ?? []) as unknown as Record<string, unknown>[]).map(
      (rule): IpAccessRule => ({
        id: String(rule.id),
        label: String(rule.label ?? ""),
        ip_cidr: String(rule.ip_cidr ?? ""),
        mode: rule.mode === "deny" ? "deny" : "allow",
        is_active: Boolean(rule.is_active),
        notes: String(rule.notes ?? ""),
      }),
    );
    const decisions = ips.map((ip) => ({ ip, decision: evaluateIp(ip, rules) }));
    const denied = decisions.find(({ decision }) => decision.reason === "denied");
    const whitelisted = decisions.find(({ decision }) => decision.reason === "whitelisted");
    const selected = denied ?? whitelisted ?? decisions[0] ?? {
      ip: fallbackIp,
      decision: evaluateIp(fallbackIp, rules),
    };
    const ip = selected.ip;
    const ipDecision = selected.decision;
    const country = await resolveCountry(ip, rawHeaderCountry);
    const geoDecision = evaluateCountry(country, geoRules);

    // An explicit IP/subnet rule is authoritative. In production there can be
    // multiple trusted proxies, so any forwarded client address matching the
    // allow-list must pass regardless of a proxy's geo header. Explicit deny
    // rules retain highest priority.
    if (ipDecision.reason === "denied") {
      return { allowed: false, ip, country, layer: "ip" as const };
    }
    if (ipDecision.reason === "whitelisted") {
      return { allowed: true, ip, country, layer: "ip" as const };
    }
    if (country && !geoDecision.allowed) {
      return { allowed: false, ip, country, layer: "geo" as const };
    }
    // Some production custom-domain proxies do not preserve the original
    // client address or country. In that case the address above belongs to
    // hosting infrastructure, not the person signing in, so it must not be
    // used to deny access. HyperAuth is intentionally fail-open when the
    // request identity cannot be established reliably.
    if (!country) {
      return { allowed: true, ip, country, layer: "unavailable" as const };
    }
    return { allowed: ipDecision.allowed, ip, country, layer: "ip" as const };
  } catch (error) {
    console.error("[HyperAuth] Access evaluation failed", {
      ip: fallbackIp,
      error: error instanceof Error ? error.message : String(error),
    });
    // A backend/configuration outage must never lock every user out of the
    // application. Explicit, successfully evaluated deny rules still block
    // above; evaluation failures are fail-open by policy.
    return { allowed: true, ip: fallbackIp, country: "", layer: "error" as const };
  }
}

export async function getRequestLocation(ip: string, rawHeaderCountry: string) {
  return { ip, country: await resolveCountry(ip, rawHeaderCountry) };
}