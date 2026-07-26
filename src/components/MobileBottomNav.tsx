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
        bottom: 0,
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)",
      }}
      className={cn(
        "fixed inset-x-0 z-[70] border-t border-border bg-card text-foreground shadow-[0_-6px_20px_-12px_rgba(15,23,42,0.15)] [backface-visibility:hidden] [transform:translate3d(0,0,0)]",
        !nativeShell && "lg:hidden",
      )}
    >
      <ul className="mx-auto flex h-14 max-w-xl items-stretch justify-around gap-0 px-1 pt-1.5">



        {primary.map((it) => {
          const Icon = it.icon;
          const inner = (
            <div
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-1 transition-colors",
                it.active
                  ? "text-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors",
                  it.active && "bg-accent/12",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span
                className={cn(
                  "max-w-full truncate text-[10px] font-semibold leading-none tracking-tight",
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
                    "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-1 transition-colors",
                  moreActive
                    ? "text-accent"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors",
                    moreActive && "bg-accent/12",
                  )}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </span>
                <span className="text-[10px] font-semibold leading-none tracking-tight text-foreground/70">
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
