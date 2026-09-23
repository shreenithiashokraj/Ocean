import type { Role } from "@/lib/auth";

/** Roles that may access a given portal/module. Backend mirrors this. */
export const PORTAL_ACCESS: Record<string, Role[]> = {
  "admin.dashboard": ["ADMIN"],
  "admin.users": ["ADMIN"],
  "admin.settings": ["ADMIN"],
  "admin.sea-conditions": ["ADMIN"],
  "admin.fish-analyses": ["ADMIN"],
  "admin.locations": ["ADMIN"],
  "admin.alerts": ["ADMIN"],
  "researcher.dashboard": ["RESEARCHER", "ADMIN"],
  "researcher.sea-conditions": ["RESEARCHER", "ADMIN"],
  "researcher.fishing-data": ["RESEARCHER", "ADMIN"],
  "researcher.data-explorer": ["RESEARCHER", "ADMIN"],
  "researcher.dataset-details": ["RESEARCHER", "ADMIN"],
  "researcher.gis": ["RESEARCHER", "ADMIN"],
  "researcher.reports": ["RESEARCHER", "ADMIN"],
  "fisherman.dashboard": ["FISHERMAN", "ADMIN"],
  "fisherman.sea-conditions": ["FISHERMAN", "ADMIN"],
  "fisherman.safety-alerts": ["FISHERMAN", "ADMIN"],
  "fisherman.ai-fish-analysis": ["FISHERMAN", "ADMIN"],
  "fisherman.location-navigation": ["FISHERMAN", "ADMIN"],
};

export function canAccess(route: string, role: Role | undefined): boolean {
  if (!role) return false;
  const allowed = PORTAL_ACCESS[route];
  return !!allowed && allowed.includes(role);
}
