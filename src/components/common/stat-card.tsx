"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  unit,
  icon: Icon,
  accent = "cyan",
  sub,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  icon: LucideIcon;
  accent?: "cyan" | "green" | "amber" | "red" | "purple" | "blue";
  sub?: string;
}) {
  const accents: Record<string, string> = {
    cyan: "from-cyan-500/20 to-cyan-500/5 text-cyan-400",
    green: "from-emerald-500/20 to-emerald-500/5 text-emerald-400",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-400",
    red: "from-rose-500/20 to-rose-500/5 text-rose-400",
    purple: "from-purple-500/20 to-purple-500/5 text-purple-400",
    blue: "from-sky-500/20 to-sky-500/5 text-sky-400",
  };
  return (
    <Card className="glass-card overflow-hidden">
      <CardContent className="flex items-start justify-between gap-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-2xl font-bold tabular-nums">
              {value === null || value === undefined || value === "" ? "—" : value}
            </span>
            {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
          </div>
          {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
        </div>
        <div className={cn("flex size-10 items-center justify-center rounded-lg bg-gradient-to-br", accents[accent])}>
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}
