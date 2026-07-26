import { useEffect, useState } from "react";
import {
  Battery,
  BatteryCharging,
  ExternalLink,
  MapPin,
  Radio,
  RefreshCw,
  Signal,
  Wifi,
} from "lucide-react";
import {
  getCurrentPosition,
  mapsUrl,
  readBattery,
  readNetworkType,
} from "@/lib/self-attendance";
import { cn } from "@/lib/utils";

type Snapshot = {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  battery: number | null;
  charging: boolean | null;
  network: string | null;
  at: number | null;
  error: string | null;
};

const EMPTY: Snapshot = {
  lat: null,
  lng: null,
  accuracy: null,
  battery: null,
  charging: null,
  network: null,
  at: null,
  error: null,
};

async function readAll(): Promise<Snapshot> {
  const [geo, bat, net] = await Promise.allSettled([
    getCurrentPosition(),
    readBattery(),
    readNetworkType(),
  ]);
  const g = geo.status === "fulfilled" ? geo.value : null;
  const b = bat.status === "fulfilled" ? bat.value : { level: null, charging: null };
  const n = net.status === "fulfilled" ? net.value : null;
  return {
    lat: g?.lat ?? null,
    lng: g?.lng ?? null,
    accuracy: g?.accuracy ?? null,
    battery: b.level,
    charging: b.charging,
    network: n,
    at: Date.now(),
    error: geo.status === "rejected" ? (geo.reason instanceof Error ? geo.reason.message : "Location unavailable") : null,
  };
}

export function MyLiveStatusCard() {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setSnap(await readAll());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const url = mapsUrl(snap.lat, snap.lng);
  const bat = snap.battery;
  const batTone =
    bat == null
      ? "text-muted-foreground"
      : bat <= 20
      ? "text-rose-600 dark:text-rose-400"
      : bat <= 40
      ? "text-amber-600 dark:text-amber-400"
      : "text-emerald-700 dark:text-emerald-400";
  const batBg =
    bat == null
      ? "bg-muted"
      : bat <= 20
      ? "bg-rose-500/10"
      : bat <= 40
      ? "bg-amber-500/10"
      : "bg-emerald-500/10";
  const net = snap.network;
  const NetIcon = net === "WiFi" ? Wifi : net === "5G" || net === "4G" ? Signal : Radio;
  const seen = snap.at
    ? (() => {
        const s = Math.max(0, Math.round((Date.now() - snap.at!) / 1000));
        return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
      })()
    : "—";

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm backdrop-blur-xl sm:rounded-3xl">
      <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">My device</div>
          <h3 className="mt-0.5 font-display text-base font-bold tracking-tight text-foreground">
            Live status
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Live · {seen}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh"
            className="grid h-8 w-8 place-items-center rounded-full bg-muted/60 text-foreground/70 transition hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2 p-3">
        <div className={cn("flex flex-col items-start gap-1 rounded-2xl p-2.5", batBg)}>
          <div className={cn("inline-flex items-center gap-1", batTone)}>
            {snap.charging ? <BatteryCharging className="h-4 w-4" /> : <Battery className="h-4 w-4" />}
            <span className="text-[10px] font-bold uppercase tracking-wider">Battery</span>
          </div>
          <div className={cn("font-display text-lg font-bold tabular-nums leading-none", batTone)}>
            {bat == null ? "—" : `${bat}%`}
          </div>
          <div className="text-[10px] font-semibold text-muted-foreground">
            {snap.charging ? "Charging ⚡" : bat == null ? "Unavailable" : "On battery"}
          </div>
        </div>

        <div className="flex flex-col items-start gap-1 rounded-2xl bg-sky-500/10 p-2.5">
          <div className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300">
            <NetIcon className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Network</span>
          </div>
          <div className="font-display text-lg font-bold leading-none text-sky-700 dark:text-sky-300">
            {net ?? "—"}
          </div>
          <div className="text-[10px] font-semibold text-muted-foreground">
            {net === "Offline" ? "No connection" : "Online"}
          </div>
        </div>

        <div className="flex flex-col items-start gap-1 rounded-2xl bg-violet-500/10 p-2.5">
          <div className="inline-flex items-center gap-1 text-violet-700 dark:text-violet-300">
            <MapPin className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">GPS</span>
          </div>
          <div className="font-display text-lg font-bold leading-none text-violet-700 dark:text-violet-300">
            {snap.lat != null ? "Locked" : "—"}
          </div>
          <div className="text-[10px] font-semibold text-muted-foreground">
            {snap.accuracy != null ? `±${Math.round(snap.accuracy)}m` : snap.error ? "Denied" : "Locating…"}
          </div>
        </div>
      </div>

      <div className="px-3 pb-3">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            <MapPin className="h-4 w-4" />
            View my live location
            <ExternalLink className="h-3 w-3 opacity-80" />
          </a>
        ) : (
          <div className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-muted text-xs font-semibold text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {snap.error ?? "Waiting for GPS…"}
          </div>
        )}
      </div>
    </section>
  );
}
