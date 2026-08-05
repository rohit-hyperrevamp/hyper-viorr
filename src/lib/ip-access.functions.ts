import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

function firstPublicIp(raw: string | null | undefined): string {
  if (!raw) return "";
  return (raw.split(",")[0] ?? "").trim();
}

function requestLocationHeaders() {
  const ip =
    firstPublicIp(getRequestHeader("cf-connecting-ip")) ||
    firstPublicIp(getRequestHeader("x-forwarded-for")) ||
    getRequestIP({ xForwardedFor: true }) ||
    "";
  const country =
    getRequestHeader("cf-ipcountry") ??
    getRequestHeader("x-vercel-ip-country") ??
    getRequestHeader("x-country-code") ??
    "";
  return { ip, country };
}

/**
 * Unauthenticated: called from the sign-in screen to decide whether the
 * caller's network is permitted. Returns only a boolean + the caller's own IP.
 */
export const checkIpAccess = createServerFn({ method: "GET" }).handler(async () => {
  const request = requestLocationHeaders();
  const { checkRequestAccess } = await import("@/lib/ip-access.server");
  return checkRequestAccess(request.ip, request.country);
});

/** Returns the caller's public IP (used by the admin screen to add "this network"). */
export const getMyIp = createServerFn({ method: "GET" }).handler(async () => {
  const request = requestLocationHeaders();
  const { getRequestLocation } = await import("@/lib/ip-access.server");
  return getRequestLocation(request.ip, request.country);
});
