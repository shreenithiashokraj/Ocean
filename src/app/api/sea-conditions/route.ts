import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  fetchWeatherMarine,
  reverseGeocode,
  logApiCall,
} from "@/lib/weather";

/**
 * GET /api/sea-conditions?lat=<number>&lng=<number>
 *
 * Returns the latest Open-Meteo weather + marine snapshot for the given
 * coordinate. Persists a SeaCondition row each call (for history / admin
 * views) and logs an ApiLog entry. Falls back to clearly-labeled demo data
 * when the upstream API is unreachable — `isDemo: true` is always honoured
 * and persisted with the row so we never show fake data as live.
 *
 * All authenticated roles may read. Real-time → `Cache-Control: no-store`.
 */
export const runtime = "nodejs";

// Chennai, Bay of Bengal — the project's documented default fishing hub.
const DEFAULT_LAT = 13.0827;
const DEFAULT_LNG = 80.2707;

export async function GET(req: Request) {
  // ── Auth ────────────────────────────────────────────────────────────
  const session = await requireUser();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized — sign in to view sea conditions." },
      { status: 401 }
    );
  }

  // ── Parse + validate query ──────────────────────────────────────────
  const url = new URL(req.url);
  const latParam = url.searchParams.get("lat");
  const lngParam = url.searchParams.get("lng");

  let lat = latParam != null ? Number(latParam) : Number.NaN;
  let lng = lngParam != null ? Number(lngParam) : Number.NaN;

  // Default to Chennai when missing or non-numeric.
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    lat = DEFAULT_LAT;
    lng = DEFAULT_LNG;
  }

  // Range validation (server-side, per task rules).
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json(
      {
        error:
          "Invalid coordinates. Latitude must be within [-90, 90] and longitude within [-180, 180].",
      },
      { status: 400 }
    );
  }

  // Round to 4 dp — matches Open-Meteo precision and avoids float drift.
  lat = Math.round(lat * 10000) / 10000;
  lng = Math.round(lng * 10000) / 10000;

  const startedAt = Date.now();

  // ── Fetch weather+marine and reverse-geocode label concurrently.
  // reverseGeocode never throws — it returns "lat, lng" on failure.
  const [result, label] = await Promise.all([
    fetchWeatherMarine(lat, lng),
    reverseGeocode(lat, lng),
  ]);

  const { data, isDemo, source, recordedAt, error } = result;

  // ── Persist a SeaCondition row (always — mark isDemo). ─────────────
  try {
    await db.seaCondition.create({
      data: {
        userId: session.sub,
        latitude: lat,
        longitude: lng,
        locationLabel: label,
        payload: JSON.stringify(data),
        source,
        isDemo,
        recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
      },
    });
  } catch {
    /* persistence must never block the user-facing response */
  }

  // ── Log the external API call (best-effort). ────────────────────────
  await logApiCall({
    userId: session.sub,
    service: "weather",
    endpoint: "/api/sea-conditions",
    method: "GET",
    status: 200,
    durationMs: Date.now() - startedAt,
    message: isDemo
      ? `offline-fallback${error ? `: ${error}` : ""}`
      : "ok",
  });

  // ── Response ────────────────────────────────────────────────────────
  const res = NextResponse.json({
    data,
    isDemo,
    source,
    recordedAt,
    label,
  });
  // Real-time marine data — never let CDN/proxy cache it.
  res.headers.set("Cache-Control", "no-store");
  return res;
}
