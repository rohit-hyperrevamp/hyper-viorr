import { supabase } from "@/integrations/supabase/client";
import { isNativePlatform, logNativeEvent } from "@/lib/native";

export type SelfPunch = {
  id: string;
  candidate_id: string;
  punch_date: string;
  check_in_at: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_in_accuracy: number | null;
  check_in_face_verified: boolean;
  check_out_at: string | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  check_out_accuracy: number | null;
  check_out_face_verified: boolean;
  notes: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_accuracy: number | null;
  last_seen_at: string | null;
  battery_pct: number | null;
  battery_charging: boolean | null;
  network_type: string | null;
};


export type Geo = {
  lat: number;
  lng: number;
  accuracy: number;
};

export async function getCurrentPosition(): Promise<Geo> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Location is not available on this device.");
  }
  return await new Promise<Geo>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: Number(pos.coords.latitude.toFixed(7)),
          lng: Number(pos.coords.longitude.toFixed(7)),
          accuracy: Number((pos.coords.accuracy ?? 0).toFixed(2)),
        });
      },
      (err) => {
        reject(new Error(err?.message || "Unable to fetch location. Enable location access."));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30_000 },
    );
  });
}

type BioPlugin = {
  check(): Promise<{ available: boolean; reason?: string; label?: string }>;
  authenticate(o: { reason: string }): Promise<{ success: boolean }>;
};

function biometricsPlugin(): BioPlugin | null {
  if (!isNativePlatform()) return null;
  try {
    const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
    return (cap?.Plugins?.RadiantBiometrics as BioPlugin | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * Prompt Face ID / Touch ID before marking attendance. On native devices this
 * MUST succeed. On web (no biometric API) we return false but don't block; the
 * caller records `face_verified: false`.
 */
export async function verifyFaceForAttendance(reason: string): Promise<boolean> {
  const plugin = biometricsPlugin();
  if (!plugin) return false;
  const info = await plugin.check();
  if (!info.available) {
    throw new Error(info.reason || "Face ID is not available on this device.");
  }
  const res = await plugin.authenticate({ reason });
  logNativeEvent("biometric", "self-attendance", res);
  if (!res?.success) throw new Error("Face ID was not confirmed.");
  return true;
}

function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function fetchTodayPunch(candidateId: string): Promise<SelfPunch | null> {
  const { data, error } = await supabase
    .from("self_attendance_punches" as never)
    .select("*")
    .eq("candidate_id", candidateId)
    .eq("punch_date", today())
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return (data as SelfPunch | null) ?? null;
}

export async function checkIn(candidateId: string, geo: Geo, faceVerified: boolean): Promise<SelfPunch> {
  const row = {
    candidate_id: candidateId,
    punch_date: today(),
    check_in_at: new Date().toISOString(),
    check_in_lat: geo.lat,
    check_in_lng: geo.lng,
    check_in_accuracy: geo.accuracy,
    check_in_face_verified: faceVerified,
  };
  const { data, error } = await supabase
    .from("self_attendance_punches" as never)
    .upsert(row as never, { onConflict: "candidate_id,punch_date" })
    .select("*")
    .single();

  if (error) throw error;
  return data as SelfPunch;
}

export async function checkOut(
  id: string,
  geo: Geo,
  faceVerified: boolean,
): Promise<SelfPunch> {
  const { data, error } = await supabase
    .from("self_attendance_punches" as never)
    .update({
      check_out_at: new Date().toISOString(),
      check_out_lat: geo.lat,
      check_out_lng: geo.lng,
      check_out_accuracy: geo.accuracy,
      check_out_face_verified: faceVerified,
    } as never)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as SelfPunch;
}

export async function fetchMonthPunches(
  candidateId: string,
  ym: string, // "YYYY-MM"
): Promise<SelfPunch[]> {
  const [y, m] = ym.split("-").map((n) => Number(n));
  const first = `${ym}-01`;
  const nextMonth = new Date(y, m, 1);
  const p = (n: number) => String(n).padStart(2, "0");
  const last = `${nextMonth.getFullYear()}-${p(nextMonth.getMonth() + 1)}-${p(nextMonth.getDate())}`;
  const { data, error } = await supabase
    .from("self_attendance_punches" as never)
    .select("*")
    .eq("candidate_id", candidateId)
    .gte("punch_date", first)
    .lt("punch_date", last)
    .order("punch_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SelfPunch[];
}

/** Distance in metres between two lat/lng points (Haversine). */
export function distanceMeters(
  a: { lat: number; lng: number } | null | undefined,
  b: { lat: number; lng: number } | null | undefined,
): number | null {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6_371_000; // metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

export function formatDistance(m: number | null): string {
  if (m == null) return "—";
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 2 : 1)} km`;
}

/** Google Maps URL for a coordinate, opens with a pin. */
export function mapsUrl(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** Deviation threshold in metres — anything above this is flagged. */
export const DEVIATION_THRESHOLD_M = 150;

/** Battery info. Uses Capacitor Device on native (iOS/Android), Battery API on web. */
export type BatteryInfo = { level: number | null; charging: boolean | null };
export async function readBattery(): Promise<BatteryInfo> {
  if (isNativePlatform()) {
    try {
      const { Device } = await import("@capacitor/device");
      const info = await Device.getBatteryInfo();
      return {
        level: info.batteryLevel != null ? Math.round(info.batteryLevel * 100) : null,
        charging: info.isCharging ?? null,
      };
    } catch {
      return { level: null, charging: null };
    }
  }
  try {
    const nav = navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean }> };
    if (typeof nav.getBattery !== "function") return { level: null, charging: null };
    const b = await nav.getBattery();
    return { level: Math.round(b.level * 100), charging: !!b.charging };
  } catch {
    return { level: null, charging: null };
  }
}

/** Network label like "WiFi", "Cellular", "4G". Uses Capacitor Network on native. */
export async function readNetworkType(): Promise<string | null> {
  if (isNativePlatform()) {
    try {
      const { Network } = await import("@capacitor/network");
      const s = await Network.getStatus();
      if (!s.connected) return "Offline";
      const t = (s.connectionType ?? "").toLowerCase();
      if (t === "wifi") return "WiFi";
      if (t === "cellular") return "Cellular";
      if (t === "ethernet") return "Ethernet";
      if (t === "none") return "Offline";
      return t ? t.toUpperCase() : "Cellular";
    } catch {
      return null;
    }
  }
  try {
    const conn = (navigator as unknown as { connection?: { effectiveType?: string; type?: string } }).connection;
    if (!conn) return null;
    const kind = (conn.type ?? "").toLowerCase();
    if (kind === "wifi") return "WiFi";
    if (kind === "ethernet") return "Ethernet";
    const eff = (conn.effectiveType ?? "").toLowerCase();
    if (eff === "4g") return "4G";
    if (eff === "3g") return "3G";
    if (eff === "2g") return "2G";
    if (eff === "slow-2g") return "2G";
    if (eff) return eff.toUpperCase();
    return kind ? kind.toUpperCase() : null;
  } catch {
    return null;
  }
}

/** Push live telemetry for an on-duty punch. All fields optional; nulls are ignored. */
export async function pushTelemetry(
  id: string,
  telemetry: {
    geo?: Geo | null;
    battery?: BatteryInfo | null;
    network?: string | null;
  },
): Promise<void> {
  const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
  if (telemetry.geo) {
    patch.last_lat = telemetry.geo.lat;
    patch.last_lng = telemetry.geo.lng;
    patch.last_accuracy = telemetry.geo.accuracy;
  }
  if (telemetry.battery) {
    if (telemetry.battery.level != null) patch.battery_pct = telemetry.battery.level;
    if (telemetry.battery.charging != null) patch.battery_charging = telemetry.battery.charging;
  }
  if (telemetry.network !== undefined) patch.network_type = telemetry.network;
  const { error } = await supabase
    .from("self_attendance_punches" as never)
    .update(patch as never)
    .eq("id", id);
  if (error) throw error;
}


