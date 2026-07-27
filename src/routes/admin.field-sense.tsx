import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Battery, BatteryCharging, Radio, Signal, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/admin/field-sense")({
  component: FieldSensePage,
  head: () => ({
    meta: [
      { title: "Field Sense — Live field officers on India map" },
      { name: "description", content: "Live map of on-duty field officers with battery and network telemetry." },
      { property: "og:title", content: "Field Sense — Live field officers" },
      { property: "og:description", content: "Live map of on-duty field officers with battery and network telemetry." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type LivePunch = {
  id: string;
  candidate_id: string;
  check_in_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: string | null;
  battery_pct: number | null;
  battery_charging: boolean | null;
  network_type: string | null;
  candidate?: {
    full_name: string | null;
    employee_code: string | null;
    role_key: string | null;
    mobile: string | null;
  } | null;
};

function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function seenLabel(iso: string | null): string {
  if (!iso) return "no ping";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function batteryTone(bat: number | null): string {
  if (bat == null) return "#64748b";
  if (bat <= 20) return "#e11d48";
  if (bat <= 40) return "#d97706";
  return "#059669";
}

function netLabel(net: string | null): string {
  return net ?? "n/a";
}

function popupHtml(r: LivePunch): string {
  const name = r.candidate?.full_name ?? "Field officer";
  const code = r.candidate?.employee_code ?? "—";
  const bat = r.battery_pct;
  const batText = bat == null ? "n/a" : `${bat}%${r.battery_charging ? " ⚡" : ""}`;
  const batColor = batteryTone(bat);
  const net = netLabel(r.network_type);
  const seen = seenLabel(r.last_seen_at);
  return `
    <div style="font-family: ui-sans-serif, system-ui; min-width: 180px;">
      <div style="font-weight: 700; font-size: 13px; color:#0f172a;">${name}</div>
      <div style="font-size: 11px; color:#64748b; margin-top:2px;">${code} · ${seen}</div>
      <div style="display:flex; gap:10px; margin-top:8px; font-size:12px; font-weight:600;">
        <span style="color:${batColor};">🔋 ${batText}</span>
        <span style="color:#0f172a;">📶 ${net}</span>
      </div>
    </div>
  `;
}

function FieldSensePage() {
  const qc = useQueryClient();
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const LRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  const q = useQuery({
    queryKey: ["field-sense-live", today()],
    refetchInterval: 15_000,
    queryFn: async (): Promise<LivePunch[]> => {
      const { data, error } = await supabase
        .from("self_attendance_punches" as never)
        .select(
          "id, candidate_id, check_in_at, last_lat, last_lng, last_seen_at, battery_pct, battery_charging, network_type, candidate:candidates!inner(full_name, employee_code, role_key, mobile)",
        )
        .eq("punch_date", today())
        .not("check_in_at", "is", null)
        .is("check_out_at", null)
        .in("candidate.role_key", ["field_officer", "guard", "security_guard"])
        .order("last_seen_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as LivePunch[];
    },
  });

  const totalsQ = useQuery({
    queryKey: ["field-sense-totals"],
    staleTime: 60_000,
    queryFn: async () => {
      const [fo, sg] = await Promise.all([
        supabase
          .from("candidates" as never)
          .select("id", { count: "exact", head: true })
          .eq("role_key", "field_officer")
          .in("status", ["approved", "active"]),
        supabase
          .from("candidates" as never)
          .select("id", { count: "exact", head: true })
          .in("role_key", ["guard", "security_guard"])
          .in("status", ["approved", "active"]),
      ]);
      return { fo: fo.count ?? 0, sg: sg.count ?? 0 };
    },
  });

  // Init map (client-only, dynamic import)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !mapEl.current) return;
      LRef.current = L;
      const map = L.map(mapEl.current, {
        center: [22.9734, 78.6569], // Center of India
        zoom: 5,
        zoomControl: true,
        attributionControl: true,
      });
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
      markersRef.current.clear();
    };
  }, []);

  // Realtime updates
  useEffect(() => {
    const name = `field-sense-${Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(name);
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "self_attendance_punches" },
      () => void qc.invalidateQueries({ queryKey: ["field-sense-live", today()] }),
    ).subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  const rows = useMemo(() => (q.data ?? []).filter((r) => r.last_lat != null && r.last_lng != null), [q.data]);

  const liveFoCount = useMemo(
    () => rows.filter((r) => r.candidate?.role_key === "field_officer").length,
    [rows],
  );
  const liveSgCount = useMemo(
    () => rows.filter((r) => r.candidate?.role_key === "guard" || r.candidate?.role_key === "security_guard").length,
    [rows],
  );
  const totalFo = totalsQ.data?.fo ?? 0;
  const totalSg = totalsQ.data?.sg ?? 0;

  // Sync markers
  useEffect(() => {
    if (!ready || !mapRef.current || !LRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;
    const seen = new Set<string>();

    for (const r of rows) {
      const lat = r.last_lat as number;
      const lng = r.last_lng as number;
      seen.add(r.id);
      const html = popupHtml(r);
      const initial = (r.candidate?.full_name ?? "F").trim().charAt(0).toUpperCase();
      const color = batteryTone(r.battery_pct);
      const icon = L.divIcon({
        className: "field-sense-pin",
        html: `<div style="position:relative;">
          <div style="width:34px;height:34px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.25);border:3px solid #fff;">${initial}</div>
          <span style="position:absolute;inset:-6px;border-radius:50%;border:2px solid ${color};opacity:0.5;animation:fs-ping 1.6s ease-out infinite;"></span>
        </div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const existing = markersRef.current.get(r.id);
      if (existing) {
        existing.setLatLng([lat, lng]);
        existing.setIcon(icon);
        existing.setPopupContent(html);
      } else {
        const m = L.marker([lat, lng], { icon }).addTo(map);
        m.bindPopup(html);
        m.bindTooltip(html, { direction: "top", offset: [0, -18], opacity: 1 });
        markersRef.current.set(r.id, m);
      }
    }

    // Remove stale
    for (const [id, m] of markersRef.current) {
      if (!seen.has(id)) {
        map.removeLayer(m);
        markersRef.current.delete(id);
      }
    }

    // Auto-fit
    if (rows.length > 0) {
      const bounds = L.latLngBounds(rows.map((r) => [r.last_lat as number, r.last_lng as number]));
      if (rows.length === 1) {
        map.setView(bounds.getCenter(), 14, { animate: true });
      } else {
        map.fitBounds(bounds.pad(0.25), { maxZoom: 14, animate: true });
      }
    }
  }, [rows, ready]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Field Sense"
        description="Live map of on-duty field officers with battery and network telemetry."
        crumbs={[{ label: "Admin", to: "/admin/dashboard" }, { label: "Field Sense" }]}
      />

      <style>{`@keyframes fs-ping { 0% { transform: scale(1); opacity: 0.6;} 80%,100% { transform: scale(1.8); opacity: 0;} }`}</style>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Field Officers" total={totalFo} live={liveFoCount} tone="sky" />
        <StatTile label="Security Guards" total={totalSg} live={liveSgCount} tone="emerald" />
        <StatTile label="Live on Duty" total={totalFo + totalSg} live={liveFoCount + liveSgCount} tone="violet" />
        <StatTile label="With GPS Ping" total={(q.data ?? []).length} live={rows.length} tone="amber" />

      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <div ref={mapEl} style={{ height: "min(72vh, 720px)", width: "100%" }} />
        {q.isLoading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40 text-xs font-semibold text-muted-foreground">
            Loading live field officers…
          </div>
        )}
        {!q.isLoading && rows.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-4 mx-auto w-fit rounded-full bg-background/90 px-4 py-2 text-xs font-semibold text-muted-foreground shadow ring-1 ring-border/60">
            No field officers are currently checked in with a GPS ping.
          </div>
        )}
      </section>

      {rows.length > 0 && (
        <section className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">On duty now</div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => {
              const bat = r.battery_pct;
              const net = r.network_type;
              const NetIcon = net === "WiFi" ? Wifi : net === "5G" || net === "4G" ? Signal : Radio;
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {r.candidate?.full_name ?? "Field officer"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{seenLabel(r.last_seen_at)}</div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-bold">
                    <span style={{ color: batteryTone(bat) }} className="inline-flex items-center gap-1">
                      {r.battery_charging ? <BatteryCharging className="h-3.5 w-3.5" /> : <Battery className="h-3.5 w-3.5" />}
                      {bat == null ? "n/a" : `${bat}%`}
                    </span>
                    <span className="inline-flex items-center gap-1 text-foreground">
                      <NetIcon className="h-3.5 w-3.5" />
                      {net ?? "n/a"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
