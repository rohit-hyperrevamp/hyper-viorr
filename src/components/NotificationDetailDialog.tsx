import { formatDistanceToNow, format } from "date-fns";
import { Bell, ExternalLink, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchActorInfo } from "@/lib/actor-info";
import type { Notification } from "@/lib/notifications";

type Props = {
  notification: Notification | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenLink?: (link: string) => void;
};


export function NotificationDetailDialog({
  notification,
  open,
  onOpenChange,
  onOpenLink,
}: Props) {
  const n = notification;
  const { data: actor } = useQuery({
    queryKey: ["notification-actor", n?.actorId],
    enabled: open && !!n?.actorId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchActorInfo(n?.actorId),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Bell className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base leading-snug">
                {n?.title || "Notification"}
              </DialogTitle>
              {n?.createdAt && (
                <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  {" · "}
                  {format(new Date(n.createdAt), "d MMM yyyy, HH:mm")}
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        {n?.message && (
          <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm text-foreground/90">
            {n.message}
          </div>
        )}

        {n?.actorId && (
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Performed by
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0 text-sm">
                <div className="font-semibold text-foreground">
                  {actor?.fullName ?? "Loading…"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {[actor?.designation, actor?.mobile].filter(Boolean).join(" · ") || "—"}
                </div>
                {n.createdAt && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {format(new Date(n.createdAt), "EEE, d MMM yyyy 'at' h:mm a")}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}



        {(n?.entityType || n?.type) && (
          <dl className="grid grid-cols-3 gap-2 text-xs">
            {n?.type && (
              <>
                <dt className="col-span-1 text-muted-foreground">Type</dt>
                <dd className="col-span-2 font-mono text-[11px] text-foreground/80">
                  {n.type}
                </dd>
              </>
            )}
            {n?.entityType && (
              <>
                <dt className="col-span-1 text-muted-foreground">Entity</dt>
                <dd className="col-span-2 text-foreground/80">
                  {n.entityType}
                  {n.entityId ? (
                    <span className="ml-1 text-muted-foreground">
                      · {n.entityId.slice(0, 8)}
                    </span>
                  ) : null}
                </dd>
              </>
            )}
          </dl>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {n?.link && onOpenLink && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenLink(n.link);
                onOpenChange(false);
              }}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Open page
            </Button>
          )}
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
