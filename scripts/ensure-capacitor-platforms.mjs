import { existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

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
  run("npx", [...CLI, "add", "ios"]);
}

if (!existsSync("android")) {
  run("npx", [...CLI, "add", "android"]);
}

// Keep Xcode/SPM from holding on to package products that were removed from
// package.json and Package.swift. Without this, Xcode can keep reporting stale
// products even after the dependency is gone.
if (existsSync("ios")) {
  removeIfExists("ios/App/CapApp-SPM/.build");
  removeIfExists("ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm");
}

run("npx", [...CLI, "sync"]);