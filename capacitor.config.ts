import type { CapacitorConfig } from "@capacitor/cli";

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
    url: "https://radiant.hyperrevamp.com",
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
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