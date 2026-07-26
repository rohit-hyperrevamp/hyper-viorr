import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, LogIn, LogOut, MapPin, Loader2, Clock, CheckCircle2, AlertTriangle, ExternalLink, Battery, BatteryCharging, Wifi, Signal, Radio } from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  checkIn,
  checkOut,
  fetchTodayPunch,
  getCurrentPosition,
  verifyFaceForAttendance,
  distanceMeters,
  formatDistance,
  mapsUrl,
  pushTelemetry,
  readBattery,
  readNetworkType,
  DEVIATION_THRESHOLD_M,
  type SelfPunch,
} from "@/lib/self-attendance";

import { isNativePlatform } from "@/lib/native";
import { cn } from "@/lib/utils";

function MapLink({
  lat,
  lng,
  label,
}: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  label?: string;
}) {
  const url = mapsUrl(lat, lng);
  if (!url || lat == null || lng == null) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
    >
      <MapPin className="h-3 w-3" />
      {label ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
      <ExternalLink className="h-2.5 w-2.5 opacity-70" />
    </a>
  );
}
function LiveTelemetryStrip({ punch }: { punch: SelfPunch }) {
  const url = mapsUrl(punch.last_lat ?? punch.check_in_lat, punch.last_lng ?? punch.check_in_lng);
  const seen = punch.last_seen_at ? new Date(punch.last_seen_at) : null;
  const secs = seen ? Math.max(0, Math.round((Date.now() - seen.getTime()) / 1000)) : null;
  const seenLabel = secs == null ? "waiting…" : secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)}m ago`;
  const bat = punch.battery_pct;
  const batTone = bat == null ? "text-muted-foreground" : bat <= 20 ? "text-rose-600 dark:text-rose-400" : bat <= 40 ? "text-amber-600 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400";
  const net = punch.network_type;
  const NetIcon = net === "WiFi" ? Wifi : net === "5G" || net === "4G" ? Signal : Radio;
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-[11px] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold">
        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          LIVE · {seenLabel}
        </span>
        <span className={cn("inline-flex items-center gap-1", batTone)}>
          {punch.battery_charging ? <BatteryCharging className="h-3.5 w-3.5" /> : <Battery className="h-3.5 w-3.5" />}
          {bat == null ? "Battery n/a" : `${bat}%${punch.battery_charging ? " ⚡" : ""}`}
        </span>
        <span className="inline-flex items-center gap-1 text-foreground">
          <NetIcon className="h-3.5 w-3.5" />
          {net ?? "Network n/a"}
        </span>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <MapPin className="h-4 w-4" />
          View live location
          <ExternalLink className="h-3 w-3 opacity-80" />
        </a>
      )}

    </div>
  );
}



function timeStr(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function elapsed(from: string | null, to?: string | null) {
  if (!from) return "";
  const end = to ? new Date(to).getTime() : Date.now();
  const ms = end - new Date(from).getTime();
  if (ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function MarkAttendanceCard({ candidateId, compact }: { candidateId: string | null; compact?: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"in" | "out" | null>(null);

  const punchQ = useQuery({
    queryKey: ["self-attendance-today", candidateId],
    enabled: !!candidateId,
    queryFn: () => {
      if (!candidateId) return null;
      return fetchTodayPunch(candidateId);
    },
    refetchInterval: 60_000,
  });

  const punch = punchQ.data as SelfPunch | null | undefined;
  const state: "idle" | "in" | "done" = !punch
    ? "idle"
    : punch.check_out_at
    ? "done"
    : "in";

  const inMut = useMutation({
    mutationFn: async () => {
      if (!candidateId) throw new Error("Profile not ready.");
      let face = false;
      if (isNativePlatform()) {
        face = await verifyFaceForAttendance("Mark attendance check-in");
      }
      const geo = await getCurrentPosition();
      const [row, battery, network] = await Promise.allSettled([
        checkIn(candidateId, geo, face),
        readBattery(),
        readNetworkType(),
      ]);
      if (row.status !== "fulfilled") throw row.reason;
      await pushTelemetry(row.value.id, {
        geo,
        battery: battery.status === "fulfilled" ? battery.value : null,
        network: network.status === "fulfilled" ? network.value : null,
      });
      return row.value;
    },
    onSuccess: () => {
      toast.success("Checked in");
      void qc.invalidateQueries({ queryKey: ["self-attendance-today", candidateId] });
      void qc.invalidateQueries({ queryKey: ["self-attendance-month", candidateId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Check-in failed"),
    onSettled: () => setBusy(null),
  });

  const outMut = useMutation({
    mutationFn: async () => {
      if (!punch?.id) throw new Error("No active check-in.");
      let face = false;
      if (isNativePlatform()) {
        face = await verifyFaceForAttendance("Mark attendance check-out");
      }
      const geo = await getCurrentPosition();
      return await checkOut(punch.id, geo, face);
    },
    onSuccess: () => {
      toast.success("Checked out");
      void qc.invalidateQueries({ queryKey: ["self-attendance-today", candidateId] });
      void qc.invalidateQueries({ queryKey: ["self-attendance-month", candidateId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Check-out failed"),
    onSettled: () => setBusy(null),
  });

  const duration = useMemo(
    () => (punch?.check_in_at ? elapsed(punch.check_in_at, punch.check_out_at) : ""),
    [punch?.check_in_at, punch?.check_out_at],
  );

  // While checked-in, push live location + battery + network every 45s.
  useEffect(() => {
    if (state !== "in" || !punch?.id) return;
    let cancelled = false;
    const send = async () => {
      try {
        const [geo, battery, network] = await Promise.allSettled([
          getCurrentPosition(),
          readBattery(),
          readNetworkType(),
        ]);
        if (cancelled) return;
        await pushTelemetry(punch.id, {
          geo: geo.status === "fulfilled" ? geo.value : null,
          battery: battery.status === "fulfilled" ? battery.value : null,
          network: network.status === "fulfilled" ? network.value : null,
        });
        void qc.invalidateQueries({ queryKey: ["self-attendance-today", candidateId] });
      } catch {
        /* ignore transient errors */
      }
    };
    void send();
    const t = setInterval(send, 45_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [state, punch?.id, candidateId, qc]);


  const pillClass =
    state === "done"
      ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20"
      : state === "in"
      ? "bg-amber-500/10 text-amber-600 ring-amber-500/20"
      : "bg-muted text-muted-foreground ring-border/60";

  return (
    <section
      className={cn(
        "rounded-2xl border border-border/60 bg-card/90 shadow-sm backdrop-blur-xl sm:rounded-3xl",
        compact ? "p-3.5 sm:p-4" : "p-4 sm:p-6",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Today</div>
          <h3 className="mt-0.5 font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
            Mark my attendance
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isNativePlatform()
              ? "Face ID + live GPS will be captured."
              : "Live GPS will be captured. Face ID is available in the iOS app."}
          </p>
        </div>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1", pillClass)}>
          {state === "done" ? (
            <><CheckCircle2 className="h-3.5 w-3.5" /> Completed</>
          ) : state === "in" ? (
            <><Clock className="h-3.5 w-3.5" /> On duty {duration ? `· ${duration}` : ""}</>
          ) : (
            <><Fingerprint className="h-3.5 w-3.5" /> Not marked</>
          )}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3">
        <div className="rounded-xl border border-border/50 bg-background/40 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Check-in</div>
          <div className="mt-0.5 font-display text-base font-bold tabular-nums text-foreground sm:text-lg">
            {timeStr(punch?.check_in_at ?? null)}
          </div>
          {punch?.check_in_lat != null && (
            <div className="mt-1 truncate">
              <MapLink lat={punch.check_in_lat} lng={punch.check_in_lng} />
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border/50 bg-background/40 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Check-out</div>
          <div className="mt-0.5 font-display text-base font-bold tabular-nums text-foreground sm:text-lg">
            {timeStr(punch?.check_out_at ?? null)}
          </div>
          {punch?.check_out_lat != null && (
            <div className="mt-1 truncate">
              <MapLink lat={punch.check_out_lat} lng={punch.check_out_lng} />
            </div>
          )}
        </div>
      </div>

      {(() => {
        const dist = distanceMeters(
          punch?.check_in_lat != null && punch?.check_in_lng != null ? { lat: punch.check_in_lat, lng: punch.check_in_lng } : null,
          punch?.check_out_lat != null && punch?.check_out_lng != null ? { lat: punch.check_out_lat, lng: punch.check_out_lng } : null,
        );
        if (dist == null) return null;
        const deviated = dist > DEVIATION_THRESHOLD_M;
        return (
          <div
            className={cn(
              "mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold ring-1",
              deviated
                ? "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400"
                : "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400",
            )}
          >
            {deviated ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            <span className="min-w-0 flex-1 truncate">
              {deviated ? "Location deviation" : "Same location"} · in → out is {formatDistance(dist)}
            </span>
          </div>
        );
      })()}

      {state === "in" && punch && <LiveTelemetryStrip punch={punch} />}

      <div className="mt-3 sm:mt-4">
        {state === "idle" && (
          <Button
            className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm sm:h-12"
            disabled={!candidateId || inMut.isPending || busy === "in"}
            onClick={() => { setBusy("in"); inMut.mutate(); }}
          >
            {inMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Check in now
          </Button>
        )}
        {state === "in" && (
          <Button
            className="h-11 w-full rounded-xl bg-emerald-600 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600/90 sm:h-12"
            disabled={outMut.isPending || busy === "out"}
            onClick={() => { setBusy("out"); outMut.mutate(); }}
          >
            {outMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Check out
          </Button>
        )}
        {state === "done" && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-center text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            Attendance recorded for today · {duration}
          </div>
        )}
      </div>
    </section>
  );
}
