import type { CapacitorConfig } from "@capacitor/cli";

const NATIVE_WEB_BUILD = "2026-08-30-hyper-vioarr-v3";
// Stable Lovable published URL. `radiant.hyperrevamp.com` is served by a separate
// (self-hosted) deployment that can lag behind, which made the native shell render
// the legacy Radiant Guard login. Point the shell at the Lovable deployment so a
// published update is always what the app loads; override with CAP_SERVER_URL once
// the custom domain serves the current build.
const nativeServerUrl = new URL(
  process.env['CAP_SERVER_URL'] ??
    "https://project--5038cac8-beed-4c68-a128-c0a70bdf1819.lovable.app",
);
nativeServerUrl.searchParams.set("nativeBuild", NATIVE_WEB_BUILD);

/**
 * Capacitor config for Hyper Vioarr.
 *
 * TanStack Start is server-rendered, so the native shell loads the hosted app
 * via `server.url` instead of bundling static assets. The iOS app intentionally
 * loads the production Vercel/custom-domain app; Apple push calls are bridged
 * back to the Lovable-hosted native API where the APNs secrets live.
 */
const config: CapacitorConfig = {
  appId: "app.lovable.radiantguard",
  appName: "Hyper Vioarr",
  webDir: "capacitor-web",
  server: {
    // The native shell is a thin wrapper around the hosted web app, so whatever
    // this URL serves *is* the app (logo, login/OTP screen, everything).
    // Default to the stable Lovable deployment URL so a published update is
    // picked up immediately; override with CAP_SERVER_URL before `mobile:sync`
    // when pointing the shell at a self-hosted domain.
    // NOTE: the `project--<id>.lovable.app` URL returns "Forbidden" until the
    // project is published, which showed up as a black screen in the shell.
    // Version the launch URL so Android WebView and WKWebView cannot reuse the
    // legacy Radiant Guard document after a native upgrade.
    url: nativeServerUrl.toString(),
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
    // Never reuse an older cached login bundle after installing an update.
    // The hosted response remains the source of truth on every app launch.
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
  },
  ios: {
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: "#111318",
  },
  android: {
    backgroundColor: "#ffffff",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["banner", "list", "badge", "sound"],
    },
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: "#ffffff",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#ffffff",
      overlaysWebView: true,
    },
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
  },
};

export default config;