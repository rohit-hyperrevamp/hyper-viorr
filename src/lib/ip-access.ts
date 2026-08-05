// Client-safe helpers for IPv4 / subnet access rules.

export type IpRuleMode = "allow" | "deny";

export type IpAccessRule = {
  id: string;
  label: string;
  ip_cidr: string;
  mode: IpRuleMode;
  is_active: boolean;
  notes: string;
};

/** Common subnet masks offered in the UI dropdown. */
export const SUBNET_MASKS = [
  { value: 32, label: "/32 — single IP (1 address)" },
  { value: 31, label: "/31 — 2 addresses" },
  { value: 30, label: "/30 — 4 addresses" },
  { value: 29, label: "/29 — 8 addresses" },
  { value: 28, label: "/28 — 16 addresses" },
  { value: 27, label: "/27 — 32 addresses" },
  { value: 26, label: "/26 — 64 addresses" },
  { value: 25, label: "/25 — 128 addresses" },
  { value: 24, label: "/24 — 256 addresses (class C)" },
  { value: 23, label: "/23 — 512 addresses" },
  { value: 22, label: "/22 — 1,024 addresses" },
  { value: 21, label: "/21 — 2,048 addresses" },
  { value: 20, label: "/20 — 4,096 addresses" },
  { value: 16, label: "/16 — 65,536 addresses (class B)" },
  { value: 8, label: "/8 — 16,777,216 addresses (class A)" },
] as const;

export function isValidIpv4(ip: string): boolean {
  const parts = (ip ?? "").trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

/** Converts common proxy forms such as ::ffff:192.0.2.10 and 192.0.2.10:443. */
export function normalizeIpv4(value: string): string {
  const raw = (value ?? "").trim().replace(/^\[|\]$/g, "");
  const mapped = raw.toLowerCase().startsWith("::ffff:") ? raw.slice(7) : raw;
  const withoutPort = /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(mapped)
    ? mapped.slice(0, mapped.lastIndexOf(":"))
    : mapped;
  return withoutPort.trim();
}

function ipToLong(ip: string): number | null {
  const normalized = normalizeIpv4(ip);
  if (!isValidIpv4(normalized)) return null;
  return normalized
    .split(".")
    .reduce((acc, p) => (acc << 8) + Number(p), 0) >>> 0;
}

/** Parses "192.168.1.0/24" or a bare "192.168.1.10" (implicit /32). */
export function parseCidr(value: string): { base: number; bits: number } | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const [ipPart, maskPart] = raw.split("/");
  const base = ipToLong(ipPart ?? "");
  if (base === null) return null;
  const bits = maskPart === undefined ? 32 : Number(maskPart);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  return { base, bits };
}

export function isValidCidr(value: string): boolean {
  return parseCidr(value) !== null;
}

/** Network address of a CIDR, e.g. 192.168.1.55/24 -> 192.168.1.0/24 */
export function normalizeCidr(value: string): string {
  const parsed = parseCidr(value);
  if (!parsed) return (value ?? "").trim();
  const mask = parsed.bits === 0 ? 0 : (0xffffffff << (32 - parsed.bits)) >>> 0;
  const net = (parsed.base & mask) >>> 0;
  const octets = [24, 16, 8, 0].map((s) => (net >>> s) & 255);
  return `${octets.join(".")}/${parsed.bits}`;
}

export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const addr = ipToLong(ip);
  const parsed = parseCidr(cidr);
  if (addr === null || !parsed) return false;
  if (parsed.bits === 0) return true;
  const mask = (0xffffffff << (32 - parsed.bits)) >>> 0;
  return ((addr & mask) >>> 0) === ((parsed.base & mask) >>> 0);
}

export type IpDecision = {
  allowed: boolean;
  reason: "no_rules" | "denied" | "not_whitelisted" | "whitelisted" | "default_allow";
  matchedRule?: string;
};

/**
 * Policy:
 *  - An active deny rule always wins (blacklist).
 *  - If at least one active allow rule exists, the network is a strict
 *    whitelist: anything not matching is rejected.
 *  - With no active allow rules, everything not explicitly denied is allowed.
 */
export function evaluateIp(ip: string, rules: IpAccessRule[]): IpDecision {
  const active = rules.filter((r) => r.is_active);
  if (active.length === 0) return { allowed: true, reason: "no_rules" };

  const deny = active.find((r) => r.mode === "deny" && ipMatchesCidr(ip, r.ip_cidr));
  if (deny) return { allowed: false, reason: "denied", matchedRule: deny.ip_cidr };

  const allowRules = active.filter((r) => r.mode === "allow");
  if (allowRules.length === 0) return { allowed: true, reason: "default_allow" };

  const hit = allowRules.find((r) => ipMatchesCidr(ip, r.ip_cidr));
  return hit
    ? { allowed: true, reason: "whitelisted", matchedRule: hit.ip_cidr }
    : { allowed: false, reason: "not_whitelisted" };
}

export const ACCESS_BLOCKED_MESSAGE =
  "Access to this application is restricted from your current location or network.";
