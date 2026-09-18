import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  fetchWeatherMarine,
  reverseGeocode,
  logApiCall,
} from "@/lib/weather";

/**
 * GET /api/researcher/sea-conditions/live?lat=<number>&lng=<number>
 *
 * Read-only live sea-condition snapshot for a researcher-chosen coordinate.
 * Uses `fetchWeatherMarine` (Open-Meteo) + `reverseGeocode` for the label.
 * Returns the same shape as `/api/sea-conditions`
 *   `{ data, isDemo, source, recordedAt, label }`
 * so the researcher view can reuse the existing compact card pattern.
 *
 * CRITICAL: this route does NOT persist a SeaCondition row — the researcher
 * is doing a read-only environmental lookup, not generating a fisherman-owned
 * environmental record. Sea-condition rows still get persisted by the
 * fisherman `/api/sea-conditions` route when fishermen fetch their own
 * conditions; the researcher simply queries the live API + the stored rows.
 *
 * Guarded: RESEARCHER + ADMIN only. `runtime = "nodejs"`.
 */
export const runtime = "nodejs";

// Chennai, Bay of Bengal — the project's documented default fishing hub.
const DEFAULT_LAT = 13.0827;
const DEFAULT_LNG = 80.2707;

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await requireRole("RESEARCHER", "ADMIN");
  if (!session) {
    return NextResponse.json(
      { error: "Forbidden — researcher role required." },
      { status: 403 }
    );
  }

  // ── Parse + validate query ──────────────────────────────────────────
  const url = new URL(req.url);
  const latParam = url.searchParams.get("lat");
  const lngParam = url.searchParams.get("lng");

  let lat = latParam != null ? Number(latParam) : Number.NaN;
  let lng = lngParam != null ? Number(lngParam) : Number.NaN;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    lat = DEFAULT_LAT;
    lng = DEFAULT_LNG;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json(
      {
        error:
          "Invalid coordinates. Latitude must be within [-90, 90] and longitude within [-180, 180].",
      },
      { status: 400 }
    );
  }

  // Round to 4 dp — matches Open-Meteo precision.
  lat = Math.round(lat * 10000) / 10000;
  lng = Math.round(lng * 10000) / 10000;

  try {
    const [result, label] = await Promise.all([
      fetchWeatherMarine(lat, lng),
      reverseGeocode(lat, lng),
    ]);
    const { data, isDemo, source, recordedAt, error } = result;

    await logApiCall({
      userId: session.sub,
      service: "researcher",
      endpoint: "/api/researcher/sea-conditions/live",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
      message: isDemo
        ? `offline-fallback${error ? `: ${error}` : ""}`
        : "ok",
    });

    const res = NextResponse.json({
      data,
      isDemo,
      source,
      recordedAt,
      label,
    });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    await logApiCall({
      userId: session.sub,
      service: "researcher",
      endpoint: "/api/researcher/sea-conditions/live",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
      message: err instanceof Error ? err.message : "error",
    });
    return NextResponse.json(
      { error: "Failed to fetch live sea conditions." },
      { status: 500 }
    );
  }
}
