import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { evaluateIp, type IpAccessRule } from "@/lib/ip-access";

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

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    return { allowed: decision.allowed, ip };
  } catch {
    // Fail open — never lock everyone out because of an infrastructure issue.
    return { allowed: true, ip };
  }
});

/** Returns the caller's public IP (used by the admin screen to add "this network"). */
export const getMyIp = createServerFn({ method: "GET" }).handler(async () => {
  const ip =
    firstPublicIp(getRequestHeader("cf-connecting-ip")) ||
    firstPublicIp(getRequestHeader("x-forwarded-for")) ||
    getRequestIP({ xForwardedFor: true }) ||
    "";
  return { ip };
});
