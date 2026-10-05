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
  Home,
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

export const SCIENTIFIC_MODULES_NAV: NavItem[] = [
  { id: "module.oceanographic", label: "Oceanographic Data", icon: Waves },
  { id: "module.fisheries", label: "Fisheries Data", icon: Fish },
  { id: "module.biodiversity", label: "Molecular Biodiversity", icon: Dna },
  { id: "module.analysis", label: "AI Integrated Analysis", icon: Sparkles },
];

export const FISHERMAN_NAV: NavItem[] = [
  { id: "fisherman.dashboard", label: "Fisherman Dashboard", icon: LayoutDashboard },
  { id: "fisherman.catch-logging", label: "Daily Catch Logging", icon: Fish },
  { id: "fisherman.sea-conditions", label: "Sea Conditions & Weather", icon: Waves },
  { id: "fisherman.safety-alerts", label: "Safety Alerts", icon: ShieldAlert },
  { id: "fisherman.ai-fish-analysis", label: "AI Fish Identification", icon: Sparkles },
  { id: "fisherman.location-navigation", label: "Navigation & Harbours", icon: MapPin },
  { id: "fisherman.sos-emergency", label: "SOS Distress Beacon", icon: LifeBuoy },
  { id: "fisherman.profile", label: "Profile & Settings", icon: Settings },
];

export const RESEARCHER_NAV: NavItem[] = [
  { id: "researcher.dashboard", label: "Researcher Dashboard", icon: LayoutDashboard },
  { id: "researcher.data-explorer", label: "Unified Data Explorer", icon: Search },
  { id: "researcher.gis", label: "GIS Marine Map", icon: Globe2 },
  { id: "researcher.reports", label: "Research Reports", icon: FileBarChart },
  { id: "researcher.species-biodiversity", label: "Species & Biodiversity", icon: Fish },
  { id: "researcher.edna-taxonomy", label: "eDNA & Taxonomy", icon: Dna },
  { id: "researcher.ai-assistant", label: "AI Research Assistant", icon: FlaskConical },
  { id: "researcher.exports", label: "Dataset Exports", icon: FileDown },
];

export const ADMIN_NAV: NavItem[] = [
  { id: "admin.dashboard", label: "Admin Dashboard", icon: LayoutDashboard },
  { id: "admin.users", label: "Users & Role Access", icon: Users },
  { id: "admin.sea-conditions", label: "Oceanographic Records", icon: Waves },
  { id: "admin.alerts", label: "Weather Alert Logs", icon: ShieldAlert },
  { id: "admin.fish-analyses", label: "AI Analysis Logs", icon: Sparkles },
  { id: "admin.locations", label: "Harbours & Buoys", icon: MapPin },
  { id: "admin.api-monitoring", label: "API Monitoring", icon: Activity },
  { id: "admin.settings", label: "System Settings", icon: Database },
];

export function navForRole(role: string | undefined): NavItem[] {
  if (role === "ADMIN") return ADMIN_NAV;
  if (role === "RESEARCHER") return RESEARCHER_NAV;
  if (role === "FISHERMAN") return FISHERMAN_NAV;
  return [];
}

export function Sidebar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const user = useAppStore((s) => s.user);
  const roleItems = navForRole(user?.role);

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-sidebar/70 backdrop-blur-xl">
      <nav className="flex-1 overflow-y-auto scroll-ocean p-3 space-y-5">
        {/* Main Dashboard Link */}
        <div>
          <button
            type="button"
            onClick={() => setView("landing")}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all",
              "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              view === "landing" && "bg-primary/15 text-primary"
            )}
          >
            <Home className="size-4 shrink-0" />
            <span>Main Platform Dashboard</span>
          </button>
        </div>

        {/* Core Scientific Modules Section */}
        <div>
          <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Scientific Domains
          </div>
          <ul className="space-y-0.5">
            {SCIENTIFIC_MODULES_NAV.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setView(item.id)}
                    className={cn(
                      "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all",
                      "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      active && "bg-primary/15 text-primary font-bold shadow-xs"
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Role Workspace Section (when signed in) */}
        {roleItems.length > 0 && (
          <div>
            <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>{user?.role} Portal</span>
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                Active
              </Badge>
            </div>
            <ul className="space-y-0.5">
              {roleItems.map((item) => {
                const Icon = item.icon;
                const active = view === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={item.soon}
                      onClick={() => setView(item.id)}
                      className={cn(
                        "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all",
                        "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                        active && "bg-primary/15 text-primary font-semibold",
                        item.soon && "cursor-not-allowed opacity-55 hover:bg-transparent"
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                      <span className="flex-1 text-left">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </nav>

      <div className="border-t border-border p-3 text-[11px] text-muted-foreground flex items-center justify-between">
        <span>OceanInsight Intelligence</span>
        <Badge variant="secondary" className="text-[9px]">
          v2.0
        </Badge>
      </div>
    </aside>
  );
}
