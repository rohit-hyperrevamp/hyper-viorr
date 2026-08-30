import { isNativePlatform, logNativeEvent } from "@/lib/native";

export type Coords = { lat: number; lng: number; accuracy: number };

const round = (n: number, d = 7) => Number(n.toFixed(d));

/**
 * Ask the OS for location access on native (Android/iOS). Safe on web where it
 * resolves without prompting — the browser prompts on the first read instead.
 * Returns true when foreground location is usable.
 */
export async function ensureLocationPermission(): Promise<boolean> {
  if (!isNativePlatform()) return true;
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    let status = await Geolocation.checkPermissions();
    if (status.location !== "granted" && status.coarseLocation !== "granted") {
      status = await Geolocation.requestPermissions({ permissions: ["location"] });
    }
    const granted = status.location === "granted" || status.coarseLocation === "granted";
    logNativeEvent("runtime", "location permission", { state: status.location, granted });
    return granted;
  } catch (err) {
    logNativeEvent("runtime", "location permission failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Single high-accuracy fix. Uses the native Geolocation plugin inside the app
 * shell (so the OS permission dialog appears) and falls back to the browser API.
 */
export async function readPosition(): Promise<Coords> {
  if (isNativePlatform()) {
    const granted = await ensureLocationPermission();
    if (!granted) {
      throw new Error("Location permission denied. Enable location access for Hyper Vioarr.");
    }
    const { Geolocation } = await import("@capacitor/geolocation");
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 30_000,
    });
    return {
      lat: round(pos.coords.latitude),
      lng: round(pos.coords.longitude),
      accuracy: Number((pos.coords.accuracy ?? 0).toFixed(2)),
    };
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Location is not available on this device.");
  }
  return await new Promise<Coords>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: round(pos.coords.latitude),
          lng: round(pos.coords.longitude),
          accuracy: Number((pos.coords.accuracy ?? 0).toFixed(2)),
        }),
      (err) =>
        reject(new Error(err?.message || "Unable to fetch location. Enable location access.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30_000 },
    );
  });
}
