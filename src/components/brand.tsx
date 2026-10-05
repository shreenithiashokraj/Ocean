import { cn } from "@/lib/utils";

/** Original Fisherman Module brand mark — a stylised wave + hook.
 *  No copyrighted logos are used. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-9", className)}
      role="img"
      aria-label="Fisherman Module"
    >
      <defs>
        <linearGradient id="fm-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#fm-grad)" fillOpacity="0.16" />
      {/* wave */}
      <path
        d="M6 30c4 0 4-4 9-4s5 4 9 4 4-4 9-4 5 4 9 4"
        stroke="url(#fm-grad)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M6 36c4 0 4-4 9-4s5 4 9 4 4-4 9-4 5 4 9 4"
        stroke="url(#fm-grad)"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* hook */}
      <path
        d="M28 8v15a6 6 0 1 1-6-6"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="28" cy="8" r="2.4" fill="white" />
    </svg>
  );
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <div className="leading-tight">
        <div className="text-sm font-bold tracking-tight text-foreground">OceanInsight</div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
          Marine Platform
        </div>
      </div>
    </div>
  );
}
