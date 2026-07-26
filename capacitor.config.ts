import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for Radiant Guard Services.
 *
 * TanStack Start is a server-rendered framework, so the native shell loads
 * the hosted web app via `server.url` (hybrid mode) instead of bundling static
 * assets. For active device testing this must point at the current Lovable
 * preview build; otherwise the installed app can run an older published bundle
 * and native-only UI such as Face ID, bottom tabs, and APNs registration will
 * appear to be missing.
 *
 * For a purely offline/static build you'd need to pre-render the app to
 * `dist/` and remove `server.url`; that is a separate migration.
 */
const config: CapacitorConfig = {
  appId: "app.lovable.radiantguard",
  appName: "Radiant Guard",
  // TanStack Start is SSR — there is no static build output. Capacitor still
  // requires `webDir` to exist for `cap copy`/`cap sync`, so we ship a tiny
  // placeholder shell. The real app loads from `server.url` below.
  webDir: "capacitor-web",
  server: {
    // Device-testing URL: load the current preview build where this native
    // code and web UI are updated together. Change to the production URL only
    // after publishing the exact same build for App Store/TestFlight release.
    url: "https://id-preview--dc741c55-be5a-40d9-b6e9-523fed099022.lovable.app",
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: "#ffffff",
  },
  android: {
    backgroundColor: "#ffffff",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: "#ffffff",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashImmersive: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#ffffff",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
