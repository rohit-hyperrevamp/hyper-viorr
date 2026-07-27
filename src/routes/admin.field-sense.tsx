import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Battery, BatteryCharging, Building2, ChevronDown, MapPin, Radio, Signal, UserCog, Wifi } from "lucide-react";
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
        .eq("candidate.role_key", "field_officer")
        .order("last_seen_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as LivePunch[];
    },
  });

  const totalsQ = useQuery({
    queryKey: ["field-sense-totals"],
    staleTime: 60_000,
    queryFn: async () => {
      const fo = await supabase
        .from("candidates" as never)
        .select("id", { count: "exact", head: true })
        .eq("role_key", "field_officer")
        .in("status", ["approved", "active"]);
      return { fo: fo.count ?? 0 };
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

  const liveFoCount = rows.length;
  const totalFo = totalsQ.data?.fo ?? 0;

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

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile label="Field Officers" total={totalFo} live={liveFoCount} tone="sky" />
        <StatTile label="With GPS Ping" total={(q.data ?? []).length} live={rows.length} tone="amber" />
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <div ref={mapEl} style={{ height: "520px", width: "100%" }} />
        {q.isLoading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40 text-xs font-semibold text-muted-foreground">
            Loading live field officers…
          </div>
        )}
        {!q.isLoading && rows.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-4 mx-auto w-fit rounded-full bg-background/90 px-4 py-2 text-xs font-semibold text-muted-foreground shadow ring-1 ring-border/60">
            No field officer is currently checked in with a GPS ping.
          </div>
        )}
      </section>

      <OnDutyColumn
        title="On duty — Field Officers"
        icon={<UserCog className="h-3.5 w-3.5" />}
        tone="sky"
        rows={rows}
      />

      <DeploymentBreakdown role="field_officer" title="Units & Organizations by Field Officer" tone="sky" />
    </div>
  );
}

function OnDutyColumn({
  title,
  icon,
  tone,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "sky" | "emerald";
  rows: LivePunch[];
}) {
  const accent = tone === "sky" ? "text-sky-700 dark:text-sky-300" : "text-emerald-700 dark:text-emerald-300";
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
      <div className={`mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] ${accent}`}>
        {icon}
        {title} <span className="text-muted-foreground">({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <div className="py-4 text-center text-[11px] italic text-muted-foreground">No one on duty right now.</div>
      ) : (
        <ul className="space-y-2">
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
                    {r.candidate?.full_name ?? "—"}
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
      )}
    </div>
  );
}

type DeploymentPerson = {
  id: string;
  full_name: string;
  employee_code: string | null;
  units: Array<{ unit_id: string; unit_name: string; unit_code: string | null; customer_name: string | null; branch_name: string | null; latitude: number | null; longitude: number | null }>;
};

function DeploymentBreakdown({
  role,
  title,
  tone,
}: {
  role: "field_officer" | "guard";
  title: string;
  tone: "sky" | "emerald";
}) {
  const accent = tone === "sky" ? "text-sky-700 dark:text-sky-300" : "text-emerald-700 dark:text-emerald-300";
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["field-sense-deployment", role],
    staleTime: 60_000,
    queryFn: async (): Promise<DeploymentPerson[]> => {
      const roleFilter = role === "guard" ? ["guard", "security_guard"] : ["field_officer"];
      const [candRes, unitsRes, custRes, branchRes, esaRes, cuRes] = await Promise.all([
        supabase
          .from("candidates" as never)
          .select("id,full_name,employee_code,role_key,unit_id,status")
          .in("role_key", roleFilter)
          .in("status", ["approved", "active"]),
        supabase.from("units" as never).select("id,name,code,customer_id,branch_id,latitude,longitude"),
        supabase.from("customers" as never).select("id,name"),
        supabase.from("branches" as never).select("id,name"),
        supabase
          .from("employee_scope_assignments" as never)
          .select("candidate_id,scope_type,scope_id"),
        supabase.from("candidate_units" as never).select("candidate_id,unit_id"),
      ]);
      if (candRes.error) throw candRes.error;

      const units = ((unitsRes.data ?? []) as unknown) as Array<{ id: string; name: string; code: string | null; customer_id: string | null; branch_id: string | null }>;
      const custMap = new Map(((custRes.data ?? []) as unknown as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
      const branchMap = new Map(((branchRes.data ?? []) as unknown as Array<{ id: string; name: string }>).map((b) => [b.id, b.name]));
      const unitById = new Map(units.map((u) => [u.id, u]));
      const esa = ((esaRes.data ?? []) as unknown) as Array<{ candidate_id: string; scope_type: string; scope_id: string }>;
      const cu = ((cuRes.data ?? []) as unknown) as Array<{ candidate_id: string; unit_id: string }>;
      const cands = ((candRes.data ?? []) as unknown) as Array<{ id: string; full_name: string; employee_code: string | null; unit_id: string | null }>;

      const out: DeploymentPerson[] = cands.map((c) => {
        const unitIds = new Set<string>();
        if (c.unit_id) unitIds.add(c.unit_id);
        for (const row of cu) if (row.candidate_id === c.id) unitIds.add(row.unit_id);
        // FO scope expansion via branch/customer
        if (role === "field_officer") {
          const mine = esa.filter((s) => s.candidate_id === c.id);
          const branchIds = new Set(mine.filter((s) => s.scope_type === "branch").map((s) => s.scope_id));
          const customerIds = new Set(mine.filter((s) => s.scope_type === "customer").map((s) => s.scope_id));
          for (const s of mine) if (s.scope_type === "unit") unitIds.add(s.scope_id);
          if (branchIds.size || customerIds.size) {
            for (const u of units) {
              if (u.branch_id && branchIds.has(u.branch_id)) unitIds.add(u.id);
              if (u.customer_id && customerIds.has(u.customer_id)) unitIds.add(u.id);
            }
          }
        } else {
          for (const s of esa.filter((x) => x.candidate_id === c.id && x.scope_type === "unit")) {
            unitIds.add(s.scope_id);
          }
        }
        const unitList = Array.from(unitIds)
          .map((uid) => {
            const u = unitById.get(uid);
            if (!u) return null;
            return {
              unit_id: uid,
              unit_name: u.name,
              unit_code: u.code,
              customer_name: u.customer_id ? custMap.get(u.customer_id) ?? null : null,
              branch_name: u.branch_id ? branchMap.get(u.branch_id) ?? null : null,
            };
          })
          .filter(Boolean) as DeploymentPerson["units"];
        unitList.sort((a, b) => a.unit_name.localeCompare(b.unit_name));
        return { id: c.id, full_name: c.full_name, employee_code: c.employee_code, units: unitList };
      });
      out.sort((a, b) => a.full_name.localeCompare(b.full_name));
      return out;
    },
  });

  const people = q.data ?? [];

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
      <div className={`mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] ${accent}`}>
        <Building2 className="h-3.5 w-3.5" />
        {title} <span className="text-muted-foreground">({people.length})</span>
      </div>
      {q.isLoading ? (
        <div className="py-4 text-center text-[11px] italic text-muted-foreground">Loading…</div>
      ) : people.length === 0 ? (
        <div className="py-4 text-center text-[11px] italic text-muted-foreground">No one mapped yet.</div>
      ) : (
        <ul className="space-y-1.5">
          {people.map((p) => {
            const open = openId === p.id;
            return (
              <li key={p.id} className="rounded-xl border border-border/50 bg-background/60">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : p.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{p.full_name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {p.employee_code ?? "—"} · {p.units.length} unit{p.units.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                {open && (
                  <div className="border-t border-border/50 px-3 py-2">
                    {p.units.length === 0 ? (
                      <div className="text-[11px] italic text-muted-foreground">No units mapped.</div>
                    ) : (
                      <ul className="space-y-1.5">
                        {p.units.map((u) => (
                          <li key={u.unit_id} className="flex items-start gap-2 text-[11px]">
                            <MapPin className="mt-0.5 h-3 w-3 flex-none text-muted-foreground" />
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-foreground">
                                {u.unit_name}
                                {u.unit_code && <span className="ml-1 font-mono text-[10px] text-muted-foreground">({u.unit_code})</span>}
                              </div>
                              <div className="truncate text-muted-foreground">
                                {u.customer_name ?? "—"}{u.branch_name ? ` · ${u.branch_name}` : ""}
                              </div>
                            </div>
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
  );
}

const TILE_TONES: Record<string, { ring: string; dot: string; live: string; total: string }> = {
  sky: { ring: "ring-sky-200/70", dot: "bg-sky-500", live: "text-sky-700 dark:text-sky-300", total: "text-slate-900 dark:text-slate-100" },
  emerald: { ring: "ring-emerald-200/70", dot: "bg-emerald-500", live: "text-emerald-700 dark:text-emerald-300", total: "text-slate-900 dark:text-slate-100" },
  violet: { ring: "ring-violet-200/70", dot: "bg-violet-500", live: "text-violet-700 dark:text-violet-300", total: "text-slate-900 dark:text-slate-100" },
  amber: { ring: "ring-amber-200/70", dot: "bg-amber-500", live: "text-amber-700 dark:text-amber-300", total: "text-slate-900 dark:text-slate-100" },
};

function StatTile({ label, total, live, tone }: { label: string; total: number; live: number; tone: keyof typeof TILE_TONES }) {
  const t = TILE_TONES[tone];
  return (
    <div className={`rounded-2xl border border-border/60 bg-card px-3 py-2.5 shadow-sm ring-1 ${t.ring}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className={`text-[22px] font-semibold leading-none ${t.total}`}>{total.toLocaleString()}</div>
        <div className="text-[10px] font-semibold uppercase text-muted-foreground">total</div>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className={`relative flex h-1.5 w-1.5`}>
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${t.dot} opacity-60`} />
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${t.dot}`} />
        </span>
        <span className={`text-[11px] font-bold ${t.live}`}>{live.toLocaleString()} live now</span>
      </div>
    </div>
  );
}

