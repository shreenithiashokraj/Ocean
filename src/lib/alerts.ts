/**
 * Alert lifecycle helpers (backend only).
 *
 * Phase 2 introduces a proper alert lifecycle:
 *   ACTIVE → ACKNOWLEDGED → RESOLVED
 *   ACTIVE ───────────────→ EXPIRED  (auto, when endTime passes)
 *
 * `resolveAlertStatus` computes the *effective* status of a persisted alert,
 * auto-expiring ACTIVE alerts whose endTime is in the past. `touchExpiredAlerts`
 * persists that transition so subsequent reads are cheap and the DB stays the
 * source of truth.
 */
import { db } from "@/lib/db";
import type { AlertStatus, WeatherAlert } from "@/lib/types";

/** Compute the effective status, auto-expiring ACTIVE alerts past endTime. */
export function resolveAlertStatus(input: {
  status: string;
  endTime: Date | null;
}): AlertStatus {
  if (input.status === "RESOLVED") return "RESOLVED";
  if (input.status === "ACKNOWLEDGED") return "ACKNOWLEDGED";
  // ACTIVE (or unknown) — check expiry
  if (input.endTime && input.endTime.getTime() < Date.now()) {
    return "EXPIRED";
  }
  return "ACTIVE";
}

/**
 * Bulk-update all ACTIVE alerts whose endTime has passed → EXPIRED.
 * Call this before listing alerts so the UI reflects reality without per-row
 * writes. Best-effort; never throws.
 */
export async function touchExpiredAlerts(): Promise<number> {
  try {
    const res = await db.weatherAlert.updateMany({
      where: {
        status: "ACTIVE",
        endTime: { lt: new Date() },
      },
      data: { status: "EXPIRED" },
    });
    return res.count;
  } catch {
    return 0;
  }
}

/** Map a raw DB row (with Dates) to the API WeatherAlert shape. */
export function serializeAlert(r: {
  id: string;
  title: string;
  type: string;
  severity: string;
  description: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  startTime: Date;
  endTime: Date | null;
  source: string;
  isRead: boolean;
  status: string;
  metric: string | null;
  actualValue: string | null;
  thresholdValue: string | null;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
}): WeatherAlert {
  const effective = resolveAlertStatus({ status: r.status, endTime: r.endTime });
  return {
    id: r.id,
    title: r.title,
    type: r.type as WeatherAlert["type"],
    severity: r.severity as WeatherAlert["severity"],
    description: r.description,
    location: r.location,
    latitude: r.latitude,
    longitude: r.longitude,
    startTime: r.startTime.toISOString(),
    endTime: r.endTime ? r.endTime.toISOString() : null,
    source: r.source,
    isRead: r.isRead,
    status: effective,
    metric: r.metric,
    actualValue: r.actualValue,
    thresholdValue: r.thresholdValue,
    acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}
