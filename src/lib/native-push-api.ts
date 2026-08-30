import { supabase } from "@/integrations/supabase/client";
import { logNativeEvent } from "./native";

const LOVABLE_NATIVE_API_ORIGIN = "https://project--5038cac8-beed-4c68-a128-c0a70bdf1819-dev.lovable.app";
const NATIVE_PUSH_API_PATH = "/api/public/native/push";

export type NativePushRegistrationStatus = {
  registered: boolean;
  count: number;
  latestSeenAt: string | null;
  platforms: string[];
};

export type NativePushRegistrationResult = {
  saved: boolean;
  tokenSuffix: string;
  tokenCount: number;
};

export type NativePushDeliveryResult = {
  sent: number;
  total: number;
  failures: Array<{ tokenSuffix: string; error: string }>;
  message?: string;
};

type RecentNativePushInput = {
  title: string;
  message: string;
  link?: string;
  notificationIds?: string[];
};

function nativePushApiUrls() {
  const urls: string[] = [];
  if (typeof window !== "undefined") {
    // First try the app's own host. On Vercel this route proxies to Lovable
    // Cloud server-side, avoiding iOS WebView cross-origin "Load Failed" errors.
    urls.push(`${window.location.origin}${NATIVE_PUSH_API_PATH}`);
  }
  urls.push(`${LOVABLE_NATIVE_API_ORIGIN}${NATIVE_PUSH_API_PATH}`);
  return Array.from(new Set(urls));
}

async function accessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Sign in first, then try Apple push again.");
  }

  return session.access_token;
}

async function callNativePushApi<T>(payload: Record<string, unknown>): Promise<T> {
  const bodyText = JSON.stringify({ ...payload, accessToken: await accessToken() });
  let lastError: Error | null = null;

  for (const url of nativePushApiUrls()) {
    try {
      logNativeEvent("push", "calling native push bridge", { url });
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15_000);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "text/plain;charset=UTF-8",
        },
        body: bodyText,
        signal: controller.signal,
      });
      window.clearTimeout(timeout);

      const text = await response.text();
      let body: unknown = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { error: text || `Apple push API returned ${response.status}` };
      }

      const errorBody = body as { error?: string; message?: string };
      if (!response.ok) {
        lastError = new Error(errorBody.error || errorBody.message || `Apple push API failed (${response.status}).`);
        logNativeEvent("push", "native push bridge rejected request", {
          url,
          status: response.status,
          error: lastError.message,
        });
        if (response.status !== 404 && response.status < 500) throw lastError;
        continue;
      }

      logNativeEvent("push", "native push bridge succeeded", { url });
      return body as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logNativeEvent("push", "native push bridge failed to load", {
        url,
        error: lastError.message,
      });
    }
  }

  throw new Error(lastError?.message || "The push service could not be reached.");
}

export async function getNativePushRegistrationStatus() {
  try {
    return await callNativePushApi<NativePushRegistrationStatus>({ action: "status" });
  } catch (apiError) {
    const { data, error } = await supabase
      .from("device_push_tokens")
      .select("platform,last_seen_at")
      .order("last_seen_at", { ascending: false });
    if (error) throw apiError;
    const rows = data ?? [];
    return {
      registered: rows.length > 0,
      count: rows.length,
      latestSeenAt: rows[0]?.last_seen_at ?? null,
      platforms: Array.from(new Set(rows.map((row) => row.platform).filter(Boolean))),
    };
  }
}

export async function saveMyPushTokenViaApi(input: { token: string; platform: "ios" | "android" | "web" }) {
  try {
    return await callNativePushApi<NativePushRegistrationResult>({
      action: "register",
      token: input.token,
      platform: input.platform,
    });
  } catch (apiError) {
    logNativeEvent("push", "native bridge unavailable; saving token directly", {
      error: apiError instanceof Error ? apiError.message : String(apiError),
    });
    const { data, error } = await supabase.rpc("register_device_push_token", {
      _token: input.token,
      _platform: input.platform,
    });
    if (error) throw apiError;
    const result = data?.[0];
    return {
      saved: result?.saved ?? true,
      tokenSuffix: result?.token_suffix ?? input.token.slice(-8),
      tokenCount: result?.token_count ?? 1,
    };
  }
}

export function sendNativeTestPush(message?: string) {
  return callNativePushApi<NativePushDeliveryResult>({ action: "test", message });
}

export function sendRecentNativePush(
  userIds: string[],
  input: RecentNativePushInput,
) {
  return callNativePushApi<NativePushDeliveryResult>({
    action: "sendRecent",
    userIds,
    title: input.title,
    message: input.message,
    link: input.link ?? "",
    notificationIds: input.notificationIds ?? [],
  });
}

export async function queueRecentNativePush(
  userIds: string[],
  input: RecentNativePushInput,
) {
  await callNativePushApi<NativePushDeliveryResult>({
    action: "sendRecent",
    userIds,
    title: input.title,
    message: input.message,
    link: input.link ?? "",
    notificationIds: input.notificationIds ?? [],
  });
}