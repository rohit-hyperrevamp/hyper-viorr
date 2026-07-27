import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  Clock,
  Flag,
  LogOut,
  Loader2,
  Map as MapIcon,
  MapPin,
  Navigation,
  Route as RouteIcon,
  Satellite,
  Star,
  X,
} from "lucide-react";


import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad } from "@/components/SignaturePad";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { capturePhoto } from "@/lib/native-camera";
import { isNativePlatform } from "@/lib/native";
import {
  checkOut as attendanceCheckOut,
  distanceMeters,
  formatDistance,
  getCurrentPosition,
  mapsUrl,
  pushTelemetry,
  readBattery,
  readNetworkType,
  verifyFaceForAttendance,
  type Geo,
} from "@/lib/self-attendance";
import {
  completeVisit,
  createVisit,
  fetchLastVisitPerUnit,
  fetchMonthVisitCounts,
  fetchTodayTrackPoints,
  fetchTodayVisits,
  fetchVisitsInRange,
  findNearestUnit,
  insertTrackPoint,
  resolveRange,
  signedProofUrl,
  uploadVisitProof,
  RANGE_PRESETS,
  type FieldVisit,
  type RangePreset,
} from "@/lib/field-visits";
import {
  acknowledgeFieldVisitRequest,
  completeFieldVisitRequestForUnit,
  listOpenRequestsForCandidate,
  type FieldVisitRequest,
} from "@/lib/field-visit-requests";


type FoUnit = {
  unit_id: string;
  unit_name: string;
  unit_code: string | null;
  customer_name: string | null;
  branch_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

const TRACK_INTERVAL_MS = 15_000;
const NEAREST_MAX_METERS = 500;

type RouteCoord = {
  lat: number;
  lng: number;
  at: string;
  kind: "punch-in" | "track" | "visit-in" | "visit-out" | "current" | "punch-out";
};

function hasGeo(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng);
}

function pushRouteCoord(points: RouteCoord[], point: RouteCoord | null) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
  const prev = points[points.length - 1];
  if (prev) {
    const d = distanceMeters({ lat: prev.lat, lng: prev.lng }, { lat: point.lat, lng: point.lng }) ?? 0;
    if (d < 8 && prev.kind === point.kind) return;
  }
  points.push(point);
}

function unitGeo(unit: FoUnit | null | undefined): { lat: number; lng: number } | null {
  if (!unit || unit.latitude == null || unit.longitude == null) return null;
  const lat = Number(unit.latitude);
  const lng = Number(unit.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function whenAgo(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function todayPunchDate(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Load FO's assigned units with geo + address (aggregates candidate_units + esa + candidate.unit_id). */
async function loadFoUnits(candidateId: string): Promise<FoUnit[]> {
  const [candRes, cuRes, esaRes, unitsRes, custRes, branchRes] = await Promise.all([
    supabase.from("candidates" as never).select("id,unit_id").eq("id", candidateId).maybeSingle(),
    supabase.from("candidate_units" as never).select("unit_id").eq("candidate_id", candidateId),
    supabase
      .from("employee_scope_assignments" as never)
      .select("scope_type,scope_id")
      .eq("candidate_id", candidateId),
    supabase.from("units" as never).select("id,name,code,customer_id,branch_id,billing_address1,billing_address2,billing_city,billing_state,latitude,longitude"),
    supabase.from("customers" as never).select("id,name"),
    supabase.from("branches" as never).select("id,name"),
  ]);

  const cand = (candRes.data ?? null) as unknown as { unit_id: string | null } | null;
  const cu = ((cuRes.data ?? []) as unknown) as Array<{ unit_id: string }>;
  const esa = ((esaRes.data ?? []) as unknown) as Array<{ scope_type: string; scope_id: string }>;
  const allUnits = ((unitsRes.data ?? []) as unknown) as Array<{
    id: string;
    name: string;
    code: string | null;
    customer_id: string | null;
    branch_id: string | null;
    billing_address1: string | null;
    billing_address2: string | null;
    billing_city: string | null;
    billing_state: string | null;
    latitude: number | null;
    longitude: number | null;
  }>;
  const customerMap = new Map(
    ((custRes.data ?? []) as unknown as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
  );
  const branchMap = new Map(
    ((branchRes.data ?? []) as unknown as Array<{ id: string; name: string }>).map((b) => [b.id, b.name]),
  );

  const branchIds = new Set(esa.filter((s) => s.scope_type === "branch").map((s) => s.scope_id));
  const customerIds = new Set(esa.filter((s) => s.scope_type === "customer").map((s) => s.scope_id));
  const scopedUnitIds = new Set<string>();
  if (cand?.unit_id) scopedUnitIds.add(cand.unit_id);
  for (const r of cu) scopedUnitIds.add(r.unit_id);
  for (const s of esa) if (s.scope_type === "unit") scopedUnitIds.add(s.scope_id);
  for (const u of allUnits) {
    if (u.branch_id && branchIds.has(u.branch_id)) scopedUnitIds.add(u.id);
    if (u.customer_id && customerIds.has(u.customer_id)) scopedUnitIds.add(u.id);
  }

  const list: FoUnit[] = [];
  for (const u of allUnits) {
    if (!scopedUnitIds.has(u.id)) continue;
    list.push({
      unit_id: u.id,
      unit_name: u.name,
      unit_code: u.code,
      customer_name: u.customer_id ? customerMap.get(u.customer_id) ?? null : null,
      branch_name: u.branch_id ? branchMap.get(u.branch_id) ?? null : null,
      address: [u.billing_address1, u.billing_address2, u.billing_city, u.billing_state].filter(Boolean).join(", ") || null,
      latitude: u.latitude,
      longitude: u.longitude,
    });
  }
  list.sort((a, b) => a.unit_name.localeCompare(b.unit_name));
  return list;
}

export function FieldOfficerFieldSense({ candidateId }: { candidateId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as {
    range?: string;
    start?: string;
    end?: string;
    highlight?: string;
  };
  const presetInput = (search.range as RangePreset | undefined) ?? "today";
  const validPreset: RangePreset = (
    ["today", "yesterday", "this_week", "this_month", "last_month", "last_quarter", "custom"] as RangePreset[]
  ).includes(presetInput) ? presetInput : "today";
  const rangeInfo = useMemo(
    () => resolveRange(validPreset, search.start ?? null, search.end ?? null),
    [validPreset, search.start, search.end],
  );
  const highlight = (search.highlight as "most" | "least" | "unvisited" | undefined) ?? undefined;
  const setRange = (preset: RangePreset, extra?: { start?: string; end?: string; highlight?: string | null }) => {
    void navigate({
      to: "/admin/field-sense",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        range: preset,
        start: preset === "custom" ? extra?.start ?? (prev.start as string | undefined) : undefined,
        end: preset === "custom" ? extra?.end ?? (prev.end as string | undefined) : undefined,
        highlight: extra?.highlight === null ? undefined : extra?.highlight ?? (prev.highlight as string | undefined),
      }),
      replace: true,
    });
  };

  const [mapKind, setMapKind] = useState<"street" | "satellite">("street");
  const [pos, setPos] = useState<Geo | null>(null);
  const [posError, setPosError] = useState<string | null>(null);

  // Map refs
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const tileRef = useRef<any>(null);
  const meMarkerRef = useRef<any>(null);
  const unitMarkersRef = useRef<Map<string, any>>(new Map());
  const trackLineRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const waypointMarkersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const lastRouteFitKeyRef = useRef("");

  // Data
  const unitsQ = useQuery({
    queryKey: ["fo-fs-units", candidateId],
    queryFn: () => loadFoUnits(candidateId),
    staleTime: 60_000,
  });
  const punchQ = useQuery({
    queryKey: ["fo-fs-punch", candidateId, todayPunchDate()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("self_attendance_punches" as never)
        .select("id, check_in_at, check_in_lat, check_in_lng, check_out_at, check_out_lat, check_out_lng")
        .eq("candidate_id", candidateId)
        .eq("punch_date", todayPunchDate())
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data as {
        id: string;
        check_in_at: string | null;
        check_in_lat: number | null;
        check_in_lng: number | null;
        check_out_at: string | null;
        check_out_lat: number | null;
        check_out_lng: number | null;
      } | null) ?? null;
    },
    refetchInterval: 30_000,
  });
  const visitsQ = useQuery({
    queryKey: ["fo-fs-visits", candidateId, todayPunchDate()],
    queryFn: () => fetchTodayVisits(candidateId),
    refetchInterval: 30_000,
  });
  const monthCountsQ = useQuery({
    queryKey: ["fo-fs-month-counts", candidateId, todayPunchDate().slice(0, 7)],
    queryFn: () => fetchMonthVisitCounts(candidateId),
    staleTime: 60_000,
  });
  const lastVisitQ = useQuery({
    queryKey: ["fo-fs-last-visit", candidateId],
    queryFn: () => fetchLastVisitPerUnit(candidateId),
    staleTime: 60_000,
  });
  const trackQ = useQuery({
    queryKey: ["fo-fs-track", candidateId, todayPunchDate()],
    queryFn: () => fetchTodayTrackPoints(candidateId),
    refetchInterval: 15_000,
  });
  const rangeVisitsQ = useQuery({
    queryKey: ["fo-fs-range-visits", candidateId, rangeInfo.start, rangeInfo.end],
    queryFn: () => fetchVisitsInRange(candidateId, rangeInfo.start, rangeInfo.end),
    staleTime: 30_000,
  });
  const requestsQ = useQuery({
    queryKey: ["fo-fs-requests", candidateId],
    queryFn: () => listOpenRequestsForCandidate(candidateId),
    refetchInterval: 20_000,
  });

  const units = unitsQ.data ?? [];
  const visits = visitsQ.data ?? [];
  const openVisit = visits.find((v) => !v.check_out_at) ?? null;
  const completedCount = visits.filter((v) => v.check_out_at).length;
  const isOnDuty = !!punchQ.data?.check_in_at && !punchQ.data?.check_out_at;
  const openVisitUnit = useMemo(
    () => (openVisit ? units.find((u) => u.unit_id === openVisit.unit_id) ?? null : null),
    [openVisit, units],
  );
  const snappedPosition = useMemo(() => unitGeo(openVisitUnit) ?? pos, [openVisitUnit, pos]);

  // Initial geolocation + polling for telemetry + track points
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function tick() {
      try {
        const geo = await getCurrentPosition();
        if (cancelled) return;
        setPos(geo);
        setPosError(null);

        // Only write track points + telemetry if on duty
        if (isOnDuty && punchQ.data?.id) {
          try {
            const [bat, net] = await Promise.all([readBattery(), readNetworkType()]);
            await pushTelemetry(punchQ.data.id, { geo, battery: bat, network: net });
          } catch { /* noop */ }
          try {
            await insertTrackPoint({
              candidateId,
              lat: geo.lat,
              lng: geo.lng,
              accuracy: geo.accuracy,
              visitId: openVisit?.id ?? null,
            });
            void qc.invalidateQueries({ queryKey: ["fo-fs-track", candidateId, todayPunchDate()] });
          } catch { /* noop */ }
        }
      } catch (err) {
        if (!cancelled) setPosError(err instanceof Error ? err.message : "Location unavailable");
      }
    }

    void tick();
    timer = window.setInterval(() => void tick(), TRACK_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [candidateId, isOnDuty, punchQ.data?.id, openVisit?.id, qc]);

  // Init map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !mapEl.current) return;
      LRef.current = L;
      const map = L.map(mapEl.current, {
        center: [20.5937, 78.9629],
        zoom: 5,
        zoomControl: true,
      });
      const tile = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      tileRef.current = tile;
      mapRef.current = map;
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      unitMarkersRef.current.clear();
      trackLineRef.current = null;
      meMarkerRef.current = null;
    };
  }, []);

  // Switch tile layer between street/satellite
  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;
    if (tileRef.current) map.removeLayer(tileRef.current);
    if (mapKind === "street") {
      tileRef.current = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
    } else {
      tileRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "© Esri, Maxar, Earthstar Geographics", maxZoom: 19 },
      ).addTo(map);
    }
  }, [mapKind, mapReady]);

  // Sync unit markers
  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;
    const seen = new Set<string>();
    for (const u of units) {
      if (u.latitude == null || u.longitude == null) continue;
      seen.add(u.unit_id);
      const html = `<div style="width:28px;height:28px;border-radius:8px;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;box-shadow:0 3px 10px rgba(0,0,0,0.35);border:2px solid #fff;">📍</div>`;
      const icon = L.divIcon({ className: "fo-fs-unit-pin", html, iconSize: [28, 28], iconAnchor: [14, 14] });
      const existing = unitMarkersRef.current.get(u.unit_id);
      const popup = `<div style="font-family:ui-sans-serif,system-ui;min-width:180px;">
        <div style="font-weight:700;font-size:13px;color:#0f172a;">${u.unit_name}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${u.customer_name ?? "—"}${u.branch_name ? " · " + u.branch_name : ""}</div>
      </div>`;
      if (existing) {
        existing.setLatLng([u.latitude, u.longitude]);
        existing.setPopupContent(popup);
      } else {
        const m = L.marker([u.latitude, u.longitude], { icon }).addTo(map);
        m.bindPopup(popup);
        unitMarkersRef.current.set(u.unit_id, m);
      }
    }
    for (const [id, m] of unitMarkersRef.current) {
      if (!seen.has(id)) {
        map.removeLayer(m);
        unitMarkersRef.current.delete(id);
      }
    }
  }, [units, mapReady]);

  // Sync "me" marker
  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current || !snappedPosition) return;
    const L = LRef.current;
    const map = mapRef.current;
    const html = `<div style="position:relative;display:flex;align-items:center;justify-content:center;">
      <div style="width:36px;height:36px;border-radius:50%;background:#fff;border:3px solid #2563eb;box-shadow:0 4px 14px rgba(37,99,235,0.55);display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;">🏍️</div>
      <span style="position:absolute;inset:-6px;border-radius:50%;border:2px solid #2563eb;opacity:0.45;animation:fs-ping 1.6s ease-out infinite;"></span>
    </div>`;
    const icon = L.divIcon({ className: "fo-fs-me-pin", html, iconSize: [36, 36], iconAnchor: [18, 18] });
    if (meMarkerRef.current) {
      meMarkerRef.current.setLatLng([snappedPosition.lat, snappedPosition.lng]);
    } else {
      meMarkerRef.current = L.marker([snappedPosition.lat, snappedPosition.lng], { icon, zIndexOffset: 1000 }).addTo(map);
      meMarkerRef.current.bindPopup("You are here");
    }
  }, [snappedPosition, mapReady]);

  const track = trackQ.data ?? [];
  const routeCoords = useMemo(() => {
    const points: RouteCoord[] = [];
    const punch = punchQ.data;
    if (punch?.check_in_at && hasGeo(punch.check_in_lat, punch.check_in_lng)) {
      pushRouteCoord(points, {
        lat: Number(punch.check_in_lat),
        lng: Number(punch.check_in_lng),
        at: punch.check_in_at,
        kind: "punch-in",
      });
    }

    const events: RouteCoord[] = [];
    const hasVisitWaypoints = visits.length > 0;
    if (!hasVisitWaypoints) {
      for (const t of track) {
        events.push({
          lat: Number(t.lat),
          lng: Number(t.lng),
          at: t.recorded_at,
          kind: "track",
        });
      }
    }
    for (const v of visits) {
      const unit = units.find((u) => u.unit_id === v.unit_id) ?? null;
      const geo = unitGeo(unit);
      const siteLat = geo?.lat ?? v.check_in_lat;
      const siteLng = geo?.lng ?? v.check_in_lng;
      if (v.check_in_at && hasGeo(siteLat, siteLng)) {
        events.push({ lat: Number(siteLat), lng: Number(siteLng), at: v.check_in_at, kind: "visit-in" });
      }
      const outLat = geo?.lat ?? v.check_out_lat;
      const outLng = geo?.lng ?? v.check_out_lng;
      if (v.check_out_at && hasGeo(outLat, outLng)) {
        events.push({ lat: Number(outLat), lng: Number(outLng), at: v.check_out_at, kind: "visit-out" });
      }
    }
    if (snappedPosition && isOnDuty) {
      events.push({ lat: snappedPosition.lat, lng: snappedPosition.lng, at: new Date().toISOString(), kind: "current" });
    }
    if (punch?.check_out_at && hasGeo(punch.check_out_lat, punch.check_out_lng)) {
      events.push({
        lat: Number(punch.check_out_lat),
        lng: Number(punch.check_out_lng),
        at: punch.check_out_at,
        kind: "punch-out",
      });
    }

    events
      .filter((event) => Number.isFinite(event.lat) && Number.isFinite(event.lng) && !!event.at)
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      .forEach((event) => pushRouteCoord(points, event));

    return points;
  }, [isOnDuty, punchQ.data, snappedPosition, track, units, visits]);

  // Road-following bike route (OSRM public cycling profile).
  // Snaps waypoints to actual roads so the polyline follows streets instead of
  // drawing straight aerial lines, and returns realistic riding distance.
  const [roadRoute, setRoadRoute] = useState<{ key: string; coords: Array<[number, number]>; meters: number } | null>(null);
  const roadRouteKey = useMemo(
    () => routeCoords.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|"),
    [routeCoords],
  );
  useEffect(() => {
    if (routeCoords.length < 2) { setRoadRoute(null); return; }
    let cancelled = false;
    const coordsParam = routeCoords.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/cycling/${coordsParam}?overview=full&geometries=geojson`;
    (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`OSRM ${r.status}`);
        const j: any = await r.json();
        const route = j?.routes?.[0];
        if (!route?.geometry?.coordinates?.length) throw new Error("no route");
        const coords: Array<[number, number]> = route.geometry.coordinates.map(
          (c: [number, number]) => [c[1], c[0]],
        );
        if (!cancelled) setRoadRoute({ key: roadRouteKey, coords, meters: Number(route.distance) || 0 });
      } catch {
        if (!cancelled) setRoadRoute(null);
      }
    })();
    return () => { cancelled = true; };
  }, [roadRouteKey, routeCoords]);

  // Sync complete route polyline: attendance start → site 1 → site 2 → current/checkout.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;
    if (trackLineRef.current) {
      map.removeLayer(trackLineRef.current);
      trackLineRef.current = null;
    }
    // Clear prior numbered waypoint markers
    for (const m of waypointMarkersRef.current) {
      try { map.removeLayer(m); } catch { /* noop */ }
    }
    waypointMarkersRef.current = [];

    const coords: Array<[number, number]> = routeCoords.map((point) => [point.lat, point.lng]);
    if (coords.length < 2) return;
    const drawCoords: Array<[number, number]> =
      roadRoute && roadRoute.key === roadRouteKey && roadRoute.coords.length >= 2
        ? roadRoute.coords
        : coords;
    trackLineRef.current = L.polyline(drawCoords, {
      color: "#2563eb",
      weight: 5,
      opacity: 0.9,
    }).addTo(map);
    trackLineRef.current.bringToFront();

    // Numbered waypoint pins: S = start (punch-in), 1..N = site visits, E = checkout
    let visitCounter = 0;
    for (const point of routeCoords) {
      let label: string | null = null;
      let bg = "#2563eb";
      if (point.kind === "punch-in") { label = "S"; bg = "#0f766e"; }
      else if (point.kind === "visit-in") { visitCounter += 1; label = String(visitCounter); bg = "#2563eb"; }
      else if (point.kind === "punch-out") { label = "E"; bg = "#b91c1c"; }
      if (!label) continue;
      const html = `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:${bg};color:#fff;font-weight:700;font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${label}</div>`;
      const icon = L.divIcon({ className: "fo-fs-wp-pin", html, iconSize: [26, 26], iconAnchor: [13, 13] });
      const m = L.marker([point.lat, point.lng], { icon, zIndexOffset: 950 }).addTo(map);
      waypointMarkersRef.current.push(m);
    }

    const fitKey = routeCoords.map((point) => `${point.kind}:${point.lat.toFixed(5)},${point.lng.toFixed(5)}`).join("|");
    if (fitKey && fitKey !== lastRouteFitKeyRef.current) {
      lastRouteFitKeyRef.current = fitKey;
      try {
        const bounds = L.latLngBounds(coords);
        // Single-point route: center and zoom in close
        if (coords.length === 1 || bounds.getNorthEast().equals(bounds.getSouthWest())) {
          map.setView(coords[0], 17, { animate: true });
        } else {
          map.fitBounds(bounds.pad(0.15), { maxZoom: 17, animate: true });
        }
      } catch {
        /* noop */
      }
    }
  }, [routeCoords, mapReady, roadRoute, roadRouteKey]);

  // Active-visit route: check-in origin → current position → destination unit.
  // Simulates a live navigation trail so the FO can see the intended route + km to destination.
  const distanceToDest = useMemo(() => {
    if (!openVisitUnit || openVisitUnit.latitude == null || openVisitUnit.longitude == null) return null;
    const from = snappedPosition ?? (openVisit && openVisit.check_in_lat != null && openVisit.check_in_lng != null
      ? { lat: Number(openVisit.check_in_lat), lng: Number(openVisit.check_in_lng) }
      : null);
    if (!from) return null;
    return distanceMeters(from, { lat: Number(openVisitUnit.latitude), lng: Number(openVisitUnit.longitude) });
  }, [openVisit, openVisitUnit, snappedPosition]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;
    // Clear previous
    if (routeLineRef.current) { map.removeLayer(routeLineRef.current); routeLineRef.current = null; }
    if (destMarkerRef.current) { map.removeLayer(destMarkerRef.current); destMarkerRef.current = null; }
    if (!openVisit || !openVisitUnit || openVisitUnit.latitude == null || openVisitUnit.longitude == null) return;
    const origin: [number, number] | null = routeCoords.length
      ? [routeCoords[routeCoords.length - 1].lat, routeCoords[routeCoords.length - 1].lng]
      : snappedPosition ? [snappedPosition.lat, snappedPosition.lng] : null;
    if (!origin) return;
    const dest: [number, number] = [Number(openVisitUnit.latitude), Number(openVisitUnit.longitude)];
    const coords: Array<[number, number]> = [origin];
    if (snappedPosition) coords.push([snappedPosition.lat, snappedPosition.lng]);
    coords.push(dest);
    routeLineRef.current = L.polyline(coords, {
      color: "#f59e0b",
      weight: 5,
      opacity: 0.9,
    }).addTo(map);
    const destHtml = `<div style="width:30px;height:30px;border-radius:50%;background:#f59e0b;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;box-shadow:0 4px 12px rgba(245,158,11,0.55);border:3px solid #fff;">🏁</div>`;
    const destIcon = L.divIcon({ className: "fo-fs-dest-pin", html: destHtml, iconSize: [30, 30], iconAnchor: [15, 15] });
    destMarkerRef.current = L.marker(dest, { icon: destIcon, zIndexOffset: 900 }).addTo(map);
    destMarkerRef.current.bindPopup(`Destination: ${openVisitUnit.unit_name}`);
    // Full route fitting is handled by the main route polyline so the entire
    // day path remains visible, not only the active destination segment.
  }, [openVisit, openVisitUnit, snappedPosition, routeCoords, mapReady]);

  // Auto-fit map bounds once when we have data
  const didFitRef = useRef(false);
  useEffect(() => {
    if (didFitRef.current) return;
    if (!mapReady || !mapRef.current || !LRef.current) return;
    const L = LRef.current;
    const pts: Array<[number, number]> = routeCoords.map((point) => [point.lat, point.lng]);
    for (const u of units) if (u.latitude != null && u.longitude != null) pts.push([Number(u.latitude), Number(u.longitude)]);
    if (snappedPosition) pts.push([snappedPosition.lat, snappedPosition.lng]);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      mapRef.current.setView(pts[0], 16, { animate: true });
    } else {
      mapRef.current.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 17 });
    }
    didFitRef.current = true;
  }, [routeCoords, units, snappedPosition, mapReady]);

  // Distance list from current position
  const distances = useMemo(() => {
    if (!snappedPosition) return [];
    return units
      .filter((u) => u.latitude != null && u.longitude != null)
      .map((u) => ({
        unit: u,
        d: distanceMeters(snappedPosition, { lat: Number(u.latitude), lng: Number(u.longitude) }) ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => a.d - b.d);
  }, [snappedPosition, units]);

  // Total kms today
  const totalKmToday = useMemo(() => {
    if (roadRoute && roadRoute.key === roadRouteKey && roadRoute.meters > 0) {
      return roadRoute.meters / 1000;
    }
    if (routeCoords.length < 2) return 0;
    let sum = 0;
    for (let i = 1; i < routeCoords.length; i += 1) {
      const a = routeCoords[i - 1];
      const b = routeCoords[i];
      const d = distanceMeters({ lat: Number(a.lat), lng: Number(a.lng) }, { lat: Number(b.lat), lng: Number(b.lng) });
      if (d != null) sum += d;
    }
    return sum / 1000;
  }, [routeCoords, roadRoute, roadRouteKey]);

  // Check-in / Check-out dialogs
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [preselectUnitId, setPreselectUnitId] = useState<string | null>(null);
  const [checkOutOpen, setCheckOutOpen] = useState(false);

  const nextSeq = (visits[visits.length - 1]?.visit_seq ?? 0) + 1;

  // Total on-duty time (mm) for the day
  const totalMinutesOnDuty = useMemo(() => {
    if (!punchQ.data?.check_in_at) return 0;
    const start = new Date(punchQ.data.check_in_at).getTime();
    const end = punchQ.data.check_out_at ? new Date(punchQ.data.check_out_at).getTime() : Date.now();
    return Math.max(0, Math.round((end - start) / 60000));
  }, [punchQ.data?.check_in_at, punchQ.data?.check_out_at]);

  // Attendance checkout (from the map card)
  const attendanceOutMut = useMutation({
    mutationFn: async () => {
      if (!punchQ.data?.id) throw new Error("No active check-in.");
      let face = false;
      try {
        face = await verifyFaceForAttendance("Check out of duty");
      } catch (err) {
        // Face ID is optional on web — on native, verifyFaceForAttendance throws which we rethrow.
        throw err;
      }
      const geo = await getCurrentPosition();
      return await attendanceCheckOut(punchQ.data.id, geo, face);
    },
    onSuccess: () => {
      toast.success("Duty ended for today");
      void qc.invalidateQueries({ queryKey: ["fo-fs-punch", candidateId, todayPunchDate()] });
      void qc.invalidateQueries({ queryKey: ["self-attendance-today", candidateId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Check-out failed"),
  });


  return (
    <div className="space-y-4">
      <style>{`@keyframes fs-ping { 0% { transform: scale(1); opacity: 0.6;} 80%,100% { transform: scale(1.8); opacity: 0;} }`}</style>

      {/* Duty status banner */}
      {!isOnDuty && (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          Mark your attendance from the dashboard to start tracking visits.
        </div>
      )}

      {/* Emergency / admin-requested visits */}
      <RequestedVisitsPanel
        requests={requestsQ.data ?? []}
        units={units}
        onAcknowledge={async (id) => {
          try {
            await acknowledgeFieldVisitRequest(id);
            toast.success("Acknowledged");
            void qc.invalidateQueries({ queryKey: ["fo-fs-requests", candidateId] });
          } catch (e) {
            toast.error((e as Error).message ?? "Failed");
          }
        }}
        onStartVisit={(unitId) => {
          // Preselect the unit and open the check-in dialog
          setPreselectUnitId(unitId);
          setCheckInOpen(true);
        }}
      />

      {/* Primary CTA */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Today</div>
          {openVisit ? (
            <>
              <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
                In meeting at {openVisitUnit?.unit_name ?? "site"}
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                {completedCount} completed · {totalKmToday.toFixed(2)} km traveled
                {distanceToDest != null ? ` · ${formatDistance(distanceToDest)} to destination` : ""}
              </div>
            </>
          ) : (
            <div className="mt-0.5 text-sm font-semibold text-foreground">
              {completedCount} visit{completedCount === 1 ? "" : "s"} completed · {totalKmToday.toFixed(2)} km traveled
            </div>
          )}
          {posError && <div className="mt-0.5 text-[11px] font-semibold text-rose-600">{posError}</div>}
        </div>
        {openVisit ? (
          <Button
            size="lg"
            className="h-11 w-full sm:w-auto"
            onClick={() => setCheckOutOpen(true)}
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            Complete visit #{openVisit.visit_seq}
          </Button>
        ) : (
          <Button
            size="lg"
            className="h-11 w-full sm:w-auto"
            disabled={!isOnDuty || !pos}
            onClick={() => setCheckInOpen(true)}
          >
            <MapPin className="mr-1.5 h-4 w-4" />
            Check in your {nextSeq === 1 ? "first" : nextSeq === 2 ? "second" : nextSeq === 3 ? "third" : `${nextSeq}${nextSeq === 4 ? "th" : "th"}`} visit
          </Button>
        )}
      </div>

      {/* Map + Timeline side-by-side (stacks on mobile) */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr,340px]">
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Live map</div>
            <div className="inline-flex rounded-lg border border-border/60 bg-background p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setMapKind("street")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1",
                  mapKind === "street" ? "bg-foreground text-background" : "text-muted-foreground",
                )}
              >
                <MapIcon className="h-3 w-3" /> Map
              </button>
              <button
                type="button"
                onClick={() => setMapKind("satellite")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1",
                  mapKind === "satellite" ? "bg-foreground text-background" : "text-muted-foreground",
                )}
              >
                <Satellite className="h-3 w-3" /> Satellite
              </button>
            </div>
          </div>
          <div ref={mapEl} style={{ height: "480px", width: "100%" }} />
          {/* KPI strip under the map */}
          <div className="grid grid-cols-3 divide-x divide-border/50 border-t border-border/50 bg-background/40 text-center">
            <div className="px-2 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Visits</div>
              <div className="text-sm font-bold text-foreground">{completedCount}{openVisit ? ` +1` : ""}</div>
            </div>
            <div className="px-2 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Distance</div>
              <div className="text-sm font-bold text-foreground">{totalKmToday.toFixed(2)} km</div>
            </div>
            <div className="px-2 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">On duty</div>
              <div className="text-sm font-bold text-foreground">
                {isOnDuty || punchQ.data?.check_out_at
                  ? `${Math.floor(totalMinutesOnDuty / 60)}h ${totalMinutesOnDuty % 60}m`
                  : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Timeline column */}
        <FieldSenseTimeline
          punchInAt={punchQ.data?.check_in_at ?? null}
          punchOutAt={punchQ.data?.check_out_at ?? null}
          visits={visits}
          units={units}
          openVisit={openVisit}
          openVisitUnit={openVisitUnit}
          distanceToDest={distanceToDest}
          totalKmToday={totalKmToday}
          isOnDuty={isOnDuty}
          onCompleteVisit={() => setCheckOutOpen(true)}
          onCheckOutDuty={() => attendanceOutMut.mutate()}
          checkingOutDuty={attendanceOutMut.isPending}
        />
      </div>


      {/* Distances strip */}
      {distances.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Distance from you
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {distances.slice(0, 8).map(({ unit, d }) => (
              <div key={unit.unit_id} className="rounded-xl border border-border/50 bg-background/60 p-2.5">
                <div className="truncate text-[12px] font-semibold text-foreground">{unit.unit_name}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{unit.customer_name ?? "—"}</div>
                <div className="mt-1 flex items-center gap-1 text-[12px] font-bold text-sky-700 dark:text-sky-300">
                  <Navigation className="h-3 w-3" /> {formatDistance(d)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Units list */}
      <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
          My units ({units.length})
        </div>
        {unitsQ.isLoading ? (
          <div className="py-4 text-center text-[11px] italic text-muted-foreground">Loading…</div>
        ) : units.length === 0 ? (
          <div className="py-4 text-center text-[11px] italic text-muted-foreground">No units mapped to you yet.</div>
        ) : (
          <ul className="space-y-2">
            {units.map((u) => {
              const last = lastVisitQ.data?.get(u.unit_id) ?? null;
              const count = monthCountsQ.data?.get(u.unit_id) ?? 0;
              const href = mapsUrl(u.latitude, u.longitude);
              return (
                <li key={u.unit_id} className="rounded-xl border border-border/50 bg-background/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {u.unit_name}
                        {u.unit_code && (
                          <span className="ml-1 font-mono text-[10px] text-muted-foreground">({u.unit_code})</span>
                        )}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {u.customer_name ?? "—"}{u.branch_name ? ` · ${u.branch_name}` : ""}
                      </div>
                      {u.address && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{u.address}</div>}
                    </div>
                    <div className="text-right text-[10px] font-semibold text-muted-foreground">
                      <div>Last visit</div>
                      <div className="text-foreground">{whenAgo(last)}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-1 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200"
                      >
                        <MapPin className="h-3 w-3" />
                        {Number(u.latitude).toFixed(4)}, {Number(u.longitude).toFixed(4)}
                      </a>
                    ) : (
                      <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground italic">no geo</span>
                    )}
                    <span className="rounded-md bg-emerald-100 px-2 py-1 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
                      {count} visit{count === 1 ? "" : "s"} this month
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Range-driven visit history & insights */}
      <RangeInsightsPanel
        units={units}
        visits={rangeVisitsQ.data ?? []}
        loading={rangeVisitsQ.isLoading}
        rangeInfo={rangeInfo}
        highlight={highlight}
        onChangePreset={(preset) => setRange(preset, { highlight: null })}
        onChangeCustom={(start, end) => setRange("custom", { start, end, highlight: null })}
        onClearHighlight={() => setRange(validPreset, { highlight: null })}
      />


      {checkInOpen && (
        <CheckInDialog
          candidateId={candidateId}
          units={units}
          pos={pos}
          nextSeq={nextSeq}
          preselectUnitId={preselectUnitId}
          prevPoint={
            visits.length > 0
              ? { lat: visits[visits.length - 1].check_out_lat, lng: visits[visits.length - 1].check_out_lng }
              : null
          }
          onClose={() => {
            setCheckInOpen(false);
            setPreselectUnitId(null);
          }}
          onDone={() => {
            setCheckInOpen(false);
            setPreselectUnitId(null);
            void qc.invalidateQueries({ queryKey: ["fo-fs-visits", candidateId, todayPunchDate()] });
            void qc.invalidateQueries({ queryKey: ["fo-fs-track", candidateId, todayPunchDate()] });
            void qc.invalidateQueries({ queryKey: ["fo-fs-requests", candidateId] });
          }}
        />
      )}

      {checkOutOpen && openVisit && (
        <CheckOutDialog
          candidateId={candidateId}
          visit={openVisit}
          unit={units.find((u) => u.unit_id === openVisit.unit_id) ?? null}
          pos={pos}
          onClose={() => setCheckOutOpen(false)}
          onDone={() => {
            setCheckOutOpen(false);
            void qc.invalidateQueries({ queryKey: ["fo-fs-visits", candidateId, todayPunchDate()] });
            void qc.invalidateQueries({ queryKey: ["fo-fs-track", candidateId, todayPunchDate()] });
            void qc.invalidateQueries({ queryKey: ["fo-fs-month-counts", candidateId, todayPunchDate().slice(0, 7)] });
            void qc.invalidateQueries({ queryKey: ["fo-fs-last-visit", candidateId] });
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------ Check-in dialog ------------------------------ */
function CheckInDialog({
  candidateId,
  units,
  pos,
  nextSeq,
  prevPoint,
  onClose,
  onDone,
}: {
  candidateId: string;
  units: FoUnit[];
  pos: Geo | null;
  nextSeq: number;
  prevPoint: { lat: number | null; lng: number | null } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const nearest = useMemo(() => (pos ? findNearestUnit(units, pos, NEAREST_MAX_METERS) : null), [pos, units]);
  const [selectedId, setSelectedId] = useState<string>(nearest?.unit.unit_id ?? units[0]?.unit_id ?? "");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!pos) throw new Error("Location not available.");
      if (!selectedId) throw new Error("Select a unit.");
      const unit = units.find((u) => u.unit_id === selectedId) ?? null;
      const visit = await createVisit({
        candidateId,
        unitId: selectedId,
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        visitSeq: nextSeq,
        prevLat: prevPoint?.lat ?? null,
        prevLng: prevPoint?.lng ?? null,
      });
      // Simulate arrival: snap a track point to the unit so the map draws the
      // route from the previous location all the way to the site.
      if (unit && unit.latitude != null && unit.longitude != null) {
        try {
          await insertTrackPoint({
            candidateId,
            lat: Number(unit.latitude),
            lng: Number(unit.longitude),
            accuracy: null,
            visitId: visit.id,
          });
        } catch { /* noop */ }
      }
      // Auto-complete any open admin request for this FO+unit
      try {
        await completeFieldVisitRequestForUnit({
          candidateId,
          unitId: selectedId,
          visitId: visit.id,
        });
      } catch { /* noop */ }
    },
    onSuccess: () => {
      toast.success("Checked in");
      onDone();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to check in");
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Check in — visit #{nextSeq}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {nearest && nearest.distance <= NEAREST_MAX_METERS ? (
            <div className="rounded-xl border border-emerald-300/60 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
              Nearest unit: <span className="font-bold">{nearest.unit.unit_name}</span> ({formatDistance(nearest.distance)} away).
            </div>
          ) : (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              No unit within {NEAREST_MAX_METERS}m of your location. Pick manually.
            </div>
          )}
          <label className="block text-[11px] font-semibold text-muted-foreground">Unit</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
          >
            {units.map((u) => (
              <option key={u.unit_id} value={u.unit_id}>
                {u.unit_name}
                {u.customer_name ? ` — ${u.customer_name}` : ""}
              </option>
            ))}
          </select>
          {pos && (
            <div className="text-[11px] text-muted-foreground">
              Location: {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)} (±{Math.round(pos.accuracy)}m)
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !pos || !selectedId}>
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Confirm check-in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Check-out dialog ------------------------------ */
function CheckOutDialog({
  candidateId,
  visit,
  unit,
  pos,
  onClose,
  onDone,
}: {
  candidateId: string;
  visit: FieldVisit;
  unit: FoUnit | null;
  pos: Geo | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [notes, setNotes] = useState<string>(visit.visit_notes ?? "");
  const [rating, setRating] = useState<number>(visit.customer_rating ?? 0);
  const [clientName, setClientName] = useState<string>(visit.client_name ?? "");
  const [signature, setSignature] = useState<string>("");
  const [clientPhoto, setClientPhoto] = useState<string>("");
  // (photo capture now handled by capturePhoto helper — no hidden input needed)

  const missing: string[] = [];
  if (!notes.trim()) missing.push("visit notes");
  if (!rating) missing.push("customer rating");
  if (!signature) missing.push("client signature");
  if (!clientPhoto) missing.push("client photo");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!pos) throw new Error("Location not available for checkout.");
      if (missing.length) throw new Error(`Missing: ${missing.join(", ")}`);
      const sigPath = await uploadVisitProof({
        candidateId,
        visitId: visit.id,
        kind: "signature",
        dataUrl: signature,
      });
      const clientPath = await uploadVisitProof({
        candidateId,
        visitId: visit.id,
        kind: "client",
        dataUrl: clientPhoto,
      });
      // Snap a checkout track point to the unit so the polyline closes on-site
      // before the next segment starts.
      if (unit && unit.latitude != null && unit.longitude != null) {
        try {
          await insertTrackPoint({
            candidateId,
            lat: Number(unit.latitude),
            lng: Number(unit.longitude),
            accuracy: null,
            visitId: visit.id,
          });
        } catch { /* noop */ }
      }
      await completeVisit({
        id: visit.id,
        lat: unit?.latitude != null ? Number(unit.latitude) : pos.lat,
        lng: unit?.longitude != null ? Number(unit.longitude) : pos.lng,
        visitNotes: notes.trim(),
        customerRating: rating,
        clientSignatureUrl: sigPath,
        clientPhotoUrl: clientPath,
        clientName: clientName.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success("Visit completed");
      onDone();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to check out");
    },
  });




  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Complete visit #{visit.visit_seq} — {unit?.unit_name ?? "Unit"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Site visit notes *</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Describe what you inspected, observations, action items…"
              className="text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Customer feedback *</label>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => {
                const n = i + 1;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className="p-1"
                    aria-label={`${n} stars`}
                  >
                    <Star
                      className={cn(
                        "h-7 w-7 transition-colors",
                        n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300",
                      )}
                    />
                  </button>
                );
              })}
              <span className="ml-2 text-xs font-semibold text-muted-foreground">
                {rating ? `${rating} / 5` : "Tap to rate"}
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Client name (optional)</label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Mr. Sharma, Branch Manager"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Client signature *</label>
            <SignaturePad value={signature} onChange={(v) => setSignature(v)} height={140} />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Client photo *</label>
            {clientPhoto ? (
              <div className="relative">
                <img src={clientPhoto} alt="Client" className="w-full rounded-lg border border-border object-cover" />
                <button
                  type="button"
                  onClick={() => setClientPhoto("")}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"
                  aria-label="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const url = await capturePhoto();
                  if (url) setClientPhoto(url);
                }}
                className="flex h-32 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/30 text-sm font-semibold text-muted-foreground"
              >
                <Camera className="h-4 w-4" /> {isNativePlatform() ? "Open camera" : "Capture client photo"}
              </button>
            )}
          </div>


          {missing.length > 0 && (
            <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-2 text-[11px] font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              Missing: {missing.join(", ")}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || missing.length > 0 || !pos}>
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Complete visit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Small helper to resolve signed URL for a stored proof path (for admin views). */
export async function resolveProofUrl(path: string | null) {
  return signedProofUrl(path);
}

// ---------------------------------------------------------------------------
// Timeline column
// ---------------------------------------------------------------------------

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function FieldSenseTimeline(props: {
  punchInAt: string | null;
  punchOutAt: string | null;
  visits: FieldVisit[];
  units: FoUnit[];
  openVisit: FieldVisit | null;
  openVisitUnit: FoUnit | null;
  distanceToDest: number | null;
  totalKmToday: number;
  isOnDuty: boolean;
  onCompleteVisit: () => void;
  onCheckOutDuty: () => void;
  checkingOutDuty: boolean;
}) {
  const {
    punchInAt,
    punchOutAt,
    visits,
    units,
    openVisit,
    openVisitUnit,
    distanceToDest,
    totalKmToday,
    isOnDuty,
    onCompleteVisit,
    onCheckOutDuty,
    checkingOutDuty,
  } = props;

  const unitFor = (id: string) => units.find((u) => u.unit_id === id) ?? null;
  const completedVisits = visits.filter((v) => v.check_out_at);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
          Today's timeline
        </div>
        <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
          <RouteIcon className="h-3 w-3" /> {totalKmToday.toFixed(2)} km
        </div>
      </div>

      <div className="flex-1 space-y-0 overflow-y-auto px-3 py-3">
        {/* Punch-in */}
        <TimelineRow
          color="emerald"
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          title="Punched in"
          time={fmtTime(punchInAt)}
          subtitle={punchInAt ? "Duty started" : "Not on duty yet"}
        />

        {/* Completed visits */}
        {completedVisits.map((v) => {
          const u = unitFor(v.unit_id);
          return (
            <TimelineRow
              key={v.id}
              color="sky"
              icon={<Flag className="h-3.5 w-3.5" />}
              title={`Visit #${v.visit_seq} · ${u?.unit_name ?? "Unit"}`}
              time={`${fmtTime(v.check_in_at)} → ${fmtTime(v.check_out_at)}`}
              subtitle={u?.address ?? u?.customer_name ?? ""}
              chip={v.customer_rating != null ? `★ ${v.customer_rating}` : undefined}
            />
          );
        })}

        {/* Active visit */}
        {openVisit && (
          <TimelineRow
            color="amber"
            pulsing
            icon={<Navigation className="h-3.5 w-3.5" />}
            title={`In meeting · ${openVisitUnit?.unit_name ?? "Unit"}`}
            time={`${fmtTime(openVisit.check_in_at)} · now`}
            subtitle={
              openVisitUnit?.address ??
              (distanceToDest != null ? `${formatDistance(distanceToDest)} to destination` : "")
            }
            action={
              <Button
                size="sm"
                className="mt-2 h-8 w-full rounded-lg bg-emerald-600 text-[12px] font-semibold text-white hover:bg-emerald-700"
                onClick={onCompleteVisit}
              >
                Complete visit
              </Button>
            }
          />
        )}

        {/* Punch-out (if done) */}
        {punchOutAt && (
          <TimelineRow
            color="slate"
            icon={<Clock className="h-3.5 w-3.5" />}
            title="Punched out"
            time={fmtTime(punchOutAt)}
            subtitle="Duty ended"
          />
        )}

        {!punchInAt && visits.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-[12px] text-muted-foreground">
            Mark your attendance to start the day.
          </div>
        )}
      </div>

      {/* Attendance checkout */}
      {isOnDuty && (
        <div className="border-t border-border/50 bg-background/40 px-3 py-2">
          <Button
            size="sm"
            variant="outline"
            className="h-9 w-full rounded-lg border-rose-200 text-[12px] font-semibold text-rose-600 hover:bg-rose-50"
            onClick={onCheckOutDuty}
            disabled={checkingOutDuty || !!openVisit}
          >
            {checkingOutDuty ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
            )}
            {openVisit ? "Complete visit to end duty" : "End duty & check out"}
          </Button>
        </div>
      )}
    </div>
  );
}

function TimelineRow(props: {
  color: "emerald" | "sky" | "amber" | "slate";
  icon: React.ReactNode;
  title: string;
  time: string;
  subtitle?: string;
  chip?: string;
  action?: React.ReactNode;
  pulsing?: boolean;
}) {
  const { color, icon, title, time, subtitle, chip, action, pulsing } = props;
  const dotColor: Record<typeof props.color, string> = {
    emerald: "bg-emerald-500",
    sky: "bg-sky-500",
    amber: "bg-amber-500",
    slate: "bg-slate-400",
  };
  return (
    <div className="relative flex gap-3 py-2">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full text-white shadow-sm",
            dotColor[color],
            pulsing && "ring-4 ring-amber-200 animate-pulse",
          )}
        >
          {icon}
        </div>
        <div className="mt-1 w-px flex-1 bg-border/70" />
      </div>
      <div className="flex-1 pb-1">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[12.5px] font-semibold text-foreground leading-snug">{title}</div>
          {chip && (
            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
              {chip}
            </span>
          )}
        </div>
        <div className="text-[11px] font-medium text-muted-foreground">{time}</div>
        {subtitle && (
          <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{subtitle}</div>
        )}
        {action}
      </div>
    </div>
  );
}

type RangeInsightsProps = {
  units: FoUnit[];
  visits: FieldVisit[];
  loading: boolean;
  rangeInfo: { start: string; end: string; label: string; preset: RangePreset };
  highlight?: "most" | "least" | "unvisited";
  onChangePreset: (preset: RangePreset) => void;
  onChangeCustom: (start: string, end: string) => void;
  onClearHighlight: () => void;
};

function RangeInsightsPanel({
  units,
  visits,
  loading,
  rangeInfo,
  highlight,
  onChangePreset,
  onChangeCustom,
  onClearHighlight,
}: RangeInsightsProps) {
  const completed = visits.filter((v) => v.check_out_at);
  const totalVisits = completed.length;
  const rated = completed.filter((v) => v.customer_rating != null);
  const avgRating = rated.length
    ? rated.reduce((s, v) => s + (v.customer_rating ?? 0), 0) / rated.length
    : 0;

  const perUnit = new Map<string, number>();
  for (const v of completed) perUnit.set(v.unit_id, (perUnit.get(v.unit_id) ?? 0) + 1);
  const withCount = units.map((u) => ({ u, count: perUnit.get(u.unit_id) ?? 0 }));
  const visited = withCount.filter((r) => r.count > 0);
  const mostVisited = visited.length ? [...visited].sort((a, b) => b.count - a.count)[0] : null;
  const leastVisited = visited.length
    ? [...visited].sort((a, b) => a.count - b.count)[0]
    : null;
  const unvisited = withCount.filter((r) => r.count === 0);

  const highlightUnitIds = new Set<string>();
  if (highlight === "most" && mostVisited) highlightUnitIds.add(mostVisited.u.unit_id);
  else if (highlight === "least" && leastVisited) highlightUnitIds.add(leastVisited.u.unit_id);
  else if (highlight === "unvisited") for (const r of unvisited) highlightUnitIds.add(r.u.unit_id);

  const displayed =
    highlight === "unvisited"
      ? []
      : highlight && highlightUnitIds.size
      ? completed.filter((v) => highlightUnitIds.has(v.unit_id))
      : completed;

  const highlightLabel =
    highlight === "most"
      ? "Most visited"
      : highlight === "least"
      ? "Least visited"
      : highlight === "unvisited"
      ? "Not visited"
      : null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
      {/* Range filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Range</div>
        <div className="flex flex-wrap gap-1">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onChangePreset(p.value)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                rangeInfo.preset === p.value
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/70",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {rangeInfo.preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={rangeInfo.start}
              onChange={(e) => onChangeCustom(e.target.value, rangeInfo.end)}
              className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px]"
            />
            <span className="text-[11px] text-muted-foreground">to</span>
            <input
              type="date"
              value={rangeInfo.end}
              onChange={(e) => onChangeCustom(rangeInfo.start, e.target.value)}
              className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px]"
            />
          </div>
        )}
        <div className="ml-auto text-[11px] text-muted-foreground">
          {rangeInfo.start === rangeInfo.end ? rangeInfo.start : `${rangeInfo.start} → ${rangeInfo.end}`}
        </div>
      </div>

      {/* Aggregate insights */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-border/50 bg-background/60 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Visits</div>
          <div className="mt-0.5 font-display text-xl font-bold tabular-nums">{totalVisits}</div>
        </div>
        <div className="rounded-xl border border-border/50 bg-background/60 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Avg rating</div>
          <div className="mt-0.5 inline-flex items-baseline gap-1 font-display text-xl font-bold tabular-nums">
            {rated.length ? avgRating.toFixed(1) : "—"}
            {rated.length ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> : null}
          </div>
          <div className="text-[10px] text-muted-foreground">{rated.length} rated</div>
        </div>
        <div className="rounded-xl border border-border/50 bg-background/60 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Most visited</div>
          <div className="mt-0.5 truncate text-[13px] font-semibold">
            {mostVisited ? mostVisited.u.customer_name ?? mostVisited.u.unit_name : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {mostVisited ? `${mostVisited.count} visit${mostVisited.count === 1 ? "" : "s"}` : "no visits"}
          </div>
        </div>
        <div className="rounded-xl border border-border/50 bg-background/60 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Not visited</div>
          <div className="mt-0.5 font-display text-xl font-bold tabular-nums">{unvisited.length}</div>
          <div className="text-[10px] text-muted-foreground">of {units.length} units</div>
        </div>
      </div>

      {/* Highlight callout */}
      {highlightLabel && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <span>Filter: {highlightLabel} · {rangeInfo.label.toLowerCase()}</span>
          <button
            type="button"
            onClick={onClearHighlight}
            className="ml-auto rounded-md bg-amber-900/10 px-2 py-0.5 text-[10px] text-amber-900 hover:bg-amber-900/20 dark:bg-amber-200/10 dark:text-amber-100"
          >
            Clear
          </button>
        </div>
      )}

      {/* Visit list / unvisited list */}
      <div className="mt-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
          {highlight === "unvisited"
            ? `Units not visited in ${rangeInfo.label.toLowerCase()} (${unvisited.length})`
            : `Visits — ${rangeInfo.label} (${displayed.length})`}
        </div>
        {loading ? (
          <div className="py-4 text-center text-[11px] italic text-muted-foreground">Loading…</div>
        ) : highlight === "unvisited" ? (
          unvisited.length === 0 ? (
            <div className="py-4 text-center text-[11px] italic text-muted-foreground">
              All units visited in this range. 🎉
            </div>
          ) : (
            <ul className="space-y-1.5">
              {unvisited.map(({ u }) => (
                <li key={u.unit_id} className="rounded-lg border border-border/50 bg-background/60 px-3 py-2">
                  <div className="truncate text-[13px] font-semibold">{u.unit_name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{u.customer_name ?? "—"}</div>
                </li>
              ))}
            </ul>
          )
        ) : displayed.length === 0 ? (
          <div className="py-4 text-center text-[11px] italic text-muted-foreground">
            No visits in this range.
          </div>
        ) : (
          <ul className="space-y-2">
            {displayed.map((v) => {
              const unit = units.find((u) => u.unit_id === v.unit_id);
              return (
                <li key={v.id} className="rounded-xl border border-border/50 bg-background/60 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {unit?.unit_name ?? "Unit"}
                        <span className="ml-1 text-[10px] font-medium text-muted-foreground">
                          {unit?.customer_name ?? ""}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {v.visit_date} · In {whenAgo(v.check_in_at)}
                        {v.check_out_at ? ` · Out ${whenAgo(v.check_out_at)}` : " · in progress"}
                      </div>
                    </div>
                    {v.customer_rating != null && (
                      <div className="inline-flex items-center gap-0.5 text-amber-500">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={cn(
                              "h-3.5 w-3.5",
                              i < (v.customer_rating ?? 0) ? "fill-amber-400" : "opacity-30",
                            )}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  {v.visit_notes && (
                    <div className="mt-1.5 rounded-md bg-muted/40 p-2 text-[11px] italic text-muted-foreground">
                      "{v.visit_notes}"
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

