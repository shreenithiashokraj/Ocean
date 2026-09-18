import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fetchWeatherMarine, logApiCall, reverseGeocode } from "@/lib/weather";
import type {
  AlertSeverity,
  AlertType,
  SeaConditionData,
} from "@/lib/types";

export const runtime = "nodejs";

// Chennai Fishing Harbour — default reference coordinate.
const DEFAULT_LAT = 13.0827;
const DEFAULT_LNG = 80.2707;

// metric key (AlertThreshold.metric) → field on SeaConditionData
const METRIC_TO_FIELD: Record<string, keyof SeaConditionData> = {
  windSpeedKmh: "windSpeed",
  windGustsKmh: "windGusts",
  waveHeightM: "waveHeight",
  precipitationMm: "precipitation",
  visibilityM: "visibility",
  pressureHpa: "pressure",
};

// metric key → alert type
const METRIC_TO_TYPE: Record<string, AlertType> = {
  windSpeedKmh: "WIND",
  windGustsKmh: "WIND",
  waveHeightM: "WAVE",
  precipitationMm: "RAIN",
  visibilityM: "VISIBILITY",
  pressureHpa: "STORM",
};

const METRIC_LABEL: Record<string, string> = {
  windSpeedKmh: "Wind speed",
  windGustsKmh: "Wind gusts",
  waveHeightM: "Wave height",
  precipitationMm: "Precipitation",
  visibilityM: "Visibility",
  pressureHpa: "Atmospheric pressure",
};

interface Threshold {
  metric: string;
  caution: number;
  high: number;
  critical: number;
  unit: string;
}

/**
 * Determine severity for a metric reading.
 *
 * Per the alert engine spec:
 *   - pressureHpa: LOWER value = worse (stormy). Inverse comparison:
 *       value <= critical → CRITICAL, <= high → HIGH, <= caution → MODERATE.
 *   - All others: HIGHER value = worse:
 *       value >= critical → CRITICAL, >= high → HIGH, >= caution → MODERATE.
 *
 * IMPLEMENTATION NOTE — visibility:
 *   The spec lumps visibility in with "higher=worse", but the seeded
 *   thresholds (caution=5000, high=2000, critical=1000) only make sense under
 *   "lower=worse" semantics — i.e. visibility below 1000m is critical, below
 *   2000m is high, below 5000m is moderate, and above 5000m is fine. Following
 *   the spec literally would flag a clear-weather reading of 10000m as
 *   CRITICAL, which is obviously wrong and would erode user trust in the
 *   system. We therefore treat visibility as inverse (lower=worse), matching
 *   both the threshold structure and real-world meaning. This is a deliberate,
 *   documented deviation from the literal spec text.
 */
function severityFor(
  metric: string,
  value: number,
  t: Threshold,
): AlertSeverity | null {
  if (metric === "pressureHpa" || metric === "visibilityM") {
    // lower = worse
    if (value <= t.critical) return "CRITICAL";
    if (value <= t.high) return "HIGH";
    if (value <= t.caution) return "MODERATE";
    return null;
  }
  // higher = worse
  if (value >= t.critical) return "CRITICAL";
  if (value >= t.high) return "HIGH";
  if (value >= t.caution) return "MODERATE";
  return null;
}

function formatValue(metric: string, value: number): string {
  if (metric === "waveHeightM" || metric === "precipitationMm") {
    return value.toFixed(1);
  }
  return value.toFixed(0);
}

/**
 * POST /api/alerts/run
 * Body (optional): { lat?: number, lng?: number }
 * Query (optional): ?lat=…&lng=…  (used only if body absent)
 *
 * Triggers the alert engine:
 *   1. Auth (any role; ADMIN → broadcast userId=null, others → self).
 *   2. Resolve coordinates (body > query > Chennai default).
 *   3. fetchWeatherMarine() for current conditions.
 *   4. Load all AlertThreshold rows.
 *   5. For each metric with a non-null reading, evaluate severity.
 *   6. De-dupe against existing UNREAD alert (same type/severity/userId,
 *      created in the last 6h). Skip if duplicate.
 *   7. Persist WeatherAlert + Notification.
 *   8. Return { created, checked } and log via logApiCall().
 */
export async function POST(req: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Coordinates ───────────────────────────────────────────
  let lat = DEFAULT_LAT;
  let lng = DEFAULT_LNG;

  // Try JSON body first
  try {
    const body = await req.json();
    if (body && typeof body === "object") {
      const b = body as { lat?: unknown; lng?: unknown };
      if (typeof b.lat === "number" && Number.isFinite(b.lat)) lat = b.lat;
      if (typeof b.lng === "number" && Number.isFinite(b.lng)) lng = b.lng;
    }
  } catch {
    // no body or invalid JSON — fall back to query params
    try {
      const url = new URL(req.url);
      const qlat = Number(url.searchParams.get("lat"));
      const qlng = Number(url.searchParams.get("lng"));
      if (Number.isFinite(qlat)) lat = qlat;
      if (Number.isFinite(qlng)) lng = qlng;
    } catch {
      /* ignore */
    }
  }

  // Clamp to valid ranges
  lat = Math.max(-90, Math.min(90, lat));
  lng = Math.max(-180, Math.min(180, lng));

  const startedAt = Date.now();
  let created = 0;
  let checked = 0;

  try {
    // ── Current conditions ─────────────────────────────────
    const { data, isDemo } = await fetchWeatherMarine(lat, lng);

    // ── Thresholds ────────────────────────────────────────
    const thresholds = await db.alertThreshold.findMany();
    if (thresholds.length === 0) {
      return NextResponse.json({ created: 0, checked: 0 });
    }

    // ADMIN-triggered runs produce broadcast alerts (userId=null);
    // everyone else produces alerts scoped to their own account.
    const targetUserId = session.role === "ADMIN" ? null : session.sub;

    const locationLabel = await reverseGeocode(lat, lng);
    const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000);

    for (const t of thresholds) {
      const field = METRIC_TO_FIELD[t.metric];
      if (!field) continue;

      const raw = data[field];
      if (raw == null || typeof raw !== "number" || !Number.isFinite(raw)) {
        continue;
      }
      checked++;

      const severity = severityFor(t.metric, raw, t);
      if (!severity) continue;

      const type = METRIC_TO_TYPE[t.metric] ?? ("SEA_STATE" as AlertType);
      const label = METRIC_LABEL[t.metric] ?? t.metric;
      const valStr = formatValue(t.metric, raw);
      const title = `${severity} ${label} alert`;
      const description =
        `${label} is currently ${valStr} ${t.unit}, which crosses the ${severity.toLowerCase()} ` +
        `threshold (caution ${t.caution}, high ${t.high}, critical ${t.critical} ${t.unit}).` +
        (isDemo ? " (Demo data — offline mode.)" : "");

      // ── De-dupe: skip if an unread alert of same type/severity/userId
      // exists from the last 6 hours.
      const existing = await db.weatherAlert.findFirst({
        where: {
          type,
          severity,
          isRead: false,
          userId: targetUserId,
          createdAt: { gte: sixHoursAgo },
        },
      });
      if (existing) continue;

      const now = new Date();
      const endTime = new Date(now.getTime() + 6 * 3600 * 1000);

      const alert = await db.weatherAlert.create({
        data: {
          userId: targetUserId,
          title,
          type,
          severity,
          description,
          location: locationLabel,
          latitude: lat,
          longitude: lng,
          startTime: now,
          endTime,
          source: "Fisherman Module Alert Engine",
        },
      });

      created++;

      // ── Create notification(s) ────────────────────────────
      const notifType =
        severity === "CRITICAL" || severity === "HIGH" ? "alert" : "warning";
      if (targetUserId) {
        await db.notification
          .create({
            data: {
              userId: targetUserId,
              title: alert.title,
              message: alert.description,
              type: notifType,
            },
          })
          .catch(() => {
            /* notifications are best-effort */
          });
      } else {
        // Broadcast: notify every active user
        const users = await db.user.findMany({
          where: { isActive: true },
          select: { id: true },
        });
        for (const u of users) {
          await db.notification
            .create({
              data: {
                userId: u.id,
                title: alert.title,
                message: alert.description,
                type: notifType,
              },
            })
            .catch(() => {
              /* best-effort */
            });
        }
      }
    }

    return NextResponse.json({ created, checked });
  } catch (err) {
    await logApiCall({
      userId: session.sub,
      service: "alert-engine",
      endpoint: "/api/alerts/run",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
      message: `error: ${err instanceof Error ? err.message : String(err)}`,
    }).catch(() => {});
    return NextResponse.json(
      { error: "Alert engine failed to complete" },
      { status: 500 },
    );
  } finally {
    await logApiCall({
      userId: session.sub,
      service: "alert-engine",
      endpoint: "/api/alerts/run",
      method: "POST",
      status: 200,
      durationMs: Date.now() - startedAt,
      message: `created=${created}`,
    }).catch(() => {});
  }
}
