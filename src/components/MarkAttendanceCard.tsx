import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, LogIn, LogOut, MapPin, Loader2, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  checkIn,
  checkOut,
  fetchTodayPunch,
  getCurrentPosition,
  verifyFaceForAttendance,
  type SelfPunch,
} from "@/lib/self-attendance";
import { isNativePlatform } from "@/lib/native";
import { cn } from "@/lib/utils";

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
    queryFn: () => fetchTodayPunch(candidateId!),
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
      return await checkIn(candidateId, geo, face);
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
            <div className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {punch.check_in_lat.toFixed(4)}, {punch.check_in_lng?.toFixed(4)}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border/50 bg-background/40 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Check-out</div>
          <div className="mt-0.5 font-display text-base font-bold tabular-nums text-foreground sm:text-lg">
            {timeStr(punch?.check_out_at ?? null)}
          </div>
          {punch?.check_out_lat != null && (
            <div className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {punch.check_out_lat.toFixed(4)}, {punch.check_out_lng?.toFixed(4)}
            </div>
          )}
        </div>
      </div>

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
