import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { isNativePlatform } from "@/lib/native";
import { cn } from "@/lib/utils";

export type BottomNavItem = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  to?: string;
  onClick?: () => void;
  active?: boolean;
};

/**
 * Fixed bottom tab bar for mobile / native shells.
 * Shows up to 4 primary destinations + a "More" tab that opens
 * the full navigation drawer. Respects iOS safe-area inset.
 */
export function MobileBottomNav({
  items,
  onMore,
  moreActive,
}: {
  items: BottomNavItem[];
  onMore: () => void;
  moreActive?: boolean;
}) {
  const primary = items.slice(0, 4);
  const [nativeShell, setNativeShell] = useState(false);

  useEffect(() => {
    setNativeShell(isNativePlatform());
  }, []);

  return (
    <nav
      aria-label="Primary"
      data-bottom-nav
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)",
        transform: "translateZ(0)",
        WebkitTransform: "translateZ(0)",
      }}
      className={cn(
        "fixed inset-x-0 bottom-0 z-[80] border-t border-border/40 bg-card/95 backdrop-blur-xl [will-change:transform] [contain:layout_paint]",
        "shadow-[0_-1px_0_0_rgba(255,255,255,0.04)_inset,0_-12px_28px_-16px_rgba(15,23,42,0.22)]",
        !nativeShell && "lg:hidden",
      )}
    >
      <ul className="mx-auto flex h-[58px] w-full items-stretch justify-around gap-0 px-2 pt-1.5">
        {primary.map((it) => {
          const Icon = it.icon;
          const inner = (
            <div
              className={cn(
                "relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 pt-1.5 pb-1 transition-colors",
                it.active ? "text-accent" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {it.active && (
                <span className="absolute top-0 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-accent" />
              )}
              <Icon className={cn("h-[19px] w-[19px] shrink-0 transition-transform", it.active && "scale-105")} strokeWidth={it.active ? 2.4 : 2} />
              <span
                className={cn(
                  "max-w-full truncate text-[10px] leading-none tracking-tight",
                  it.active ? "font-bold text-accent" : "font-semibold text-foreground/70",
                )}
              >
                {it.label}
              </span>
            </div>
          );
          return (
            <li key={it.key} className="flex-1">
              {it.to ? (
                <Link to={it.to} className="block">{inner}</Link>
              ) : (
                <button type="button" onClick={it.onClick} className="block w-full">{inner}</button>
              )}
            </li>
          );
        })}
        <li className="flex-1">
          <button type="button" onClick={onMore} className="block w-full" aria-label="More">
            <div
              className={cn(
                "relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 pt-1.5 pb-1 transition-colors",
                moreActive ? "text-accent" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {moreActive && (
                <span className="absolute top-0 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-accent" />
              )}
              <MoreHorizontal className="h-[19px] w-[19px] shrink-0" strokeWidth={moreActive ? 2.4 : 2} />
              <span className={cn("text-[10px] leading-none tracking-tight", moreActive ? "font-bold text-accent" : "font-semibold text-foreground/70")}>
                More
              </span>
            </div>
          </button>
        </li>
      </ul>
    </nav>
  );
}
