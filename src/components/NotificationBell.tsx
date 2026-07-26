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
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-accent hover:text-accent"
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
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="text-sm font-semibold">Notifications</div>
        <div className="flex items-center gap-2">
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
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
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
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-accent disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        </div>
      </div>
      <div className="max-h-[min(65dvh,24rem)] overflow-y-auto overscroll-contain">
        {top.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No notifications yet.
          </div>
        ) : (
          top.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => void handleOpenNotification(n)}
              className={cn(
                "block w-full border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-secondary/50",
                !n.readAt && "bg-accent/5",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[13px] font-semibold text-foreground">
                  {n.title}
                </div>
                {!n.readAt && (
                  <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-accent" />
                )}
              </div>
              {n.message && (
                <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {n.message}
                </div>
              )}
              <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
              </div>
            </button>
          ))
        )}
      </div>
      <div className="border-t border-border px-3 py-2 text-center">
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setMobileOpen(false)}>
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
              className="absolute inset-0 bg-foreground/35 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <div
              className="absolute inset-x-0 flex max-h-[82dvh] flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-[0_-24px_70px_-28px_rgba(15,23,42,0.55)]"
              style={{
                bottom: "calc(env(safe-area-inset-bottom, 0px) * -1)",
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
              }}
            >
              <div className="flex justify-center py-2">
                <span className="h-1 w-10 rounded-full bg-muted-foreground/30" />
              </div>
              <button
                type="button"
                aria-label="Close notifications"
                data-no-tip
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-2 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
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

