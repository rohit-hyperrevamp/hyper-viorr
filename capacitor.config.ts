import type { CapacitorConfig } from "@capacitor/cli";

const NATIVE_WEB_BUILD = "2026-08-31-hyper-vioarr-v11";
// Hyper Vioarr's production domain is the single source for both native apps.
const nativeServerUrl = new URL("https://hypervioarr.hyperrevamp.com");
nativeServerUrl.searchParams.set("nativeBuild", NATIVE_WEB_BUILD);

/**
 * Capacitor config for Hyper Vioarr.
 *
 * TanStack Start is server-rendered, so the native shell loads the hosted app
 * via `server.url` instead of bundling static assets. The iOS app intentionally
 * loads the production custom-domain app; native push calls are bridged
 * back to the Lovable-hosted API where the delivery secrets live.
 */
const config: CapacitorConfig = {
  appId: "com.hyperrevamp.hypervioarr",
  appName: "Hyper Vioarr",
  webDir: "capacitor-web",
  server: {
    // The native shell is a thin wrapper around the hosted web app, so whatever
    // this URL serves *is* the app (logo, login/OTP screen, everything).
    // Default to the canonical Hyper Vioarr production URL.
    // Version the launch URL so Android WebView and WKWebView cannot reuse an
    // obsolete document after a native upgrade.
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