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

export async function checkRequestAccess(rawIp: string, rawHeaderCountry: string) {
  const ip = normalizeIpv4(rawIp.split(",")[0] ?? "");

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
    const ipDecision = evaluateIp(ip, rules);
    const country = await resolveCountry(ip, rawHeaderCountry);
    const geoDecision = evaluateCountry(country, geoRules);

    // Once an IP allow-list exists, the canonical client IP must match it.
    // Unknown, malformed, or non-matching addresses are denied.
    if (!ipDecision.allowed) {
      return { allowed: false, ip, country, layer: "ip" as const };
    }
    if (!geoDecision.allowed) {
      return { allowed: false, ip, country, layer: "geo" as const };
    }
    return { allowed: true, ip, country, layer: "ip" as const };
  } catch (error) {
    console.error("[HyperAuth] Access evaluation failed", {
      ip,
      error: error instanceof Error ? error.message : String(error),
    });
    // Access-control failures must never become authentication bypasses.
    return { allowed: false, ip, country: "", layer: "error" as const };
  }
}

export async function getRequestLocation(ip: string, rawHeaderCountry: string) {
  return { ip, country: await resolveCountry(ip, rawHeaderCountry) };
}