"use client";

// Module view registry. All views below are real implementations living in
// their own folders. The ModuleRouter imports from this barrel.

// ── Fisherman modules ──────────────────────────────────────────────────────
export { SeaConditionsView } from "@/components/sea-conditions/sea-conditions-view";
export { SafetyAlertsView } from "@/components/safety-alerts/safety-alerts-view";
export { default as FishAnalysisView } from "@/components/fish-analysis/fish-analysis-view";
export { LocationNavigationView } from "@/components/location/location-navigation-view";

// ── Phase 2: fisherman profile + notifications ─────────────────────────────
export { ProfileView } from "@/components/profile/profile-view";
export { NotificationsView } from "@/components/notifications/notifications-view";

// ── Dashboards ────────────────────────────────────────────────────────────
export { FishermanDashboardView } from "@/components/dashboard/fisherman-dashboard-view";

// ── Researcher portal ──────────────────────────────────────────────────────
export { ResearcherDashboardView } from "@/components/researcher/researcher-dashboard-view";
export { ResearcherSeaConditionsView } from "@/components/researcher/researcher-sea-conditions-view";
export { ResearcherFishingDataView } from "@/components/researcher/researcher-fishing-data-view";
// Phase 2
export { ResearcherDataExplorerView } from "@/components/researcher/data-explorer-view";
export { ResearcherDatasetDetailsView } from "@/components/researcher/dataset-details-view";
export { ResearcherGisView } from "@/components/researcher/gis-view";
export { ResearcherReportsView } from "@/components/researcher/reports-view";

// ── Admin portal ───────────────────────────────────────────────────────────
export { AdminDashboardView } from "@/components/admin/admin-dashboard-view";
export { AdminUsersView } from "@/components/admin/admin-users-view";
export { AdminSeaConditionsView } from "@/components/admin/admin-sea-conditions-view";
export { AdminAlertsView } from "@/components/admin/admin-alerts-view";
export { AdminFishAnalysesView } from "@/components/admin/admin-fish-analyses-view";
export { AdminLocationsView } from "@/components/admin/admin-locations-view";
export { AdminSettingsView } from "@/components/admin/admin-settings-view";
// Phase 2
export { ApiMonitoringView } from "@/components/admin/api-monitoring-view";
