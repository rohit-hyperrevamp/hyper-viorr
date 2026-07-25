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
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
};

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
  removeIfExists("ios/DerivedData");

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