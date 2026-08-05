import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { evaluateIp, type IpAccessRule } from "@/lib/ip-access";
import { evaluateCountry, type GeoAccessRule } from "@/lib/geo-access";

function firstPublicIp(raw: string | null | undefined): string {
  if (!raw) return "";
  return (raw.split(",")[0] ?? "").trim();
}

/**
 * Unauthenticated: called from the sign-in screen to decide whether the
 * caller's network is permitted. Returns only a boolean + the caller's own IP.
 */
export const checkIpAccess = createServerFn({ method: "GET" }).handler(async () => {
  const ip =
    firstPublicIp(getRequestHeader("cf-connecting-ip")) ||
    firstPublicIp(getRequestHeader("x-forwarded-for")) ||
    getRequestIP({ xForwardedFor: true }) ||
    "";

  const country = (getRequestHeader("cf-ipcountry") ?? "").trim().toUpperCase();

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Layer 1 — country gate. Evaluated before the network gate.
    const { data: geoData, error: geoError } = await supabaseAdmin
      .from("geo_access_rules")
      .select("id,country_code,country_name,mode,is_active,notes");
    if (geoError) throw geoError;
    const geoRules = ((geoData ?? []) as unknown as Record<string, unknown>[]).map(
      (r): GeoAccessRule => ({
        id: String(r.id),
        country_code: String(r.country_code ?? "").toUpperCase(),
        country_name: String(r.country_name ?? ""),
        mode: r.mode === "deny" ? "deny" : "allow",
        is_active: Boolean(r.is_active),
        notes: String(r.notes ?? ""),
      }),
    );
    const geoDecision = evaluateCountry(country, geoRules);
    if (!geoDecision.allowed) return { allowed: false, ip, country, layer: "geo" as const };

    // Layer 2 — network gate.
    const { data, error } = await supabaseAdmin
      .from("ip_access_rules")
      .select("id,label,ip_cidr,mode,is_active,notes");
    if (error) throw error;

    const rules = ((data ?? []) as unknown as Record<string, unknown>[]).map(
      (r): IpAccessRule => ({
        id: String(r.id),
        label: String(r.label ?? ""),
        ip_cidr: String(r.ip_cidr ?? ""),
        mode: r.mode === "deny" ? "deny" : "allow",
        is_active: Boolean(r.is_active),
        notes: String(r.notes ?? ""),
      }),
    );

    const decision = evaluateIp(ip, rules);
    return { allowed: decision.allowed, ip, country, layer: "ip" as const };
  } catch {
    // Fail open — never lock everyone out because of an infrastructure issue.
    return { allowed: true, ip, country, layer: "none" as const };
  }
});

/** Returns the caller's public IP (used by the admin screen to add "this network"). */
export const getMyIp = createServerFn({ method: "GET" }).handler(async () => {
  const ip =
    firstPublicIp(getRequestHeader("cf-connecting-ip")) ||
    firstPublicIp(getRequestHeader("x-forwarded-for")) ||
    getRequestIP({ xForwardedFor: true }) ||
    "";
  const country = (getRequestHeader("cf-ipcountry") ?? "").trim().toUpperCase();
  return { ip, country };
});
