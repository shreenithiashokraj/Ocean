import { NextResponse } from "next/server";
import {
  marineEnabled,
  marineFeatureEnabled,
  marineRoleAllowed,
  MARINE_FEATURE_ENV,
  type MarineFeature,
} from "@/lib/marine/flags";

export const runtime = "nodejs";

/**
 * GET /api/marine/status
 *
 * Liveness/flag-state endpoint for the Marine Platform. Used by the frontend
 * nav gating (Phase 4) and by operators to confirm flag configuration.
 * Intentionally touches NO database table and NO auth session, so it answers
 * even when the platform is fully disabled.
 *
 * NOTE: unlike every other marine route this endpoint answers 200 with
 * `{ enabled: false }` instead of 503 — its entire purpose is to report the
 * disabled state.
 */
export async function GET() {
  const enabled = marineEnabled();
  const features = Object.keys(MARINE_FEATURE_ENV).reduce(
    (acc, key) => {
      acc[key as MarineFeature] = marineFeatureEnabled(key as MarineFeature);
      return acc;
    },
    {} as Record<MarineFeature, boolean>
  );

  return NextResponse.json({
    marinePlatform: enabled ? "enabled" : "disabled",
    enabled,
    features,
    featureFlags: MARINE_FEATURE_ENV,
    allowedRoles: ["RESEARCHER", "ADMIN"],
  });
}

/** Convenience helper re-exported for tests: role check mirrors flags.ts. */
export function _roleAllowedForTests(role: string | undefined): boolean {
  return marineRoleAllowed(role);
}
