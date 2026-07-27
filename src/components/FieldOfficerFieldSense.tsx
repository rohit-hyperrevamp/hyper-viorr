import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  Loader2,
  Map as MapIcon,
  MapPin,
  Navigation,
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
import {
  distanceMeters,
  formatDistance,
  getCurrentPosition,
  mapsUrl,
  pushTelemetry,
  readBattery,
  readNetworkType,
  type Geo,
} from "@/lib/self-attendance";
import {
  completeVisit,
  createVisit,
  fetchLastVisitPerUnit,
  fetchMonthVisitCounts,
  fetchTodayTrackPoints,
  fetchTodayVisits,
  findNearestUnit,
  insertTrackPoint,
  signedProofUrl,
  uploadVisitProof,
  type FieldVisit,
} from "@/lib/field-visits";

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
  const [mapReady, setMapReady] = useState(false);

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
        .select("id, check_in_at, check_out_at")
        .eq("candidate_id", candidateId)
        .eq("punch_date", todayPunchDate())
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data as { id: string; check_in_at: string | null; check_out_at: string | null } | null) ?? null;
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

  const units = unitsQ.data ?? [];
  const visits = visitsQ.data ?? [];
  const openVisit = visits.find((v) => !v.check_out_at) ?? null;
  const completedCount = visits.filter((v) => v.check_out_at).length;
  const isOnDuty = !!punchQ.data?.check_in_at && !punchQ.data?.check_out_at;

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
    if (!mapReady || !mapRef.current || !LRef.current || !pos) return;
    const L = LRef.current;
    const map = mapRef.current;
    const html = `<div style="position:relative;">
      <div style="width:22px;height:22px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 4px 12px rgba(37,99,235,0.5);"></div>
      <span style="position:absolute;inset:-8px;border-radius:50%;border:2px solid #2563eb;opacity:0.5;animation:fs-ping 1.6s ease-out infinite;"></span>
    </div>`;
    const icon = L.divIcon({ className: "fo-fs-me-pin", html, iconSize: [22, 22], iconAnchor: [11, 11] });
    if (meMarkerRef.current) {
      meMarkerRef.current.setLatLng([pos.lat, pos.lng]);
    } else {
      meMarkerRef.current = L.marker([pos.lat, pos.lng], { icon, zIndexOffset: 1000 }).addTo(map);
      meMarkerRef.current.bindPopup("You are here");
    }
  }, [pos, mapReady]);

  // Sync track polyline — include current live position as last point for real-time feel
  const track = trackQ.data ?? [];
  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;
    if (trackLineRef.current) {
      map.removeLayer(trackLineRef.current);
      trackLineRef.current = null;
    }
    const coords: Array<[number, number]> = track.map((t) => [Number(t.lat), Number(t.lng)]);
    if (pos) coords.push([pos.lat, pos.lng]);
    if (coords.length < 2) return;
    trackLineRef.current = L.polyline(coords, {
      color: "#2563eb",
      weight: 4,
      opacity: 0.75,
      dashArray: "4 6",
    }).addTo(map);
  }, [track, pos, mapReady]);

  // Active-visit route: check-in origin → current position → destination unit.
  // Simulates a live navigation trail so the FO can see the intended route + km to destination.
  const openVisitUnit = useMemo(
    () => (openVisit ? units.find((u) => u.unit_id === openVisit.unit_id) ?? null : null),
    [openVisit, units],
  );
  const distanceToDest = useMemo(() => {
    if (!openVisitUnit || openVisitUnit.latitude == null || openVisitUnit.longitude == null) return null;
    const from = pos ?? (openVisit && openVisit.check_in_lat != null && openVisit.check_in_lng != null
      ? { lat: Number(openVisit.check_in_lat), lng: Number(openVisit.check_in_lng) }
      : null);
    if (!from) return null;
    return distanceMeters(from, { lat: Number(openVisitUnit.latitude), lng: Number(openVisitUnit.longitude) });
  }, [openVisit, openVisitUnit, pos]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;
    // Clear previous
    if (routeLineRef.current) { map.removeLayer(routeLineRef.current); routeLineRef.current = null; }
    if (destMarkerRef.current) { map.removeLayer(destMarkerRef.current); destMarkerRef.current = null; }
    if (!openVisit || !openVisitUnit || openVisitUnit.latitude == null || openVisitUnit.longitude == null) return;
    const origin: [number, number] | null =
      openVisit.check_in_lat != null && openVisit.check_in_lng != null
        ? [Number(openVisit.check_in_lat), Number(openVisit.check_in_lng)]
        : pos ? [pos.lat, pos.lng] : null;
    if (!origin) return;
    const dest: [number, number] = [Number(openVisitUnit.latitude), Number(openVisitUnit.longitude)];
    const coords: Array<[number, number]> = [origin];
    if (pos) coords.push([pos.lat, pos.lng]);
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
    // Fit route bounds
    try { map.fitBounds(L.latLngBounds(coords).pad(0.3), { maxZoom: 16, animate: true }); } catch { /* noop */ }
  }, [openVisit, openVisitUnit, pos, mapReady]);

  // Auto-fit map bounds once when we have data
  const didFitRef = useRef(false);
  useEffect(() => {
    if (didFitRef.current) return;
    if (!mapReady || !mapRef.current || !LRef.current) return;
    const L = LRef.current;
    const pts: Array<[number, number]> = [];
    for (const u of units) if (u.latitude != null && u.longitude != null) pts.push([Number(u.latitude), Number(u.longitude)]);
    if (pos) pts.push([pos.lat, pos.lng]);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      mapRef.current.setView(pts[0], 14, { animate: true });
    } else {
      mapRef.current.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 15 });
    }
    didFitRef.current = true;
  }, [units, pos, mapReady]);

  // Distance list from current position
  const distances = useMemo(() => {
    if (!pos) return [];
    return units
      .filter((u) => u.latitude != null && u.longitude != null)
      .map((u) => ({
        unit: u,
        d: distanceMeters(pos, { lat: Number(u.latitude), lng: Number(u.longitude) }) ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => a.d - b.d);
  }, [pos, units]);

  // Total kms today
  const totalKmToday = useMemo(() => {
    if (track.length < 2) return 0;
    let sum = 0;
    for (let i = 1; i < track.length; i += 1) {
      const a = track[i - 1];
      const b = track[i];
      const d = distanceMeters({ lat: Number(a.lat), lng: Number(a.lng) }, { lat: Number(b.lat), lng: Number(b.lng) });
      if (d != null) sum += d;
    }
    return sum / 1000;
  }, [track]);

  // Check-in / Check-out dialogs
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);

  const nextSeq = (visits[visits.length - 1]?.visit_seq ?? 0) + 1;

  return (
    <div className="space-y-4">
      <style>{`@keyframes fs-ping { 0% { transform: scale(1); opacity: 0.6;} 80%,100% { transform: scale(1.8); opacity: 0;} }`}</style>

      {/* Duty status banner */}
      {!isOnDuty && (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          Mark your attendance from the dashboard to start tracking visits.
        </div>
      )}

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

      {/* Map view toggle + map */}
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
        <div ref={mapEl} style={{ height: "440px", width: "100%" }} />
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

      {/* Today's visits log */}
      {visits.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Today's visits
          </div>
          <ul className="space-y-2">
            {visits.map((v) => {
              const unit = units.find((u) => u.unit_id === v.unit_id);
              return (
                <li key={v.id} className="rounded-xl border border-border/50 bg-background/60 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        #{v.visit_seq} · {unit?.unit_name ?? "Unit"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        In {whenAgo(v.check_in_at)}
                        {v.check_out_at ? ` · Out ${whenAgo(v.check_out_at)}` : " · in progress"}
                        {v.distance_from_prev_m != null ? ` · +${formatDistance(v.distance_from_prev_m)}` : ""}
                      </div>
                    </div>
                    {v.customer_rating != null && (
                      <div className="inline-flex items-center gap-0.5 text-amber-500">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={cn("h-3.5 w-3.5", i < (v.customer_rating ?? 0) ? "fill-amber-400" : "opacity-30")}
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
        </div>
      )}

      {checkInOpen && (
        <CheckInDialog
          candidateId={candidateId}
          units={units}
          pos={pos}
          nextSeq={nextSeq}
          prevPoint={
            visits.length > 0
              ? { lat: visits[visits.length - 1].check_out_lat, lng: visits[visits.length - 1].check_out_lng }
              : null
          }
          onClose={() => setCheckInOpen(false)}
          onDone={() => {
            setCheckInOpen(false);
            void qc.invalidateQueries({ queryKey: ["fo-fs-visits", candidateId, todayPunchDate()] });
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
      await createVisit({
        candidateId,
        unitId: selectedId,
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        visitSeq: nextSeq,
        prevLat: prevPoint?.lat ?? null,
        prevLng: prevPoint?.lng ?? null,
      });
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
  const fileRef = useRef<HTMLInputElement | null>(null);

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
      await completeVisit({
        id: visit.id,
        lat: pos.lat,
        lng: pos.lng,
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

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setClientPhoto(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(f);
  }

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
                onClick={() => fileRef.current?.click()}
                className="flex h-32 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/30 text-sm font-semibold text-muted-foreground"
              >
                <Camera className="h-4 w-4" /> Capture client photo
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFile}
              className="hidden"
            />
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
