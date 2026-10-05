"use client";

import { useAppStore, type ViewId } from "@/lib/store";
import { Construction, type LucideIcon } from "lucide-react";
import {
  // Core Scientific Modules
  OceanographicModuleView,
  FisheriesModuleView,
  BiodiversityModuleView,
  IntegratedAnalysisView,
  // Fisherman module views (real implementations live in src/components/<module>/)
  SeaConditionsView,
  SafetyAlertsView,
  FishAnalysisView,
  LocationNavigationView,
  ProfileView,
  NotificationsView,
  FishermanDashboardView,
  CatchLoggingView,
  SosEmergencyView,
  // Researcher
  ResearcherDashboardView,
  ResearcherSeaConditionsView,
  ResearcherFishingDataView,
  ResearcherDataExplorerView,
  ResearcherDatasetDetailsView,
  ResearcherGisView,
  ResearcherReportsView,
  // Marine Platform researcher workbench (additive)
  SpeciesBiodiversityView,
  EdnaTaxonomyView,
  AiAssistantView,
  ExportsView,
  // Admin
  AdminDashboardView,
  AdminUsersView,
  AdminSeaConditionsView,
  AdminAlertsView,
  AdminFishAnalysesView,
  AdminLocationsView,
  AdminSettingsView,
  ApiMonitoringView,
} from "@/components/modules";

export function ModuleRouter() {
  const view = useAppStore((s) => s.view);
  return <ViewRenderer view={view} />;
}

function ViewRenderer({ view }: { view: ViewId }) {
  switch (view) {
    // Core Scientific Modules
    case "module.oceanographic": return <OceanographicModuleView />;
    case "module.fisheries": return <FisheriesModuleView />;
    case "module.biodiversity": return <BiodiversityModuleView />;
    case "module.analysis": return <IntegratedAnalysisView />;

    // Fisherman
    case "fisherman.dashboard": return <FishermanDashboardView />;
    case "fisherman.sea-conditions": return <SeaConditionsView />;
    case "fisherman.safety-alerts": return <SafetyAlertsView />;
    case "fisherman.ai-fish-analysis": return <FishAnalysisView />;
    case "fisherman.location-navigation": return <LocationNavigationView />;
    case "fisherman.notifications": return <NotificationsView />;
    case "fisherman.catch-logging": return <CatchLoggingView />;
    case "fisherman.sos-emergency": return <SosEmergencyView />;
    case "fisherman.profile": return <ProfileView />;
    // Researcher
    case "researcher.dashboard": return <ResearcherDashboardView />;
    case "researcher.sea-conditions": return <ResearcherSeaConditionsView />;
    case "researcher.fishing-data": return <ResearcherFishingDataView />;
    case "researcher.data-explorer": return <ResearcherDataExplorerView />;
    case "researcher.dataset-details": return <ResearcherDatasetDetailsView />;
    case "researcher.gis": return <ResearcherGisView />;
    case "researcher.reports": return <ResearcherReportsView />;
    // Marine Platform researcher workbench (additive)
    case "researcher.species-biodiversity": return <SpeciesBiodiversityView />;
    case "researcher.edna-taxonomy": return <EdnaTaxonomyView />;
    case "researcher.ai-assistant": return <AiAssistantView />;
    case "researcher.exports": return <ExportsView />;
    // Admin
    case "admin.dashboard": return <AdminDashboardView />;
    case "admin.users": return <AdminUsersView />;
    case "admin.sea-conditions": return <AdminSeaConditionsView />;
    case "admin.alerts": return <AdminAlertsView />;
    case "admin.fish-analyses": return <AdminFishAnalysesView />;
    case "admin.locations": return <AdminLocationsView />;
    case "admin.api-monitoring": return <ApiMonitoringView />;
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
