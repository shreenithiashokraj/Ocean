"use client";

import { useAppStore, type ViewId } from "@/lib/store";
import { Construction, type LucideIcon } from "lucide-react";
import {
  // Fisherman module views (real implementations live in src/components/<module>/)
  SeaConditionsView,
  SafetyAlertsView,
  FishAnalysisView,
  LocationNavigationView,
  FishermanDashboardView,
  // Researcher
  ResearcherDashboardView,
  ResearcherSeaConditionsView,
  ResearcherFishingDataView,
  // Admin
  AdminDashboardView,
  AdminUsersView,
  AdminSeaConditionsView,
  AdminAlertsView,
  AdminFishAnalysesView,
  AdminLocationsView,
  AdminSettingsView,
} from "@/components/modules";

export function ModuleRouter() {
  const view = useAppStore((s) => s.view);
  return <ViewRenderer view={view} />;
}

function ViewRenderer({ view }: { view: ViewId }) {
  switch (view) {
    // Fisherman
    case "fisherman.dashboard": return <FishermanDashboardView />;
    case "fisherman.sea-conditions": return <SeaConditionsView />;
    case "fisherman.safety-alerts": return <SafetyAlertsView />;
    case "fisherman.ai-fish-analysis": return <FishAnalysisView />;
    case "fisherman.location-navigation": return <LocationNavigationView />;
    // Researcher
    case "researcher.dashboard": return <ResearcherDashboardView />;
    case "researcher.sea-conditions": return <ResearcherSeaConditionsView />;
    case "researcher.fishing-data": return <ResearcherFishingDataView />;
    // Admin
    case "admin.dashboard": return <AdminDashboardView />;
    case "admin.users": return <AdminUsersView />;
    case "admin.sea-conditions": return <AdminSeaConditionsView />;
    case "admin.alerts": return <AdminAlertsView />;
    case "admin.fish-analyses": return <AdminFishAnalysesView />;
    case "admin.locations": return <AdminLocationsView />;
    case "admin.settings": return <AdminSettingsView />;
    default:
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
          <Construction className="size-10" />
          <p className="text-sm">This view is not implemented yet.</p>
        </div>
      );
  }
}

export type { ViewId };
