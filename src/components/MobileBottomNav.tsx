import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isNativePlatform } from "@/lib/native";
import { cn } from "@/lib/utils";

export type BottomNavItem = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
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
  hideMore = false,
}: {
  items: BottomNavItem[];
  onMore: () => void;
  moreActive?: boolean;
  hideMore?: boolean;
}) {
  const primary = items.slice(0, 4);
  const [nativeShell, setNativeShell] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setNativeShell(isNativePlatform());
    setPortalTarget(document.body);
  }, []);

  const nav = (
    <nav
      aria-label="Primary"
      data-bottom-nav
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        bottom: "0px",
        left: "0px",
        right: "0px",
      }}
      className={cn(
        "fixed z-[80] border-t border-border/40 bg-card/98 backdrop-blur-xl",
        "shadow-[0_-1px_0_0_rgba(255,255,255,0.04)_inset,0_-12px_28px_-16px_rgba(15,23,42,0.22)]",
        !nativeShell && "lg:hidden",
      )}
    >
      <ul className="mx-auto flex h-[60px] w-full items-stretch px-1 pt-1">
        {primary.map((it) => {
          const Icon = it.icon;
          const inner = (
            <div className="flex h-full w-full flex-col items-center justify-center gap-[3px]">
              <span
                className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-colors",
                  it.active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-transparent text-foreground/70",
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={it.active ? 2.4 : 2} />
              </span>
              <span
                className={cn(
                  "block w-full truncate px-0.5 text-center text-[10px] leading-[13px] tracking-tight",
                  it.active ? "font-bold text-primary" : "font-semibold text-foreground/70",
                )}
              >
                {it.label}
              </span>
            </div>
          );
          const tapClass = "flex h-full w-full appearance-none select-none items-stretch [-webkit-tap-highlight-color:transparent] [touch-action:manipulation] outline-none focus-visible:outline-none active:opacity-90";
          return (
            <li key={it.key} className="flex flex-1 items-stretch">
              {it.to ? (
                <Link to={it.to} className={tapClass}>{inner}</Link>
              ) : (
                <button type="button" onClick={it.onClick} className={tapClass}>{inner}</button>
              )}
            </li>
          );
        })}

        {!hideMore && (
        <li className="flex flex-1 items-stretch">
          <button
            type="button"
            onClick={onMore}
            aria-label="More"
            className="flex h-full w-full appearance-none select-none items-stretch [-webkit-tap-highlight-color:transparent] [touch-action:manipulation] outline-none focus-visible:outline-none active:opacity-90"
          >
            <div className="flex h-full w-full flex-col items-center justify-center gap-[3px]">
              <span
                className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-colors",
                  moreActive ? "bg-primary text-primary-foreground shadow-sm" : "bg-transparent text-foreground/70",
                )}
              >
                <MoreHorizontal className="h-[18px] w-[18px] shrink-0" strokeWidth={moreActive ? 2.4 : 2} />
              </span>
              <span className={cn("block w-full truncate px-0.5 text-center text-[10px] leading-[13px] tracking-tight", moreActive ? "font-bold text-primary" : "font-semibold text-foreground/70")}>
                More
              </span>
            </div>
          </button>
        </li>
        )}

      </ul>
    </nav>
  );

  return portalTarget ? createPortal(nav, portalTarget) : nav;
}
