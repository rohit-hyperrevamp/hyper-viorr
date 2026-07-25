import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for Radiant Guard Services.
 *
 * TanStack Start is a server-rendered framework, so the native shell loads
 * the published web app via `server.url` (hybrid mode) instead of bundling
 * static assets. Point `server.url` at your published Lovable URL — or a
 * custom domain — and rebuild the native project with `npx cap sync`.
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
    // Custom production domain (Vercel deployment connected via Git).
    url: "https://radiant.hyperrevamp.com",
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
