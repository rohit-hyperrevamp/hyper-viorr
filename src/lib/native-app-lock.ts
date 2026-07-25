let nativeAppSessionUnlocked = false;

export function isNativeAppSessionUnlocked() {
  return nativeAppSessionUnlocked;
}

export function markNativeAppSessionUnlocked() {
  nativeAppSessionUnlocked = true;
}

export function resetNativeAppSessionUnlock() {
  nativeAppSessionUnlocked = false;
}