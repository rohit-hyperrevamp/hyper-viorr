import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

/**
 * Unauthenticated: called from the sign-in screen to decide whether the
 * caller's network is permitted. Returns only a boolean + the caller's own IP.
 */
export const checkIpAccess = createServerFn({ method: "GET" }).handler(async () => {
  const ips = [
    getRequestHeader("cf-connecting-ip"),
    getRequestHeader("x-forwarded-for"),
    getRequestHeader("x-real-ip"),
    getRequestIP({ xForwardedFor: true }),
  ].filter((value): value is string => Boolean(value));
  const country =
    getRequestHeader("cf-ipcountry") ??
    getRequestHeader("x-vercel-ip-country") ??
    getRequestHeader("x-country-code") ??
    "";
  const { checkRequestAccess } = await import("@/lib/ip-access.server");
  return checkRequestAccess(ips, country);
});

/** Returns the caller's public IP (used by the admin screen to add "this network"). */
export const getMyIp = createServerFn({ method: "GET" }).handler(async () => {
  const ips = [
    getRequestHeader("cf-connecting-ip"),
    getRequestHeader("x-forwarded-for"),
    getRequestHeader("x-real-ip"),
    getRequestIP({ xForwardedFor: true }),
  ].filter((value): value is string => Boolean(value));
  const country =
    getRequestHeader("cf-ipcountry") ??
    getRequestHeader("x-vercel-ip-country") ??
    getRequestHeader("x-country-code") ??
    "";
  const { getRequestLocation } = await import("@/lib/ip-access.server");
  return getRequestLocation(ips.flatMap((value) => value.split(","))[0]?.trim() ?? "", country);
});
