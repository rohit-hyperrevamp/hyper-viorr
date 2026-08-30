import { existsSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

// Use `@capacitor/cli` explicitly. Plain `npx cap` resolves to an
// unrelated npm package called `cap` when the local bin isn't present
// (e.g. fresh clone before `npm install`), and fails with
// "could not determine executable to run".
const CLI = ["--yes", "--package", "@capacitor/cli", "--", "cap"];

const removeIfExists = (path) => {
  if (!existsSync(path)) return;
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (err) {
    // macOS DerivedData can transiently hit ENOTEMPTY while Xcode/indexers write
    // into it. Fall back to a shell `rm -rf` which tolerates concurrent writes,
    // and only warn if that also fails — this cleanup is best-effort.
    if (process.platform !== "win32") {
      const fallback = spawnSync("rm", ["-rf", path], { stdio: "ignore" });
      if (fallback.status === 0) return;
    }
    console.warn(`⚠️  Could not fully remove ${path}: ${err.message}. Continuing.`);
  }
};

const assertCurrentHostedLogin = async () => {
  const configuredUrl = "https://hypervioarr.hyperrevamp.com";
  const loginUrl = new URL("/login", configuredUrl);
  loginUrl.searchParams.set("nativeBuild", "2026-08-31-hyper-vioarr-v7");

  try {
    const response = await fetch(loginUrl, {
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      redirect: "follow",
    });
    const html = await response.text();
    const normalizedHtml = html.toLowerCase();
    const isHyperVioarrLogin =
      response.ok &&
      response.url.startsWith(`${configuredUrl}/login`) &&
      normalizedHtml.includes("hyper vioarr") &&
      !normalizedHtml.includes("radiant guard") &&
      !normalizedHtml.includes("radiant ops");
    if (!isHyperVioarrLogin) {
      console.error("\n❌ The configured mobile URL is not serving the current Hyper Vioarr login.");
      console.error(`   Checked: ${loginUrl.origin}/login`);
      console.error("   Publish the current web app, then run npm run mobile:sync again.\n");
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Could not verify the hosted mobile login: ${err.message}\n`);
    process.exit(1);
  }
};


const ensureFullXcodeSelected = () => {
  if (process.platform !== "darwin") {
    return;
  }

  const result = spawnSync("xcode-select", ["-p"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  const selectedDeveloperDir = result.stdout.trim();
  if (result.status !== 0 || selectedDeveloperDir.includes("/Library/Developer/CommandLineTools")) {
    console.error("\n❌ iOS sync needs full Xcode selected, but macOS is using Command Line Tools.");
    console.error("Run this once on your Mac, then run npm run mobile:sync again:\n");
    console.error("  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer");
    console.error("  sudo xcodebuild -license accept");
    console.error("  sudo xcodebuild -runFirstLaunch\n");
    console.error("If your Xcode app has a different name, replace /Applications/Xcode.app with that app path.");
    process.exit(1);
  }
};

ensureFullXcodeSelected();

await assertCurrentHostedLogin();

// Remove generated web assets before every sync. Capacitor otherwise leaves
// files from an older native build in place, which can preserve an obsolete
// four-digit OTP screen even after the web app has moved to six digits.
removeIfExists("android/app/src/main/assets/public");
removeIfExists("ios/App/App/public");
removeIfExists("android/app/build");
removeIfExists("android/.gradle");
removeIfExists("ios/DerivedData");

if (!existsSync("ios")) {
  run("npx", [...CLI, "add", "ios", "--packagemanager", "CocoaPods"]);
}

if (!existsSync("android")) {
  run("npx", [...CLI, "add", "android"]);
}

// Keep Xcode from holding on to removed Swift Package state. This app uses
// CocoaPods for iOS because the current SPM artifact path has been unstable on
// local Xcode builds.
if (existsSync("ios")) {
  removeIfExists("ios/App/CapApp-SPM");
  removeIfExists("ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm");
  removeIfExists("ios/App/App.xcodeproj/project.xcworkspace/xcuserdata");
  removeIfExists("ios/App/App.xcodeproj/xcuserdata");
  removeIfExists("ios/App/App.xcworkspace/xcuserdata");
  // Xcode stores resolved package state outside the repo too. Remove only this
  // app's derived-data folders so an old SPM resolution cannot keep breaking it.
  const xcodeDerivedData = `${homedir()}/Library/Developer/Xcode/DerivedData`;
  if (existsSync(xcodeDerivedData)) {
    for (const entry of readdirSync(xcodeDerivedData)) {
      if (entry.startsWith("App-")) {
        removeIfExists(`${xcodeDerivedData}/${entry}`);
      }
    }
  }
}

run("npx", [...CLI, "sync"]);