import { createServerFn } from "@tanstack/react-start";
import { checkRequestAccess, getRequestLocation } from "@/lib/ip-access.server";

/**
 * Unauthenticated: called from the sign-in screen to decide whether the
 * caller's network is permitted. Returns only a boolean + the caller's own IP.
 */
export const checkIpAccess = createServerFn({ method: "GET" }).handler(checkRequestAccess);

/** Returns the caller's public IP (used by the admin screen to add "this network"). */
export const getMyIp = createServerFn({ method: "GET" }).handler(getRequestLocation);
