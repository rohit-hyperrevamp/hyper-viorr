import { supabase } from "@/integrations/supabase/client";

const LOVABLE_NATIVE_API_ORIGIN = "https://radiant-guard-services.lovable.app";
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

function nativePushApiUrl() {
  if (typeof window === "undefined") return `${LOVABLE_NATIVE_API_ORIGIN}${NATIVE_PUSH_API_PATH}`;

  const host = window.location.hostname;
  if (host === "radiant-guard-services.lovable.app") {
    return `${window.location.origin}${NATIVE_PUSH_API_PATH}`;
  }

  // The installed iOS app stays on the Vercel/custom-domain frontend, while
  // APNs keys remain bound to the Lovable deployment. Always bridge native
  // push operations back to the Lovable-hosted API instead of same-origin.
  return `${LOVABLE_NATIVE_API_ORIGIN}${NATIVE_PUSH_API_PATH}`;
}

async function authHeader() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Sign in first, then try Apple push again.");
  }

  return `Bearer ${session.access_token}`;
}

async function callNativePushApi<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(nativePushApiUrl(), {
    method: "POST",
    headers: {
      authorization: await authHeader(),
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  const errorBody = body as { error?: string; message?: string };

  if (!response.ok) {
    throw new Error(errorBody.error || errorBody.message || `Apple push API failed (${response.status}).`);
  }

  return body as T;
}

export function getNativePushRegistrationStatus() {
  return callNativePushApi<NativePushRegistrationStatus>({ action: "status" });
}

export function saveMyPushTokenViaApi(input: { token: string; platform: "ios" | "android" | "web" }) {
  return callNativePushApi<NativePushRegistrationResult>({
    action: "register",
    token: input.token,
    platform: input.platform,
  });
}

export function sendNativeTestPush(message?: string) {
  return callNativePushApi<NativePushDeliveryResult>({ action: "test", message });
}

export function sendRecentNativePush(
  userIds: string[],
  input: { title: string; message: string; link?: string },
) {
  return callNativePushApi<NativePushDeliveryResult>({
    action: "sendRecent",
    userIds,
    title: input.title,
    message: input.message,
    link: input.link ?? "",
  });
}