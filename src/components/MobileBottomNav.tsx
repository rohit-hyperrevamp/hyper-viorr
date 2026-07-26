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
      data-bottom-nav
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 safe-bottom",
        !nativeShell && "lg:hidden",
        "border-t border-border/50 bg-card/90 backdrop-blur-2xl backdrop-saturate-150",
        "shadow-[0_-8px_24px_-16px_rgba(15,23,42,0.25)]",
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around gap-0.5 px-2 pt-1.5 pb-1">

        {primary.map((it) => {
          const Icon = it.icon;
          const inner = (
            <div
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 transition-colors",
                it.active
                  ? "text-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-xl transition-colors",
                  it.active && "bg-accent/12",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span
                className={cn(
                  "max-w-full truncate text-[10.5px] font-semibold leading-none tracking-tight",
                  it.active ? "text-accent" : "text-foreground/70",
                )}
              >
                {it.label}
              </span>
            </div>
          );
          return (
            <li key={it.key} className="flex-1">
              {it.to ? (
                <Link to={it.to} className="block">
                  {inner}
                </Link>
              ) : (
                <button type="button" onClick={it.onClick} className="block w-full">
                  {inner}
                </button>
              )}
            </li>
          );
        })}
        {(
          <li className="flex-1">
            <button
              type="button"
              onClick={onMore}
              className="block w-full"
              aria-label="More"
            >
              <div
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 transition-colors",
                  moreActive
                    ? "text-accent"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-xl transition-colors",
                    moreActive && "bg-accent/12",
                  )}
                >
                  <MoreHorizontal className="h-[18px] w-[18px]" />
                </span>
                <span className="text-[10.5px] font-semibold leading-none tracking-tight text-foreground/70">
                  More
                </span>
              </div>
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}
