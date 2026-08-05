import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

/**
 * Unauthenticated: called from the sign-in screen to decide whether the
 * caller's network is permitted. Returns only a boolean + the caller's own IP.
 */
export const checkIpAccess = createServerFn({ method: "GET" }).handler(async () => {
  const firstIp = (raw: string | null | undefined) => (raw?.split(",")[0] ?? "").trim();
  const ip =
    firstIp(getRequestHeader("cf-connecting-ip")) ||
    firstIp(getRequestHeader("x-forwarded-for")) ||
    getRequestIP({ xForwardedFor: true }) ||
    "";
  const country =
    getRequestHeader("cf-ipcountry") ??
    getRequestHeader("x-vercel-ip-country") ??
    getRequestHeader("x-country-code") ??
    "";
  const { checkRequestAccess } = await import("@/lib/ip-access.server");
  return checkRequestAccess(ip, country);
});

/** Returns the caller's public IP (used by the admin screen to add "this network"). */
export const getMyIp = createServerFn({ method: "GET" }).handler(async () => {
  const firstIp = (raw: string | null | undefined) => (raw?.split(",")[0] ?? "").trim();
  const ip =
    firstIp(getRequestHeader("cf-connecting-ip")) ||
    firstIp(getRequestHeader("x-forwarded-for")) ||
    getRequestIP({ xForwardedFor: true }) ||
    "";
  const country =
    getRequestHeader("cf-ipcountry") ??
    getRequestHeader("x-vercel-ip-country") ??
    getRequestHeader("x-country-code") ??
    "";
  const { getRequestLocation } = await import("@/lib/ip-access.server");
  return getRequestLocation(ip, country);
});
