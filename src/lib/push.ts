/**
 * APNs push registration for iOS (Capacitor).
 *
 * On native platforms, requests permission, registers with APNs, and stores
 * the resulting device token in `public.device_push_tokens` so backend jobs
 * can target the signed-in user. Safe no-op on web.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getNativeRuntimeSnapshot, isNativePlatform, logNativeEvent } from "./native";
import { playNotificationChime } from "./notification-sound";
import { saveMyPushToken } from "./push.functions";

let initialized = false;
let initPromise: Promise<void> | null = null;
let lastApnsToken: string | null = null;
let lastPermission: string | null = null;
let lastError: string | null = null;
let authSyncAttached = false;
let pendingTokenResolvers: Array<(token: string | null) => void> = [];

type PushRegisterResult = {
  supported: boolean;
  permission: string | null;
  tokenSaved: boolean;
  tokenSuffix: string | null;
  message: string;
};

async function saveTokenForSignedInUser(token: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    lastError = "Sign in first, then register this iPhone for push notifications.";
    logNativeEvent("push", "token received before signed-in user", {
      tokenSuffix: token.slice(-8),
    });
    console.warn("[push] no signed-in user; token not stored");
    return false;
  }

  try {
    const result = await saveMyPushToken({ data: { token, platform: "ios" } });
    if (!result?.saved) {
      lastError = "The iPhone token was received, but the backend did not confirm it was saved.";
      logNativeEvent("push", "APNs token save not confirmed", {
        tokenSuffix: token.slice(-8),
      });
      return false;
    }

    logNativeEvent("push", "APNs token saved in backend", {
      tokenSuffix: result.tokenSuffix || token.slice(-8),
      tokenCount: result.tokenCount,
    });
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    logNativeEvent("push", "failed to store APNs token", { error: lastError });
    console.warn("[push] failed to store token", err);
    return false;
  }

  lastError = null;
  console.info("[push] APNs token stored in backend", token.slice(-8));
  return true;
}

function resolvePendingToken(token: string | null) {
  const resolvers = pendingTokenResolvers;
  pendingTokenResolvers = [];
  resolvers.forEach((resolve) => resolve(token));
}

function waitForToken(timeoutMs = 7000, waitForFreshToken = false): Promise<string | null> {
  if (lastApnsToken && !waitForFreshToken) return Promise.resolve(lastApnsToken);
  return new Promise((resolve) => {
    pendingTokenResolvers.push(resolve);
    window.setTimeout(() => {
      pendingTokenResolvers = pendingTokenResolvers.filter((item) => item !== resolve);
      resolve(lastApnsToken);
    }, timeoutMs);
  });
}

async function registerSilentlyIfAlreadyGranted() {
  if (!isNativePlatform()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    lastPermission = perm.receive;
    if (perm.receive === "granted") {
      logNativeEvent("push", "silent APNs register requested", { permission: perm.receive });
      await PushNotifications.register();
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    logNativeEvent("push", "silent register failed", { error: lastError });
  }
}

function attachAuthTokenSync() {
  if (authSyncAttached) return;
  authSyncAttached = true;
  supabase.auth.onAuthStateChange((event) => {
    if (
      event === "SIGNED_IN" ||
      event === "TOKEN_REFRESHED" ||
      event === "INITIAL_SESSION"
    ) {
      if (lastApnsToken) {
        void saveTokenForSignedInUser(lastApnsToken);
      } else if (initialized && isNativePlatform()) {
        void registerSilentlyIfAlreadyGranted();
      }
    }
  });
}

/**
 * Attach native push listeners without asking for notification permission.
 * Permission is requested only from the explicit Register iPhone action.
 */
export async function preparePushNotifications(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = preparePushNotificationsOnce();
  return initPromise;
}

export async function initPushNotifications(): Promise<void> {
  await preparePushNotifications();
  await registerSilentlyIfAlreadyGranted();
}

async function preparePushNotificationsOnce(): Promise<void> {
  if (initialized) return;
  if (!isNativePlatform()) {
    logNativeEvent("push", "prepare skipped: not native", getNativeRuntimeSnapshot());
    return;
  }
  initialized = true;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    attachAuthTokenSync();
    logNativeEvent("push", "preparing listeners", getNativeRuntimeSnapshot());

    const perm = await PushNotifications.checkPermissions();
    lastPermission = perm.receive;
    logNativeEvent("push", "permission checked", { permission: perm.receive });

    await Promise.all([
      PushNotifications.addListener("registration", async (token) => {
        logNativeEvent("push", "APNs registration event", { tokenSuffix: token.value.slice(-8) });
        console.info("[push] APNs token registered", token.value.slice(-8));
        lastApnsToken = token.value;
        resolvePendingToken(token.value);
        await saveTokenForSignedInUser(token.value);
      }),
      PushNotifications.addListener("registrationError", (err) => {
        lastError = err?.error || JSON.stringify(err);
        resolvePendingToken(null);
        logNativeEvent("push", "APNs registration error", { error: lastError });
        console.warn("[push] registration error", err);
      }),
      // Foreground: iOS does NOT show a system banner or play a sound when the
      // app is open. We handle it in-app: play a chime and show a toast that
      // links to the deep-link target if provided.
      PushNotifications.addListener("pushNotificationReceived", (notif) => {
        logNativeEvent("push", "foreground notification received", {
          title: notif.title,
          body: notif.body,
          data: notif.data,
        });
        try {
          playNotificationChime();
        } catch {
          /* noop */
        }
        const title = notif.title || "Radiant Guard";
        const body = notif.body || "";
        const link = (notif.data as { link?: string } | undefined)?.link;
        toast(title, {
          description: body,
          action: link
            ? {
                label: "Open",
                onClick: () => {
                  if (link.startsWith("/")) window.location.href = link;
                },
              }
            : undefined,
        });
      }),
      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        logNativeEvent("push", "notification action opened", {
          data: action.notification.data,
        });
        const link = (action.notification.data as { link?: string } | undefined)?.link;
        if (link && typeof window !== "undefined" && link.startsWith("/")) {
          window.location.href = link;
        }
      }),
    ]);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    logNativeEvent("push", "prepare failed", { error: lastError });
    console.warn("[push] init failed", err);
  }
}

export async function registerPushForCurrentUser(): Promise<PushRegisterResult> {
  if (!isNativePlatform()) {
    return {
      supported: false,
      permission: null,
      tokenSaved: false,
      tokenSuffix: null,
      message: "Open the installed iOS app to register Apple push notifications.",
    };
  }

  await preparePushNotifications();

  let tokenPromise: Promise<string | null> | null = null;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    lastPermission = perm.receive;
    logNativeEvent("push", "manual register permission check", { permission: perm.receive });
    if (perm.receive !== "granted") {
      const req = await PushNotifications.requestPermissions();
      lastPermission = req.receive;
      logNativeEvent("push", "manual register permission request completed", {
        permission: req.receive,
      });
    }
    if (lastPermission === "granted") {
      logNativeEvent("push", "manual APNs register requested");
      tokenPromise = waitForToken(9000, true);
      await PushNotifications.register();
    } else {
      lastError = `Push permission is ${lastPermission}. Enable notifications for Radiant Guard in iOS Settings.`;
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    logNativeEvent("push", "manual register failed", { error: lastError });
  }

  const token = lastPermission === "granted" ? (await tokenPromise) || lastApnsToken : lastApnsToken;
  const tokenSaved = token ? await saveTokenForSignedInUser(token) : false;
  return {
    supported: true,
    permission: lastPermission,
    tokenSaved,
    tokenSuffix: token ? token.slice(-8) : null,
    message: tokenSaved
      ? "This iPhone is registered for Apple push notifications."
      : lastError || "Apple push registration has started. Try again in a few seconds.",
  };
}

export function getLastPushTokenForDiagnostics(): string | null {
  return lastApnsToken;
}

export function getPushDebugStatus() {
  return {
    initialized,
    permission: lastPermission,
    hasToken: !!lastApnsToken,
    tokenSuffix: lastApnsToken ? lastApnsToken.slice(-8) : null,
    lastError,
  };
}
