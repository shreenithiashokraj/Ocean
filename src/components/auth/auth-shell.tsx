"use client";

import { cn } from "@/lib/utils";
import { BrandLockup, BrandMark } from "@/components/brand";
import { Waves, Anchor, Compass } from "lucide-react";

export function AuthShell({
  children,
  side,
}: {
  children: React.ReactNode;
  side?: "left" | "full";
}) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden ocean-bg">
      {/* floating accents */}
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -left-20 top-10 size-72 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute right-0 top-1/3 size-96 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 size-80 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        {/* Brand / marketing side */}
        {side !== "full" && (
          <div className="hidden flex-col justify-between p-10 lg:flex">
            <BrandLockup />
            <div className="max-w-md space-y-6">
              <h1 className="text-4xl font-bold leading-tight tracking-tight">
                Smart fishing, <span className="text-cyan-400">powered by the sea</span> and AI.
              </h1>
              <p className="text-muted-foreground">
                Real-time sea conditions, safety alerts, AI fish analysis and
                navigation — built for the people who live on the water.
              </p>
              <ul className="space-y-3">
                <FeatureRow icon={Waves} title="Live sea & marine data" desc="Weather, waves, wind — refreshed on a schedule." />
                <FeatureRow icon={Compass} title="Location & navigation" desc="Interactive maps, saved fishing spots, GPS." />
                <FeatureRow icon={Anchor} title="Role-based portals" desc="Fisherman, Researcher and Admin workspaces." />
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              Marine data © Open-Meteo · Maps © OpenStreetMap contributors
            </p>
          </div>
        )}

        {/* Form side */}
        <div className={cn("flex items-center justify-center p-6 sm:p-10", side === "full" && "lg:col-span-2")}>
          <div className="w-full max-w-md">
            <div className="mb-8 flex justify-center lg:hidden">
              <div className="flex items-center gap-3">
                <BrandMark className="size-11" />
                <div>
                  <div className="text-lg font-bold leading-none">Fisherman Module</div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Smart Fishing</div>
                </div>
              </div>
            </div>
            <div className="glass-card rounded-2xl p-6 shadow-2xl sm:p-8">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Icon className="size-4.5" />
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </li>
  );
}
