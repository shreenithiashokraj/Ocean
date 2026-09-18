import { Waves } from "lucide-react";
import { BrandMark } from "@/components/brand";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-background/70 px-4 py-4 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
        <div className="flex items-center gap-2">
          <BrandMark className="size-5" />
          <span>
            <span className="font-semibold text-foreground">Fisherman Module</span> — Smart fishing technology platform
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Waves className="size-3.5 text-cyan-500" />
            Marine data: Open-Meteo
          </span>
          <span>Maps © OpenStreetMap contributors</span>
        </div>
      </div>
    </footer>
  );
}
