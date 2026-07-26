import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Battery, BatteryCharging, ExternalLink, MapPin, Radio, Signal, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { mapsUrl } from "@/lib/self-attendance";
import { cn } from "@/lib/utils";

type LivePunch = {
  id: string;
  candidate_id: string;
  check_in_at: string | null;
  check_out_at: string | null;
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

export function LiveFieldOfficersCard() {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["live-field-officers", today()],
    refetchInterval: 30_000,
    queryFn: async (): Promise<LivePunch[]> => {
      const { data, error } = await supabase
        .from("self_attendance_punches" as never)
        .select(
          "id, candidate_id, check_in_at, check_out_at, last_lat, last_lng, last_seen_at, battery_pct, battery_charging, network_type, candidate:candidates!inner(full_name, employee_code, role_key, mobile)",
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

  useEffect(() => {
    const ch = supabase
      .channel("live-fo-punches")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "self_attendance_punches" },
        () => {
          void qc.invalidateQueries({ queryKey: ["live-field-officers", today()] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  const rows = q.data ?? [];

  return (
    <section className="rounded-2xl border border-border/60 bg-card/90 shadow-sm backdrop-blur-xl sm:rounded-3xl">
      <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Live now</div>
          <h3 className="mt-0.5 font-display text-base font-bold tracking-tight text-foreground">
            Field officers on duty
          </h3>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          {rows.length}
        </span>
      </header>

      <ul className="divide-y divide-border/50">
        {q.isLoading && (
          <li className="px-4 py-6 text-center text-xs text-muted-foreground">Loading live status…</li>
        )}
        {!q.isLoading && rows.length === 0 && (
          <li className="px-4 py-6 text-center text-xs text-muted-foreground">
            No field officers are currently checked in.
          </li>
        )}
        {rows.map((r) => {
          const url = mapsUrl(r.last_lat, r.last_lng);
          const bat = r.battery_pct;
          const batTone =
            bat == null
              ? "text-muted-foreground"
              : bat <= 20
              ? "text-rose-600 dark:text-rose-400"
              : bat <= 40
              ? "text-amber-600 dark:text-amber-400"
              : "text-emerald-700 dark:text-emerald-400";
          const net = r.network_type;
          const NetIcon = net === "WiFi" ? Wifi : net === "5G" || net === "4G" ? Signal : Radio;
          return (
            <li key={r.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-foreground">
                    {r.candidate?.full_name ?? "Field officer"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {r.candidate?.employee_code ?? "—"} · in {seenLabel(r.check_in_at)}
                  </div>
                </div>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
                  >
                    <MapPin className="h-3 w-3" />
                    Live
                    <ExternalLink className="h-2.5 w-2.5 opacity-80" />
                  </a>
                ) : (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    no gps
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  {seenLabel(r.last_seen_at)}
                </span>
                <span className={cn("inline-flex items-center gap-1", batTone)}>
                  {r.battery_charging ? <BatteryCharging className="h-3.5 w-3.5" /> : <Battery className="h-3.5 w-3.5" />}
                  {bat == null ? "n/a" : `${bat}%${r.battery_charging ? " ⚡" : ""}`}
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
  );
}
