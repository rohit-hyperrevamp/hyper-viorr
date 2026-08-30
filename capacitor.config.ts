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
    // The native shell is a thin wrapper around the hosted web app, so whatever
    // this URL serves *is* the app (logo, login/OTP screen, everything).
    // Default to the stable Lovable deployment URL so a published update is
    // picked up immediately; override with CAP_SERVER_URL before `mobile:sync`
    // when pointing the shell at a self-hosted domain.
    // NOTE: the `project--<id>.lovable.app` URL returns "Forbidden" until the
    // project is published, which showed up as a black screen in the shell.
    url:
      process.env['CAP_SERVER_URL'] ?? "https://radiant.hyperrevamp.com",
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