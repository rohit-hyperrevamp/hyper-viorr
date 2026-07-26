import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for Radiant Guard Services.
 *
 * TanStack Start is server-rendered, so the native shell loads the hosted app
 * via `server.url` instead of bundling static assets. Use a public app URL here;
 * Lovable editor preview URLs route through an auth bridge and are not suitable
 * for the installed iOS WebView.
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