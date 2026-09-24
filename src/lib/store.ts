"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Role = "ADMIN" | "RESEARCHER" | "FISHERMAN";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** Logical views within the single `/` route. This simulates the multi-page
 *  portal structure while obeying the sandbox constraint of one route. */
export type ViewId =
  | "landing"
  | "sign-in"
  | "sign-up"
  | "forgot-password"
  | "reset-password"
  | "unauthorized"
  // fisherman
  | "fisherman.dashboard"
  | "fisherman.sea-conditions"
  | "fisherman.safety-alerts"
  | "fisherman.ai-fish-analysis"
  | "fisherman.ai-fish-analysis.history"
  | "fisherman.location-navigation"
  | "fisherman.notifications"
  | "fisherman.catch-logging"
  | "fisherman.sos-emergency"
  | "fisherman.profile"
  | "fisherman.settings"
  // researcher
  | "researcher.dashboard"
  | "researcher.sea-conditions"
  | "researcher.fishing-data"
  | "researcher.data-explorer"
  | "researcher.dataset-details"
  | "researcher.gis"
  | "researcher.reports"
  // marine platform (researcher workbench)
  | "researcher.species-biodiversity"
  | "researcher.edna-taxonomy"
  | "researcher.ai-assistant"
  | "researcher.exports"
  // admin
  | "admin.dashboard"
  | "admin.users"
  | "admin.sea-conditions"
  | "admin.fish-analyses"
  | "admin.locations"
  | "admin.alerts"
  | "admin.api-monitoring"
  | "admin.settings";

interface AppState {
  user: AuthUser | null;
  view: ViewId;
  hydrated: boolean;
  /** pending reset token (between forgot -> reset link click) */
  resetToken: string | null;
  /** researcher dataset key for the dataset-details view */
  selectedDatasetKey: string | null;
  setUser: (u: AuthUser | null) => void;
  setView: (v: ViewId) => void;
  setResetToken: (t: string | null) => void;
  setSelectedDatasetKey: (k: string | null) => void;
  logoutClient: () => void;
  hydrate: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      view: "landing",
      hydrated: false,
      resetToken: null,
      selectedDatasetKey: null,
      setUser: (u) => set({ user: u }),
      setView: (v) => set({ view: v }),
      setResetToken: (t) => set({ resetToken: t }),
      setSelectedDatasetKey: (k) => set({ selectedDatasetKey: k }),
      logoutClient: () => set({ user: null, view: "landing", resetToken: null, selectedDatasetKey: null }),
      hydrate: () => set({ hydrated: true }),
    }),
    {
      name: "fisherman-module-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        user: s.user,
        view: s.view,
        resetToken: s.resetToken,
        selectedDatasetKey: s.selectedDatasetKey,
      }),
    }
  )
);

/** Determine the default dashboard view for a role. */
export function defaultDashboardFor(role: Role): ViewId {
  if (role === "ADMIN") return "admin.dashboard";
  if (role === "RESEARCHER") return "researcher.dashboard";
  return "fisherman.dashboard";
}

/** Roles allowed to view a portal (client-side mirror of backend guard). */
export function roleCanAccess(view: ViewId, role: Role | undefined): boolean {
  if (!role) return false;
  if (role === "ADMIN") return true; // admin sees every portal
  if (role === "RESEARCHER")
    return [
      "researcher.dashboard",
      "researcher.sea-conditions",
      "researcher.fishing-data",
      "researcher.data-explorer",
      "researcher.dataset-details",
      "researcher.gis",
      "researcher.reports",
      // marine platform views (additive)
      "researcher.species-biodiversity",
      "researcher.edna-taxonomy",
      "researcher.ai-assistant",
      "researcher.exports",
    ].includes(view);
  // FISHERMAN
  return [
    "fisherman.dashboard",
    "fisherman.sea-conditions",
    "fisherman.safety-alerts",
    "fisherman.ai-fish-analysis",
    "fisherman.ai-fish-analysis.history",
    "fisherman.location-navigation",
    "fisherman.notifications",
    "fisherman.catch-logging",
    "fisherman.sos-emergency",
    "fisherman.profile",
    "fisherman.settings",
  ].includes(view);
}
