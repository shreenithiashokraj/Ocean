/**
 * Marine Platform — additive audit-logging service (governance feature F).
 *
 * Writes to the NEW `MarineAuditLog` table only. Existing routes are never
 * wrapped, patched or intercepted: marine routes call `auditLog()` explicitly
 * after their auth guard runs, so this can never alter existing behavior.
 *
 * Logging is best-effort by design (same philosophy as `logApiCall` in
 * src/lib/weather.ts): an audit write failure must never break the request.
 *
 * Note: this is DISTINCT from the existing ApiLog table — ApiLog tracks
 * external-service calls (Open-Meteo, Z.AI, …) for the admin API-monitoring
 * view; MarineAuditLog tracks WHO accessed WHICH marine data resource.
 */
import { db } from "@/lib/db";

export type MarineAuditAction = "read" | "write" | "delete" | "predict" | "export";

export interface MarineAuditInput {
  /** session user id (null = unauthenticated / failed-auth attempt) */
  userId?: string | null;
  action: MarineAuditAction;
  /** namespaced resource, e.g. "marine.record", "marine.search" */
  resource: string;
  resourceId?: string | null;
  /** endpoint + query/param metadata (never store request bodies with PII) */
  detail?: Record<string, unknown>;
}

export async function auditLog(input: MarineAuditInput): Promise<void> {
  try {
    await db.marineAuditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        detailJson: input.detail ? JSON.stringify(input.detail) : null,
      },
    });
  } catch {
    /* audit must never break the request */
  }
}

/** Read recent audit entries (admin-only callers enforce role themselves). */
export async function listAuditEntries(options: {
  limit?: number;
  resource?: string;
  userId?: string;
} = {}) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  return db.marineAuditLog.findMany({
    where: {
      ...(options.resource ? { resource: options.resource } : {}),
      ...(options.userId ? { userId: options.userId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
