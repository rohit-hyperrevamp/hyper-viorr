import { evaluateCountry, type GeoAccessRule } from "@/lib/geo-access";
import { evaluateIp, type IpAccessRule } from "@/lib/ip-access";

async function resolveCountry(ip: string, rawHeaderCountry: string): Promise<string> {
  const headerCountry = rawHeaderCountry.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(headerCountry)) return headerCountry;
  if (!ip) return "";

  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code`, {
      signal: AbortSignal.timeout(2500),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return "";
    const payload = (await response.json()) as { success?: boolean; country_code?: string };
    const country = String(payload.country_code ?? "").trim().toUpperCase();
    return payload.success !== false && /^[A-Z]{2}$/.test(country) ? country : "";
  } catch {
    return "";
  }
}

export async function checkRequestAccess(ip: string, rawHeaderCountry: string) {
  const country = await resolveCountry(ip, rawHeaderCountry);

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
    const geoDecision = evaluateCountry(country, geoRules);
    if (!geoDecision.allowed) return { allowed: false, ip, country, layer: "geo" as const };

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
    return { allowed: evaluateIp(ip, rules).allowed, ip, country, layer: "ip" as const };
  } catch {
    return { allowed: true, ip, country, layer: "none" as const };
  }
}

export async function getRequestLocation(ip: string, rawHeaderCountry: string) {
  return { ip, country: await resolveCountry(ip, rawHeaderCountry) };
}