/**
 * Marine Platform — shared helpers for /api/marine/* route handlers.
 *
 * Every marine route starts with `marineGuard()` which enforces, in order:
 *   1. master flag (MARINE_PLATFORM_ENABLED)   → 503 when off
 *   2. sub-feature flag (e.g. MARINE_ENABLE_BIODIVERSITY) → 503 when off
 *   3. session + role (RESEARCHER/ADMIN only)  → 401/403
 * This keeps flag gating + RBAC consistent across all marine endpoints and
 * is the ONLY place those checks live.
 */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  marineEnabled,
  marineFeatureEnabled,
  disabledResponse,
  type MarineFeature,
} from "@/lib/marine/flags";
import { auditLog } from "@/lib/marine/governance/audit";

export type MarineGuardResult =
  | { ok: false; response: NextResponse }
  | { ok: true; session: { userId: string; role: string; email: string; name: string } };

/**
 * Gate a marine route. Returns either the session context (ok) or a ready
 * NextResponse to return immediately (flag off / unauthorized).
 */
export async function marineGuard(
  feature: MarineFeature,
  options: { roles?: string[] } = {}
): Promise<MarineGuardResult> {
  if (!marineEnabled() || !marineFeatureEnabled(feature)) {
    const d = disabledResponse();
    return { ok: false, response: NextResponse.json(d.body, { status: d.status }) };
  }
  const session = await requireRole(...((options.roles ?? ["RESEARCHER", "ADMIN"]) as never[]));
  if (!session) {
    // Distinguish unauthenticated vs forbidden the way existing routes do.
    const { getSession } = await import("@/lib/auth");
    const anySession = await getSession();
    return {
      ok: false,
      response: NextResponse.json(
        { error: anySession ? "Forbidden — researcher/admin role required." : "Unauthorized" },
        { status: anySession ? 403 : 401 }
      ),
    };
  }
  return {
    ok: true,
    session: {
      userId: session.sub,
      role: session.role,
      email: session.email,
      name: session.name,
    },
  };
}

/** Best-effort audit write for a handled marine request. */
export function auditRequest(input: {
  userId?: string | null;
  action: "read" | "write" | "delete" | "predict" | "export";
  resource: string;
  resourceId?: string;
  endpoint: string;
  status: number;
}): void {
  void auditLog({
    userId: input.userId,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId,
    detail: { endpoint: input.endpoint, status: input.status },
  });
}
