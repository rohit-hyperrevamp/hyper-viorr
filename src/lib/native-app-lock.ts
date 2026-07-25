const SESSION_KEY = "radiant.native.app-lock.session.v1";
const DEFAULT_UNLOCK_TTL_MS = 12 * 60 * 60 * 1000;

type UnlockSession = {
  unlockedAt: number;
  expiresAt: number;
};

let nativeAppSessionUnlocked = false;
let nativeAppUnlockPromptInFlight = false;
let lastNativeAppUnlockAt = 0;

function readUnlockSession(): UnlockSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UnlockSession>;
    if (
      typeof parsed.unlockedAt !== "number" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return { unlockedAt: parsed.unlockedAt, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function writeUnlockSession(session: UnlockSession) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* noop */
  }
}

function clearUnlockSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}

export function isNativeAppSessionUnlocked() {
  if (nativeAppSessionUnlocked) return true;
  const session = readUnlockSession();
  if (!session) return false;
  nativeAppSessionUnlocked = true;
  lastNativeAppUnlockAt = session.unlockedAt;
  return nativeAppSessionUnlocked;
}

export function markNativeAppSessionUnlocked(ttlMs = DEFAULT_UNLOCK_TTL_MS) {
  const now = Date.now();
  nativeAppSessionUnlocked = true;
  lastNativeAppUnlockAt = now;
  writeUnlockSession({ unlockedAt: now, expiresAt: now + ttlMs });
}

export function resetNativeAppSessionUnlock() {
  nativeAppSessionUnlocked = false;
  lastNativeAppUnlockAt = 0;
  clearUnlockSession();
}

export function beginNativeAppUnlockPrompt() {
  if (nativeAppUnlockPromptInFlight) return false;
  nativeAppUnlockPromptInFlight = true;
  return true;
}

export function endNativeAppUnlockPrompt() {
  nativeAppUnlockPromptInFlight = false;
}

export function isNativeAppUnlockPromptInFlight() {
  return nativeAppUnlockPromptInFlight;
}

export function getLastNativeAppUnlockAt() {
  if (lastNativeAppUnlockAt > 0) return lastNativeAppUnlockAt;
  const session = readUnlockSession();
  return session?.unlockedAt ?? 0;
}