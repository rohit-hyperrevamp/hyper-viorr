import { createServerFn } from "@tanstack/react-start";

/**
 * Unauthenticated: called from the sign-in screen to decide whether the
 * caller's network is permitted. Returns only a boolean + the caller's own IP.
 */
export const checkIpAccess = createServerFn({ method: "GET" }).handler(async () => {
  const { checkRequestAccess } = await import("@/lib/ip-access.server");
  return checkRequestAccess();
});

/** Returns the caller's public IP (used by the admin screen to add "this network"). */
export const getMyIp = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequestLocation } = await import("@/lib/ip-access.server");
  return getRequestLocation();
});
