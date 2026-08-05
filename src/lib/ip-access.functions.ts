import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

/**
 * Unauthenticated: called from the sign-in screen to decide whether the
 * caller's network is permitted. Returns only a boolean + the caller's own IP.
 */
export const checkIpAccess = createServerFn({ method: "GET" }).handler(async () => {
  // The edge-provided client header is authoritative. For X-Forwarded-For,
  // only the left-most address is the originating client; never scan later
  // proxy hops for an allow-list match.
  const rawIp =
    getRequestHeader("cf-connecting-ip") ??
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
    getRequestHeader("x-real-ip") ??
    getRequestIP({ xForwardedFor: true }) ??
    "";
  const country =
    getRequestHeader("cf-ipcountry") ??
    getRequestHeader("x-vercel-ip-country") ??
    getRequestHeader("x-country-code") ??
    "";
  const { checkRequestAccess } = await import("@/lib/ip-access.server");
  return checkRequestAccess(rawIp, country);
});

/** Returns the caller's public IP (used by the admin screen to add "this network"). */
export const getMyIp = createServerFn({ method: "GET" }).handler(async () => {
  const rawIp =
    getRequestHeader("cf-connecting-ip") ??
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
    getRequestHeader("x-real-ip") ??
    getRequestIP({ xForwardedFor: true }) ??
    "";
  const country =
    getRequestHeader("cf-ipcountry") ??
    getRequestHeader("x-vercel-ip-country") ??
    getRequestHeader("x-country-code") ??
    "";
  const { getRequestLocation } = await import("@/lib/ip-access.server");
  return getRequestLocation(rawIp, country);
});
