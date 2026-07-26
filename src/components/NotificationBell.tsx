import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { Bell, CheckCheck, Volume2, VolumeX, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  listMyNotifications,
  markAllRead,
  markNotificationRead,
  type Notification,
} from "@/lib/notifications";
import {
  isNotificationSoundMuted,
  playNotificationChime,
  setNotificationSoundMuted,
} from "@/lib/notification-sound";
import { shouldRedirect } from "@/lib/notification-routing";
import { NotificationDetailDialog } from "@/components/NotificationDetailDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { isNativePlatform } from "@/lib/native";

const NQK = ["notifications", "mine"] as const;

export function NotificationBell() {
  const qc = useQueryClient();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [nativeShell, setNativeShell] = useState(false);
  const [drawerMode, setDrawerMode] = useState(false);
  const mobileSheet = isMobile || nativeShell || drawerMode;
  const { data: items = [] } = useQuery({
    queryKey: NQK,
    queryFn: listMyNotifications,
    refetchInterval: 10_000,
  });
  const unread = items.filter((n) => !n.readAt).length;
  const top = items.slice(0, 8);

  // Track seen notification IDs so we only chime on genuinely new arrivals.
  const seenRef = useRef<Set<string> | null>(null);
  const [muted, setMuted] = useState<boolean>(() => isNotificationSoundMuted());
  const [detail, setDetail] = useState<Notification | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      const isNative = isNativePlatform();
      setNativeShell(isNative);
      setDrawerMode(isNative || window.innerWidth < 1024);
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  useEffect(() => {
    if (!items || items.length === 0) return;
    const currentIds = items.map((n) => n.id);
    if (seenRef.current === null) {
      seenRef.current = new Set(currentIds);
      return;
    }
    const seen = seenRef.current;
    const newUnread = items.filter((n) => !n.readAt && !seen.has(n.id));
    for (const id of currentIds) seen.add(id);
    if (newUnread.length > 0) {
      playNotificationChime();
    }
  }, [items]);

  const openLink = (target: string) => {
    if (!target) return;
    setMobileOpen(false);
    if (target.startsWith("/")) router.history.push(target);
    else if (typeof window !== "undefined") window.location.href = target;
  };

  const handleOpenNotification = async (n: Notification) => {
    if (!n.readAt) {
      await markNotificationRead(n.id);
      qc.invalidateQueries({ queryKey: NQK });
    }
    if (shouldRedirect(n.type) && n.link && n.link.trim()) {
      openLink(n.link);
    } else {
      setMobileOpen(false);
      setDetail(n);
    }
  };

  const trigger = (
    <button
      type="button"
      aria-label="Notifications"
      data-no-tip
      onClick={(event) => {
        const shouldOpenDrawer =
          mobileSheet ||
          (typeof window !== "undefined" && window.innerWidth < 1024) ||
          isNativePlatform();
        if (!shouldOpenDrawer) return;
        event.preventDefault();
        event.stopPropagation();
        setMobileOpen(true);
      }}
      className="relative inline-flex h-10 w-10 shrink-0 aspect-square items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-accent hover:text-accent"
      style={{ borderRadius: "9999px", flex: "0 0 40px" }}
    >
      <Bell className="h-4 w-4" />
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );

  const notificationList = (
    <>
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <div className="text-[15px] font-bold tracking-tight text-foreground">Notifications</div>
          <div className="text-[11px] text-muted-foreground">
            {unread > 0 ? `${unread} unread` : "You’re all caught up"}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const next = !muted;
              setNotificationSoundMuted(next);
              setMuted(next);
              if (!next) playNotificationChime();
            }}
            aria-label={muted ? "Unmute notification sound" : "Mute notification sound"}
            title={muted ? "Sound off" : "Sound on"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground [-webkit-tap-highlight-color:transparent]"
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            disabled={unread === 0}
            onClick={async () => {
              await markAllRead();
              qc.invalidateQueries({ queryKey: NQK });
            }}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/15 disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all
          </button>
        </div>
      </div>
      <div className="max-h-[min(65dvh,26rem)] overflow-y-auto overscroll-contain">
        {top.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <div className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-secondary/60">
              <Bell className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-sm font-semibold text-foreground">No notifications</div>
            <div className="mt-0.5 text-xs text-muted-foreground">New alerts will appear here.</div>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {top.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void handleOpenNotification(n)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40 [-webkit-tap-highlight-color:transparent]",
                    !n.readAt && "bg-primary/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full",
                      !n.readAt ? "bg-primary/15 text-primary" : "bg-secondary/60 text-muted-foreground",
                    )}
                  >
                    <Bell className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[13.5px] font-semibold leading-snug text-foreground">
                        {n.title}
                      </div>
                      {!n.readAt && (
                        <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                    {n.message && (
                      <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                        {n.message}
                      </div>
                    )}
                    <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-border/60 px-4 py-2.5">
        <Button asChild variant="ghost" size="sm" className="h-9 w-full justify-center rounded-xl text-xs font-semibold" onClick={() => setMobileOpen(false)}>
          <Link to="/admin/notifications">Open Notification Center</Link>
        </Button>
      </div>
    </>
  );

  const notificationDrawer =
    mobileOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label="Notifications">
            <button
              type="button"
              aria-label="Close notifications"
              data-no-tip
              className="absolute inset-0 bg-foreground/40 backdrop-blur-md animate-in fade-in-0 duration-200"
              onClick={() => setMobileOpen(false)}
            />
            <div
              className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-[28px] border-t border-x border-border/60 bg-card shadow-[0_-24px_80px_-20px_rgba(15,23,42,0.55)] animate-in slide-in-from-bottom duration-300 ease-out"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4px)",
              }}
            >
              <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                <div className="w-8" aria-hidden="true" />
                <span className="h-1 w-10 rounded-full bg-muted-foreground/30" />
                <button
                  type="button"
                  aria-label="Close notifications"
                  data-no-tip
                  onClick={() => setMobileOpen(false)}
                  className="grid h-8 w-8 place-items-center rounded-full bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground [-webkit-tap-highlight-color:transparent]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {notificationList}
            </div>
          </div>,
          document.body,
        )
      : null;

  if (mobileSheet) {
    return (
      <>
        {trigger}
        {notificationDrawer}
        <NotificationDetailDialog
          notification={detail}
          open={detail !== null}
          onOpenChange={(o) => { if (!o) setDetail(null); }}
          onOpenLink={openLink}
        />
      </>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={12}
        collisionPadding={12}
        avoidCollisions
        className={cn(
          "z-50 p-0 shadow-2xl",
          // Desktop / tablet: compact popover next to the sidebar
          "w-[min(22rem,calc(100vw-1.5rem))] rounded-xl",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        )}
      >
        {notificationList}
      </PopoverContent>
      <NotificationDetailDialog
        notification={detail}
        open={detail !== null}
        onOpenChange={(o) => { if (!o) setDetail(null); }}
        onOpenLink={openLink}
      />
      {notificationDrawer}
    </Popover>
  );
}

