# Mobile (iOS / Android) — Capacitor

The app is packaged natively with [Capacitor](https://capacitorjs.com). It
runs as a hybrid app: the native shell loads the published Lovable web app
(TanStack Start SSR) via `server.url` in `capacitor.config.ts`.

## One-time setup (on your Mac / dev machine)

Requirements:

- Node 20+, Xcode (iOS), Android Studio (Android)
- CocoaPods for iOS (`sudo gem install cocoapods`)
- Full Xcode must be selected, not only Command Line Tools:
  ```bash
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
  sudo xcodebuild -license accept
  sudo xcodebuild -runFirstLaunch
  ```

```bash
# From project root, after cloning:
npm install

# Create missing native projects if needed, verify the hosted login is current,
# clear old WebView assets, and copy the web config:
npm run mobile:sync
```

If CocoaPods previously cached a failed Camera dependency resolution, clean the
local install once before syncing again:

```bash
rm -rf node_modules ios/App/Pods ios/App/Podfile.lock
npm install
npm run mobile:sync
```

The Camera plugin is intentionally pinned to `8.2.1`; do not change it to a
caret range, because `npm install` can otherwise select a newer native pod
dependency than the checked-in iOS project supports.

The repository now includes the `ios/` and `android/` platform folders. If one
is missing after a fresh clone, `npm run mobile:sync` recreates the missing
platform and then runs Capacitor sync. iOS is intentionally configured with
CocoaPods, not Swift Package Manager, to avoid local Xcode package-artifact
resolution failures.

## Point the app at your production URL

Android and iOS load the canonical production URL
`https://hypervioarr.hyperrevamp.com` exclusively.

The production domain is locked in the native configuration so Android and iOS
cannot accidentally load an older deployment.

`npm run mobile:sync` intentionally stops if that URL serves any legacy login
or redirects elsewhere. Publish the current Hyper Vioarr web build first, then run
the sync again. This prevents Android or iOS packages with the old four-digit
OTP screen from being created accidentally.

## Running

```bash
# iOS (opens Xcode)
npm run mobile:ios

# Android (opens Android Studio)
npm run mobile:android
```

Then Run in Xcode / Android Studio on a simulator or device.

## What's already wired

- Safe-area insets (notch / Dynamic Island / home indicator) via CSS `env()`
- Status bar style + non-overlay (safe-area friendly)
- Splash screen auto-hide
- Native keyboard resize + `--keyboard-height` CSS var + `[data-keyboard=open]`
- Android hardware back button → history back / exit
- 44×44 touch targets and 16px minimum input font (no iOS auto-zoom)

Runtime initialisation lives in `src/lib/native.ts` and is invoked once from
`src/routes/__root.tsx`. It's a no-op in the browser, so web builds are
unaffected.

## Publishing to the stores

- **iOS** — Xcode → Product → Archive → Distribute App (App Store Connect)
- **Android** — Android Studio → Build → Generate Signed Bundle (AAB)

App identifier: `com.hyperrevamp.hypervioarr`.

## Android push notifications (FCM)

1. Firebase console → add an **Android** app with package name `com.hyperrevamp.hypervioarr`.
2. Download `google-services.json` and place it at `android/app/google-services.json`
   (the Gradle build applies the google-services plugin only when this file exists).
3. Firebase console → Project settings → Cloud Messaging → make sure
   **Firebase Cloud Messaging API (V1)** is enabled.
4. Firebase console → Project settings → Service accounts → *Generate new private key*,
   then store the whole JSON in the Lovable secret `FIREBASE_SERVICE_ACCOUNT_JSON`.
5. `npm install && npm run mobile:sync`, then rebuild/reinstall the Android app.
   On first launch the app creates the `hyper_vioarr_alerts_v3` channel, asks for the
   notification permission, and stores the FCM token in `device_push_tokens`
   with `platform = 'android'`.

Server side, `src/lib/fcm.server.ts` signs the service-account JWT and posts to
FCM HTTP v1; `src/lib/push-delivery.server.ts` picks APNs for iOS rows and FCM for
Android rows, so one notification reaches both platforms.

## Notification hierarchy

`public.get_hierarchy_user_ids(actor)` resolves, for whoever performed the action:
their reporting manager(s), the field officers mapped to their unit(s), and the
admins of that unit's branch. Every fan-out helper in `src/lib/notifications.ts`
(`notifyAdmins`, `notifyApprovers`, `notifyOnboardingApprovers`) unions those
users in, so any logged action — attendance, uniform demands, onboarding,
contracts — reaches the reporting line as well as admins, in-app and as a push.
