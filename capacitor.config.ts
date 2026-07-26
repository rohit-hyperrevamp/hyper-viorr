import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for Radiant Guard Services.
 *
 * TanStack Start is server-rendered, so the native shell loads the hosted app
 * via `server.url` instead of bundling static assets. The iOS app intentionally
 * loads the production Vercel/custom-domain app; Apple push calls are bridged
 * back to the Lovable-hosted native API where the APNs secrets live.
 */
const config: CapacitorConfig = {
  appId: "app.lovable.radiantguard",
  appName: "Radiant Guard",
  webDir: "capacitor-web",
  server: {
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
      presentationOptions: ["banner", "list", "badge", "sound"],
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