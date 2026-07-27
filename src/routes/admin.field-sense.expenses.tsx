import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, IndianRupee, MapPin, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { RANGE_PRESETS, resolveRange, type RangePreset } from "@/lib/field-visits";

export const Route = createFileRoute("/admin/field-sense/expenses")({
  component: ExpenseManagerPage,
  validateSearch: (search: Record<string, unknown>) => ({
    range: (search.range as string | undefined) ?? undefined,
    start: (search.start as string | undefined) ?? undefined,
    end: (search.end as string | undefined) ?? undefined,
  }),
  head: () => ({
    meta: [
      { title: "Expense Manager — Field officer travel distance" },
      { name: "description", content: "Cumulative kilometers traveled by every field officer over any date range, with per-day breakdown and map trail." },
      { property: "og:title", content: "Expense Manager — Field Sense" },
      { property: "og:description", content: "Cumulative kilometers traveled by every field officer over any date range." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

// ----------------------- helpers -----------------------

const ROAD_FACTOR = 1.3;

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const isNum = (n: unknown): n is number => Number.isFinite(Number(n));
const toPt = (lat: unknown, lng: unknown) =>
  isNum(lat) && isNum(lng) ? { lat: Number(lat), lng: Number(lng) } : null;

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
}

// ----------------------- types -----------------------

type FoRow = { id: string; full_name: string; employee_code: string | null };

type PunchRow = {
  candidate_id: string;
  punch_date: string;
  check_in_at: string | null;
  check_in_lat: number | string | null;
  check_in_lng: number | string | null;
  check_out_at: string | null;
  check_out_lat: number | string | null;
  check_out_lng: number | string | null;
};

type VisitRow = {
  id: string;
  candidate_id: string;
  unit_id: string;
  visit_date: string;
  visit_seq: number;
  check_in_at: string | null;
  check_in_lat: number | string | null;
  check_in_lng: number | string | null;
  check_out_at: string | null;
};

type TrackRow = {
  candidate_id: string;
  track_date: string;
  lat: number | string;
  lng: number | string;
  recorded_at: string;
};

type UnitRow = {
  id: string;
  name: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

type DayBreak = { day: string; km: number; visits: number };

// ----------------------- page -----------------------

function ExpenseManagerPage() {
  const [preset, setPreset] = useState<RangePreset>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const resolved = useMemo(
    () => resolveRange(preset, customStart || null, customEnd || null),
    [preset, customStart, customEnd],
  );

  const [expanded, setExpanded] = useState<string | null>(null);

  const dataQ = useQuery({
    queryKey: ["expense-manager", resolved.start, resolved.end],
    staleTime: 30_000,
    queryFn: async () => {
      const [foRes, punchRes, visitRes, trackRes, unitRes] = await Promise.all([
        supabase
          .from("candidates" as never)
          .select("id, full_name, employee_code")
          .eq("role_key", "field_officer")
          .in("status", ["approved", "active"]),
        supabase
          .from("self_attendance_punches" as never)
          .select("candidate_id, punch_date, check_in_at, check_in_lat, check_in_lng, check_out_at, check_out_lat, check_out_lng")
          .gte("punch_date", resolved.start)
          .lte("punch_date", resolved.end),
        supabase
          .from("field_visits" as never)
          .select("id, candidate_id, unit_id, visit_date, visit_seq, check_in_at, check_in_lat, check_in_lng, check_out_at")
          .gte("visit_date", resolved.start)
          .lte("visit_date", resolved.end),
        supabase
          .from("field_track_points" as never)
          .select("candidate_id, track_date, lat, lng, recorded_at")
          .gte("track_date", resolved.start)
          .lte("track_date", resolved.end)
          .order("recorded_at", { ascending: true }),
        supabase.from("units" as never).select("id, name, latitude, longitude"),
      ]);

      const fos = (foRes.data ?? []) as unknown as FoRow[];
      const punches = (punchRes.data ?? []) as unknown as PunchRow[];
      const visits = (visitRes.data ?? []) as unknown as VisitRow[];
      const tracks = (trackRes.data ?? []) as unknown as TrackRow[];
      const units = (unitRes.data ?? []) as unknown as UnitRow[];
      const unitById = new Map(units.map((u) => [u.id, u]));

      // Raw ping km per candidate|day
      const rawKmMap = new Map<string, number>();
      const grouped = new Map<string, Array<{ lat: number; lng: number }>>();
      for (const p of tracks) {
        const key = `${p.candidate_id}|${p.track_date}`;
        const arr = grouped.get(key) ?? [];
        arr.push({ lat: Number(p.lat), lng: Number(p.lng) });
        grouped.set(key, arr);
      }
      for (const [key, pts] of grouped) {
        let m = 0;
        for (let i = 1; i < pts.length; i += 1) m += haversineM(pts[i - 1], pts[i]);
        rawKmMap.set(key, m / 1000);
      }

      // Waypoint km per candidate|day (punch-in → visits(chrono) → punch-out)
      const wpKmMap = new Map<string, number>();
      const dayBucket = new Map<string, Array<{ pt: { lat: number; lng: number }; at: number }>>();
      const pushWp = (cand: string, day: string, pt: { lat: number; lng: number } | null, at: string | null) => {
        if (!pt || !at) return;
        const k = `${cand}|${day}`;
        const arr = dayBucket.get(k) ?? [];
        arr.push({ pt, at: new Date(at).getTime() });
        dayBucket.set(k, arr);
      };
      for (const pu of punches) {
        pushWp(pu.candidate_id, pu.punch_date, toPt(pu.check_in_lat, pu.check_in_lng), pu.check_in_at ?? pu.punch_date);
        pushWp(pu.candidate_id, pu.punch_date, toPt(pu.check_out_lat, pu.check_out_lng), pu.check_out_at);
      }
      for (const v of visits) {
        const u = unitById.get(v.unit_id);
        const site = toPt(u?.latitude, u?.longitude) ?? toPt(v.check_in_lat, v.check_in_lng);
        if (!v.check_in_at) continue;
        pushWp(v.candidate_id, v.visit_date, site, v.check_in_at);
      }
      for (const [key, arr] of dayBucket) {
        arr.sort((a, b) => a.at - b.at);
        let m = 0;
        for (let i = 1; i < arr.length; i += 1) m += haversineM(arr[i - 1].pt, arr[i].pt);
        wpKmMap.set(key, (m * ROAD_FACTOR) / 1000);
      }

      // Aggregate per FO
      const visitsPerDay = new Map<string, number>();
      for (const v of visits) {
        const k = `${v.candidate_id}|${v.visit_date}`;
        visitsPerDay.set(k, (visitsPerDay.get(k) ?? 0) + 1);
      }

      const allKeys = new Set<string>([...rawKmMap.keys(), ...wpKmMap.keys(), ...visitsPerDay.keys()]);
      const dayRows = new Map<string, DayBreak[]>();
      for (const k of allKeys) {
        const [cand, day] = k.split("|");
        const km = Math.max(rawKmMap.get(k) ?? 0, wpKmMap.get(k) ?? 0);
        const arr = dayRows.get(cand) ?? [];
        arr.push({ day, km: Number(km.toFixed(2)), visits: visitsPerDay.get(k) ?? 0 });
        dayRows.set(cand, arr);
      }
      for (const arr of dayRows.values()) arr.sort((a, b) => (a.day < b.day ? 1 : -1));

      const summary = fos.map((f) => {
        const days = dayRows.get(f.id) ?? [];
        const totalKm = days.reduce((s, d) => s + d.km, 0);
        const totalVisits = days.reduce((s, d) => s + d.visits, 0);
        const activeDays = days.filter((d) => d.km > 0 || d.visits > 0).length;
        return {
          candidate_id: f.id,
          full_name: f.full_name,
          employee_code: f.employee_code,
          totalKm: Number(totalKm.toFixed(2)),
          totalVisits,
          activeDays,
          days: days.filter((d) => d.km > 0 || d.visits > 0),
        };
      });

      summary.sort((a, b) => b.totalKm - a.totalKm || a.full_name.localeCompare(b.full_name));
      return { summary, unitById };
    },
  });

  const summary = dataQ.data?.summary ?? [];
  const totalKm = summary.reduce((s, r) => s + r.totalKm, 0);
  const totalVisits = summary.reduce((s, r) => s + r.totalVisits, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expense Manager"
        description="Cumulative kilometers traveled by each field officer across any date range. Drill into a date to see their exact trail."
        crumbs={[{ label: "Admin", to: "/admin/dashboard" }, { label: "Field Sense", to: "/admin/field-sense" }, { label: "Expense Manager" }]}
      />

      {/* Filter bar */}
      <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Range</div>
          <div className="flex flex-wrap gap-1">
            {RANGE_PRESETS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setPreset(r.value)}
                className={
                  preset === r.value
                    ? "rounded-full bg-foreground px-3 py-1 text-[11px] font-bold text-background"
                    : "rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                }
              >
                {r.label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-2 text-[11px]">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 font-semibold"
              />
              <span className="text-muted-foreground">→</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 font-semibold"
              />
            </div>
          )}
          <div className="ml-auto text-[11px] font-semibold text-muted-foreground">
            {resolved.label} · {resolved.start === resolved.end ? resolved.start : `${resolved.start} → ${resolved.end}`}
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryTile label="Total distance" value={`${totalKm.toFixed(2)} km`} tone="emerald" />
        <SummaryTile label="Total visits" value={String(totalVisits)} tone="sky" />
        <SummaryTile label="Field officers" value={String(summary.length)} tone="violet" />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="border-b border-border/50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
          Field officers · Cumulative travel
        </div>
        {dataQ.isLoading ? (
          <div className="p-6 text-center text-xs italic text-muted-foreground">Loading expense data…</div>
        ) : summary.length === 0 ? (
          <div className="p-6 text-center text-xs italic text-muted-foreground">No field officers on file.</div>
        ) : (
          <ul className="divide-y divide-border/40">
            {summary.map((row) => {
              const isOpen = expanded === row.candidate_id;
              return (
                <li key={row.candidate_id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : row.candidate_id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/40"
                  >
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-foreground/90 text-[11px] font-bold text-background">
                      {row.full_name.trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground">{row.full_name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {row.employee_code ?? "—"} · {row.activeDays} active day{row.activeDays === 1 ? "" : "s"} · {row.totalVisits} visit{row.totalVisits === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="flex items-baseline gap-1 tabular-nums">
                      <span className="font-display text-lg font-bold text-foreground">{row.totalKm.toFixed(2)}</span>
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground">km</span>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/40 bg-muted/20 px-4 py-3">
                      {row.days.length === 0 ? (
                        <div className="py-3 text-center text-[11px] italic text-muted-foreground">
                          No travel recorded for this officer in the selected range.
                        </div>
                      ) : (
                        <ul className="grid gap-1.5 sm:grid-cols-2">
                          {row.days.map((d) => (
                            <li key={d.day}>
                              <Link
                                to="/admin/field-sense/officer/$id"
                                params={{ id: row.candidate_id }}
                                search={{ date: d.day, from: "expenses" }}
                                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/50 bg-card px-3 py-2 text-left transition hover:border-foreground/30 hover:bg-background"
                              >
                                <div className="min-w-0">
                                  <div className="text-[12px] font-semibold text-foreground">{fmtDate(d.day)}</div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {d.visits} visit{d.visits === 1 ? "" : "s"}
                                  </div>
                                </div>
                                <div className="flex items-baseline gap-1 tabular-nums">
                                  <span className="text-sm font-bold text-foreground">{d.km.toFixed(2)}</span>
                                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">km</span>
                                </div>
                                <MapPin className="h-3.5 w-3.5 text-primary" />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {dayModal && (
        <DayTrailModal
          candidateId={dayModal.candidateId}
          foName={dayModal.foName}
          day={dayModal.day}
          unitById={dataQ.data?.unitById ?? new Map()}
          onClose={() => setDayModal(null)}
        />
      )}
    </div>
  );
}

// ----------------------- Summary tile -----------------------

const TILE_TONES: Record<string, { ring: string; text: string }> = {
  emerald: { ring: "ring-emerald-200/70", text: "text-emerald-700 dark:text-emerald-300" },
  sky: { ring: "ring-sky-200/70", text: "text-sky-700 dark:text-sky-300" },
  violet: { ring: "ring-violet-200/70", text: "text-violet-700 dark:text-violet-300" },
};

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: keyof typeof TILE_TONES }) {
  const t = TILE_TONES[tone];
  return (
    <div className={`rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm ring-1 ${t.ring}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <IndianRupee className={`h-3.5 w-3.5 ${t.text}`} />
        <div className={`text-[22px] font-semibold leading-none text-foreground`}>{value}</div>
      </div>
    </div>
  );
}

// ----------------------- Day trail modal -----------------------

function DayTrailModal({
  candidateId,
  foName,
  day,
  unitById,
  onClose,
}: {
  candidateId: string;
  foName: string;
  day: string;
  unitById: Map<string, UnitRow>;
  onClose: () => void;
}) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  const q = useQuery({
    queryKey: ["expense-day-trail", candidateId, day],
    queryFn: async () => {
      const [punchRes, visitRes, trackRes] = await Promise.all([
        supabase
          .from("self_attendance_punches" as never)
          .select("check_in_at, check_in_lat, check_in_lng, check_out_at, check_out_lat, check_out_lng")
          .eq("candidate_id", candidateId)
          .eq("punch_date", day)
          .maybeSingle(),
        supabase
          .from("field_visits" as never)
          .select("id, unit_id, visit_seq, check_in_at, check_in_lat, check_in_lng, check_out_at")
          .eq("candidate_id", candidateId)
          .eq("visit_date", day)
          .order("check_in_at", { ascending: true }),
        supabase
          .from("field_track_points" as never)
          .select("lat, lng, recorded_at")
          .eq("candidate_id", candidateId)
          .eq("track_date", day)
          .order("recorded_at", { ascending: true }),
      ]);
      return {
        punch: (punchRes.data ?? null) as null | {
          check_in_at: string | null;
          check_in_lat: number | string | null;
          check_in_lng: number | string | null;
          check_out_at: string | null;
          check_out_lat: number | string | null;
          check_out_lng: number | string | null;
        },
        visits: ((visitRes.data ?? []) as unknown) as Array<{
          id: string;
          unit_id: string;
          visit_seq: number;
          check_in_at: string | null;
          check_in_lat: number | string | null;
          check_in_lng: number | string | null;
          check_out_at: string | null;
        }>,
        tracks: ((trackRes.data ?? []) as unknown) as Array<{ lat: number | string; lng: number | string; recorded_at: string }>,
      };
    },
  });

  // Init map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !mapEl.current) return;
      LRef.current = L;
      const map = L.map(mapEl.current, { center: [22.9734, 78.6569], zoom: 5 });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Draw
  useEffect(() => {
    if (!ready || !mapRef.current || !LRef.current || !q.data) return;
    const L = LRef.current;
    const map = mapRef.current;

    const layers: any[] = [];
    const bounds: Array<[number, number]> = [];

    // Track polyline (raw pings)
    const trackPts: Array<[number, number]> = q.data.tracks
      .map((t) => [Number(t.lat), Number(t.lng)] as [number, number])
      .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
    if (trackPts.length >= 2) {
      const line = L.polyline(trackPts, { color: "#0ea5e9", weight: 4, opacity: 0.7 }).addTo(map);
      layers.push(line);
      trackPts.forEach((p) => bounds.push(p));
    }

    // Waypoint sequence: start → sites → end
    const waypoints: Array<{ pt: [number, number]; label: string; kind: "start" | "site" | "end" }> = [];
    const p = q.data.punch;
    const inPt = toPt(p?.check_in_lat, p?.check_in_lng);
    if (inPt) waypoints.push({ pt: [inPt.lat, inPt.lng], label: "S", kind: "start" });
    q.data.visits.forEach((v, i) => {
      const u = unitById.get(v.unit_id);
      const site = toPt(u?.latitude, u?.longitude) ?? toPt(v.check_in_lat, v.check_in_lng);
      if (site) {
        waypoints.push({
          pt: [site.lat, site.lng],
          label: String(i + 1),
          kind: "site",
        });
      }
    });
    const outPt = toPt(p?.check_out_lat, p?.check_out_lng);
    if (outPt) waypoints.push({ pt: [outPt.lat, outPt.lng], label: "E", kind: "end" });

    // Waypoint polyline (dashed connectors)
    if (waypoints.length >= 2) {
      const wpLine = L.polyline(
        waypoints.map((w) => w.pt),
        { color: "#334155", weight: 2, opacity: 0.55, dashArray: "6, 6" },
      ).addTo(map);
      layers.push(wpLine);
    }

    waypoints.forEach((w) => {
      const bg = w.kind === "start" ? "#059669" : w.kind === "end" ? "#e11d48" : "#0f172a";
      const icon = L.divIcon({
        className: "expense-day-pin",
        html: `<div style="width:28px;height:28px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,0.25);border:3px solid #fff;">${w.label}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const m = L.marker(w.pt, { icon }).addTo(map);
      layers.push(m);
      bounds.push(w.pt);
    });

    if (bounds.length > 0) {
      const b = L.latLngBounds(bounds);
      if (bounds.length === 1) map.setView(bounds[0], 14);
      else map.fitBounds(b.pad(0.2), { maxZoom: 15 });
    }

    return () => {
      for (const l of layers) map.removeLayer(l);
    };
  }, [ready, q.data, unitById]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative flex h-[85dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              {foName} · Trail
            </div>
            <div className="text-sm font-semibold text-foreground">{fmtDate(day)}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div ref={mapEl} className="flex-1" />
        {q.isLoading && (
          <div className="pointer-events-none absolute inset-x-0 top-16 mx-auto w-fit rounded-full bg-background/90 px-4 py-2 text-xs font-semibold text-muted-foreground shadow ring-1 ring-border/60">
            Loading trail…
          </div>
        )}
      </div>
    </div>
  );
}
