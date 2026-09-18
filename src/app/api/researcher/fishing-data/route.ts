import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { logApiCall } from "@/lib/weather";

/**
 * GET /api/researcher/fishing-data
 *
 * Returns AGGREGATE research data — no personally identifiable information.
 * Specifically:
 *   - speciesDistribution: [{species, count, avgConfidence}] grouped over
 *     ALL FishAnalysis rows (species not null).
 *   - confidenceBuckets: [{bucket, count}] (4 buckets).
 *   - totalAnalyses: number.
 *   - recentSeaConditions: last 10 SeaCondition records (environmental only,
 *     no userId).
 *   - alertSummary: [{severity, count}] from WeatherAlert (aggregate, no user).
 *   - fishingSpots: all FishingSpot rows.
 *   - monthlyTrend: [{month, analyses}] over last 6 months.
 *
 * Implementation note: SQLite has limited GROUP BY support in Prisma for
 * computed averages, so we fetch the (small) project's analysis rows and
 * compute aggregations in JS. No individual fisherman identities are ever
 * returned — the response only contains aggregate counts and species names.
 *
 * Guarded: RESEARCHER + ADMIN only. `runtime = "nodejs"`.
 */
export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();
  const session = await requireRole("RESEARCHER", "ADMIN");
  if (!session) {
    return NextResponse.json(
      { error: "Forbidden — researcher role required." },
      { status: 403 }
    );
  }

  try {
    // Fetch all fish analyses (small project — capped implicitly by DB size).
    const analyses = await db.fishAnalysis.findMany({
      select: { species: true, confidence: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const totalAnalyses = analyses.length;

    // ── Species distribution (group by species where not null) ──────────
    const speciesMap = new Map<
      string,
      { count: number; confSum: number; confN: number }
    >();
    for (const a of analyses) {
      if (!a.species) continue;
      const e = speciesMap.get(a.species) ?? { count: 0, confSum: 0, confN: 0 };
      e.count++;
      if (a.confidence != null && Number.isFinite(a.confidence)) {
        e.confSum += a.confidence;
        e.confN++;
      }
      speciesMap.set(a.species, e);
    }
    const speciesDistribution = Array.from(speciesMap.entries())
      .map(([species, e]) => ({
        species,
        count: e.count,
        avgConfidence: e.confN > 0 ? e.confSum / e.confN : null,
      }))
      .sort((a, b) => b.count - a.count);

    // ── Confidence buckets ───────────────────────────────────────────────
    const confidenceBuckets: { bucket: string; count: number }[] = [
      { bucket: "<0.5", count: 0 },
      { bucket: "0.5–0.7", count: 0 },
      { bucket: "0.7–0.85", count: 0 },
      { bucket: ">0.85", count: 0 },
    ];
    for (const a of analyses) {
      if (a.confidence == null || !Number.isFinite(a.confidence)) continue;
      const c = a.confidence;
      if (c < 0.5) confidenceBuckets[0].count++;
      else if (c < 0.7) confidenceBuckets[1].count++;
      else if (c < 0.85) confidenceBuckets[2].count++;
      else confidenceBuckets[3].count++;
    }

    // ── Monthly trend (last 6 months, including the current month) ──────
    const now = new Date();
    const monthlyTrend: { month: string; analyses: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString(undefined, {
        month: "short",
        year: "2-digit",
      });
      const start = d.getTime();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const count = analyses.filter((a) => {
        const t = a.createdAt.getTime();
        return t >= start && t < end;
      }).length;
      monthlyTrend.push({ month: label, analyses: count });
    }

    // ── Recent sea conditions (environmental — no userId) ───────────────
    const recentRows = await db.seaCondition.findMany({
      orderBy: { recordedAt: "desc" },
      take: 10,
      select: {
        id: true,
        latitude: true,
        longitude: true,
        locationLabel: true,
        source: true,
        isDemo: true,
        recordedAt: true,
        payload: true,
      },
    });
    const recentSeaConditions = recentRows.map((r) => ({
      id: r.id,
      latitude: r.latitude,
      longitude: r.longitude,
      locationLabel: r.locationLabel,
      source: r.source,
      isDemo: r.isDemo,
      recordedAt: r.recordedAt.toISOString(),
      payload: r.payload,
    }));

    // ── Alert summary (aggregate — no userId) ───────────────────────────
    const alertRows = await db.weatherAlert.findMany({
      select: { severity: true, isRead: true },
    });
    const alertMap = new Map<string, { count: number; unread: number }>();
    for (const a of alertRows) {
      const sev = a.severity || "UNKNOWN";
      const e = alertMap.get(sev) ?? { count: 0, unread: 0 };
      e.count++;
      if (!a.isRead) e.unread++;
      alertMap.set(sev, e);
    }
    const alertSummary = Array.from(alertMap.entries())
      .map(([severity, e]) => ({
        severity,
        count: e.count,
        unread: e.unread,
      }))
      .sort((a, b) => b.count - a.count);

    // ── Fishing spots (curated, environmental) ───────────────────────────
    const fishingSpotsRows = await db.fishingSpot.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        region: true,
        species: true,
        depthM: true,
        bottomType: true,
        source: true,
      },
    });
    const fishingSpots = fishingSpotsRows.map((s) => ({
      id: s.id,
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      region: s.region,
      species: s.species,
      depthM: s.depthM,
      bottomType: s.bottomType,
      source: s.source,
    }));

    await logApiCall({
      userId: session.sub,
      service: "researcher",
      endpoint: "/api/researcher/fishing-data",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
      message: `analyses=${totalAnalyses} species=${speciesDistribution.length}`,
    });

    return NextResponse.json({
      speciesDistribution,
      confidenceBuckets,
      totalAnalyses,
      recentSeaConditions,
      alertSummary,
      fishingSpots,
      monthlyTrend,
    });
  } catch (err) {
    await logApiCall({
      userId: session.sub,
      service: "researcher",
      endpoint: "/api/researcher/fishing-data",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
      message: err instanceof Error ? err.message : "error",
    });
    return NextResponse.json(
      { error: "Failed to load aggregate fishing data." },
      { status: 500 }
    );
  }
}
