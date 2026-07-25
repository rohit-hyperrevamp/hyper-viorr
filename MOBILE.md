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

# Create missing native projects if needed and copy the web config:
npm run mobile:sync
```

The repository now includes the `ios/` and `android/` platform folders. If one
is missing after a fresh clone, `npm run mobile:sync` recreates the missing
platform and then runs Capacitor sync. iOS is intentionally configured with
CocoaPods, not Swift Package Manager, to avoid local Xcode package-artifact
resolution failures.

## Point the app at your production URL

Open `capacitor.config.ts` and update `server.url` to the URL you want the
mobile app to load. The current production URL is `https://radiant.hyperrevamp.com`.

For a custom domain, change it and re-run `npx cap sync`.

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

App identifier: `app.lovable.radiantguard` (change in `capacitor.config.ts`
plus native project settings before submitting).
