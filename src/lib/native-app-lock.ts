const RUNTIME_KEY = "__radiantNativeAppLockRuntime";

type NativeAppLockRuntime = {
  unlocked: boolean;
  promptInFlight: boolean;
  lastUnlockAt: number;
  lastPromptAt: number;
};

const fallbackRuntime: NativeAppLockRuntime = {
  unlocked: false,
  promptInFlight: false,
  lastUnlockAt: 0,
  lastPromptAt: 0,
};

function runtime() {
  if (typeof window === "undefined") return fallbackRuntime;
  const holder = window as unknown as Record<string, NativeAppLockRuntime | undefined>;
  if (!holder[RUNTIME_KEY]) {
    holder[RUNTIME_KEY] = {
      unlocked: false,
      promptInFlight: false,
      lastUnlockAt: 0,
      lastPromptAt: 0,
    };
  }
  return holder[RUNTIME_KEY];
}

export function isNativeAppSessionUnlocked() {
  return runtime().unlocked;
}

export function markNativeAppSessionUnlocked() {
  const now = Date.now();
  const state = runtime();
  state.unlocked = true;
  state.lastUnlockAt = now;
  state.lastPromptAt = now;
}

export function resetNativeAppSessionUnlock() {
  const state = runtime();
  state.unlocked = false;
  state.lastUnlockAt = 0;
}

export function beginNativeAppUnlockPrompt() {
  const state = runtime();
  if (state.promptInFlight) return false;
  state.promptInFlight = true;
  state.lastPromptAt = Date.now();
  return true;
}

export function endNativeAppUnlockPrompt() {
  const state = runtime();
  state.promptInFlight = false;
  state.lastPromptAt = Date.now();
}

export function isNativeAppUnlockPromptInFlight() {
  return runtime().promptInFlight;
}

export function getLastNativeAppUnlockAt() {
  return runtime().lastUnlockAt;
}

export function getLastNativeAppPromptAt() {
  return runtime().lastPromptAt;
}