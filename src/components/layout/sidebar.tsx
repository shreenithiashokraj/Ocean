"use client";

import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Waves,
  ShieldAlert,
  Sparkles,
  MapPin,
  Fish,
  LifeBuoy,
  Settings,
  Users,
  Database,
  Dna,
  FileDown,
  FlaskConical,
  FileBarChart,
  Bell,
  Search,
  Globe2,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { useAppStore, type ViewId } from "@/lib/store";
import { Badge } from "@/components/ui/badge";

export interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
}

export const FISHERMAN_NAV: NavItem[] = [
  { id: "fisherman.dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "fisherman.sea-conditions", label: "Real-Time Sea Conditions", icon: Waves },
  { id: "fisherman.safety-alerts", label: "Safety & Alert System", icon: ShieldAlert },
  { id: "fisherman.ai-fish-analysis", label: "AI Fish Analysis", icon: Sparkles },
  { id: "fisherman.location-navigation", label: "Location & Navigation", icon: MapPin },
  { id: "fisherman.notifications", label: "Notifications", icon: Bell },
  { id: "fisherman.catch-logging", label: "Catch Logging", icon: Fish },
  { id: "fisherman.sos-emergency", label: "SOS & Emergency", icon: LifeBuoy },
  { id: "fisherman.profile", label: "Profile & Settings", icon: Settings },
];

export const RESEARCHER_NAV: NavItem[] = [
  { id: "researcher.dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "researcher.data-explorer", label: "Data Explorer", icon: Search },
  { id: "researcher.gis", label: "GIS Map View", icon: Globe2 },
  { id: "researcher.reports", label: "Research Reports", icon: FileBarChart },
  { id: "researcher.sea-conditions", label: "Sea Conditions", icon: Waves },
  { id: "researcher.fishing-data", label: "Analytics", icon: Activity },
  // Roadmap placeholders for the research workbench — same "Soon" convention
  // the fisherman nav already uses (disabled, never routed).
  { id: "researcher.species-biodiversity" as ViewId, label: "Species & Biodiversity", icon: Fish },
  { id: "researcher.edna-taxonomy" as ViewId, label: "eDNA & Taxonomy", icon: Dna },
  { id: "researcher.ai-assistant" as ViewId, label: "AI Research Assistant", icon: FlaskConical },
  { id: "researcher.exports" as ViewId, label: "Exports", icon: FileDown },
];

export const ADMIN_NAV: NavItem[] = [
  { id: "admin.dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "admin.users", label: "Users & Roles", icon: Users },
  { id: "admin.sea-conditions", label: "Sea Conditions", icon: Waves },
  { id: "admin.alerts", label: "Alerts", icon: ShieldAlert },
  { id: "admin.fish-analyses", label: "Fish Analysis Records", icon: Sparkles },
  { id: "admin.locations", label: "Fishing Locations", icon: MapPin },
  { id: "admin.api-monitoring", label: "API Monitoring", icon: Activity },
  { id: "admin.settings", label: "Settings & API", icon: Database },
];

export function navForRole(role: string): NavItem[] {
  if (role === "ADMIN") return ADMIN_NAV;
  if (role === "RESEARCHER") return RESEARCHER_NAV;
  return FISHERMAN_NAV;
}

export function Sidebar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const user = useAppStore((s) => s.user);
  const items = navForRole(user?.role ?? "FISHERMAN");

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/60 backdrop-blur-xl">
      <nav className="flex-1 overflow-y-auto scroll-ocean p-3">
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={item.soon}
                  onClick={() => setView(item.id)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                    "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    active && "bg-primary/15 text-primary font-semibold",
                    item.soon && "cursor-not-allowed opacity-55 hover:bg-transparent"
                  )}
                >
                  <Icon className={cn("size-4.5 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.soon && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[9px] uppercase">
                      Soon
                    </Badge>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-sidebar-border p-3 text-[10px] text-muted-foreground">
        Fisherman Module · v1.0
      </div>
    </aside>
  );
}
