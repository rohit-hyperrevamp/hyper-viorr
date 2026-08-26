import logo from "@/assets/hv-logo.png";

type BrandMarkProps = {
  className?: string;
  compact?: boolean;
  variant?: "default" | "inverse";
};

export function BrandMark({
  className = "",
  compact = false,
  variant = "default",
}: BrandMarkProps) {
  const titleClass =
    variant === "inverse" ? "text-primary-foreground" : "text-foreground";
  const subtitleClass =
    variant === "inverse"
      ? "text-primary-foreground/70"
      : "text-muted-foreground";

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img
        src={logo}
        alt="Hyper Vioarr"
        className="h-10 w-10 shrink-0 object-contain"
      />
      {!compact && (
        <div className="leading-tight">
          <div className={`font-display text-base font-bold tracking-tight ${titleClass}`}>
            Hyper Vioarr
          </div>
          <div
            className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${subtitleClass}`}
          >
            Vioarr × HyperRevamp
          </div>
        </div>
      )}
    </div>
  );
}
