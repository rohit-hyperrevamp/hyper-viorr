import { existsSync } from "node:fs";
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

if (!existsSync("ios")) {
  run("npx", [...CLI, "add", "ios"]);
}

if (!existsSync("android")) {
  run("npx", [...CLI, "add", "android"]);
}

run("npx", [...CLI, "sync"]);