/**
 * Native push registration for Android and iOS (Capacitor).
 *
 * On native platforms, requests permission, registers with FCM/APNs, and stores
 * the resulting device token in `public.device_push_tokens` so backend jobs
 * can target the signed-in user. Safe no-op on web.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getNativeRuntimeSnapshot, isNativePlatform, logNativeEvent } from "./native";
import { playNotificationChime } from "./notification-sound";
import { saveMyPushTokenViaApi } from "./native-push-api";

let initialized = false;
let initPromise: Promise<void> | null = null;
let lastApnsToken: string | null = null;
let lastPermission: string | null = null;
let lastError: string | null = null;
let authSyncAttached = false;
let pendingTokenResolvers: Array<(token: string | null) => void> = [];

function nativePushPlatform(): "ios" | "android" | null {
  if (!isNativePlatform()) return null;
  const platform = getNativeRuntimeSnapshot().platform;
  if (platform === "ios" || platform === "android") return platform;
  return null;
}

/** True on any native platform that supports push (iOS via APNs, Android via FCM). */
function isPushNativePlatform(): boolean {
  return nativePushPlatform() !== null;
}

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
    lastError = "Sign in first, then register this device for push notifications.";
    logNativeEvent("push", "token received before signed-in user", {
      tokenSuffix: token.slice(-8),
    });
    console.warn("[push] no signed-in user; token not stored");
    return false;
  }

  try {
    const result = await saveMyPushTokenViaApi({
      token,
      platform: nativePushPlatform() ?? "ios",
    });
    if (!result?.saved) {
      lastError = "The device token was received, but the backend did not confirm it was saved.";
        logNativeEvent("push", "native push token save not confirmed", {
        tokenSuffix: token.slice(-8),
      });
      return false;
    }

    logNativeEvent("push", "native push token saved in backend", {
      tokenSuffix: result.tokenSuffix || token.slice(-8),
      tokenCount: result.tokenCount,
    });
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    logNativeEvent("push", "failed to store native push token", { error: lastError });
    console.warn("[push] failed to store token", err);
    return false;
  }

  lastError = null;
  console.info("[push] native token stored in backend", token.slice(-8));
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
  // iOS registers with APNs, Android with Firebase Cloud Messaging. On Android
  // this needs android/app/google-services.json present in the native project;
  // without it registration fails and is reported through registrationError.
  if (!isPushNativePlatform()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    lastPermission = perm.receive;
    if (perm.receive === "granted") {
        logNativeEvent("push", "silent native push register requested", { permission: perm.receive });
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
      } else if (initialized && isPushNativePlatform()) {
        void registerSilentlyIfAlreadyGranted();
      }
    }
  });
}

/**
 * Attach native push listeners without asking for notification permission.
 * Permission is requested only from the explicit device registration action.
 */
export async function preparePushNotifications(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = preparePushNotificationsOnce();
  return initPromise;
}

export async function initPushNotifications(): Promise<void> {
  await preparePushNotifications();
  await registerSilentlyIfAlreadyGranted();
  await requestPushPermissionOnLaunch();
}

let launchPermissionAsked = false;

/**
 * Ask for notification permission on the first native launch after install.
 * Android 13+ requires the POST_NOTIFICATIONS runtime prompt, and iOS needs the
 * APNs alert prompt, before any alert can be delivered with sound.
 */
async function requestPushPermissionOnLaunch(): Promise<void> {
  if (launchPermissionAsked || !isPushNativePlatform()) return;
  launchPermissionAsked = true;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    lastPermission = perm.receive;
    if (perm.receive === "granted" || perm.receive === "denied") return;

    const req = await PushNotifications.requestPermissions();
    lastPermission = req.receive;
    logNativeEvent("push", "launch permission prompt", { permission: req.receive });
    if (req.receive === "granted") {
      await PushNotifications.register();
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    logNativeEvent("push", "launch permission prompt failed", { error: lastError });
  }
}

async function preparePushNotificationsOnce(): Promise<void> {
  if (initialized) return;
  if (!isPushNativePlatform()) {
    logNativeEvent("push", "prepare skipped: push requires the installed app", getNativeRuntimeSnapshot());
    return;
  }
  initialized = true;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    attachAuthTokenSync();
    logNativeEvent("push", "preparing listeners", getNativeRuntimeSnapshot());

    if (nativePushPlatform() === "android") {
      // Android 8+ needs an explicit channel; it must match the channel_id the
      // server sends with each FCM message so sound and heads-up alerts work.
      try {
        await PushNotifications.createChannel({
          id: "hyper_vioarr_alerts_v3",
          name: "Hyper Vioarr Alerts",
          description: "Approvals, attendance and workflow updates",
          importance: 5,
          visibility: 1,
          vibration: true,
          sound: "hyper_vioarr_alert",
        });
      } catch (channelError) {
        logNativeEvent("push", "android channel creation failed", {
          error: channelError instanceof Error ? channelError.message : String(channelError),
        });
      }
    }

    const perm = await PushNotifications.checkPermissions();
    lastPermission = perm.receive;
    logNativeEvent("push", "permission checked", { permission: perm.receive });

    await Promise.all([
      PushNotifications.addListener("registration", async (token) => {
        logNativeEvent("push", "native push registration event", { tokenSuffix: token.value.slice(-8) });
        console.info("[push] native push token registered", token.value.slice(-8));
        lastApnsToken = token.value;
        resolvePendingToken(token.value);
        await saveTokenForSignedInUser(token.value);
      }),
      PushNotifications.addListener("registrationError", (err) => {
        lastError = err?.error || JSON.stringify(err);
        resolvePendingToken(null);
        logNativeEvent("push", "native push registration error", { error: lastError });
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
        const title = notif.title || "Hyper Vioarr";
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
  if (!isPushNativePlatform()) {
    return {
      supported: false,
      permission: null,
      tokenSaved: false,
      tokenSuffix: null,
      message: "Open the installed Hyper Vioarr app to register this device for push notifications.",
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
      logNativeEvent("push", "manual native push register requested");
      tokenPromise = waitForToken(9000, true);
      await PushNotifications.register();
    } else {
      lastError = `Push permission is ${lastPermission}. Enable notifications for Hyper Vioarr in your phone's Settings.`;
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
      ? "This device is registered for push notifications."
       : lastError || "Push registration has started. Try again in a few seconds.",
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
