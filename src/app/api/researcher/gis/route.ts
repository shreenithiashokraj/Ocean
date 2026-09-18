import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/researcher/gis
 * Returns aggregate geographic observations for the researcher map view.
 * NO fisherman PII — only environmental sea-condition coordinates (stripped of
 * userId), public fishing spots, and weather-alert coordinates. Each point is
 * labelled by dataset so the map can colour/filter by source.
 */
export async function GET(req: Request) {
  const session = await requireRole("RESEARCHER", "ADMIN");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const sourcesParam = url.searchParams.get("sources"); // comma-separated
  const sources = sourcesParam
    ? sourcesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : ["sea-conditions", "fishing-spots", "alerts"];

  const points: {
    lat: number;
    lng: number;
    dataset: string;
    label: string;
    detail?: Record<string, unknown>;
  }[] = [];

  if (sources.includes("sea-conditions")) {
    const rows = await db.seaCondition.findMany({
      where: { latitude: { gte: -90 }, longitude: { gte: -180 } },
      select: { latitude: true, longitude: true, locationLabel: true, source: true, isDemo: true, recordedAt: true },
      take: 2000,
    });
    for (const r of rows) {
      points.push({
        lat: r.latitude,
        lng: r.longitude,
        dataset: "sea-conditions",
        label: r.locationLabel || `Sea observation`,
        detail: { source: r.source, isDemo: r.isDemo, recordedAt: r.recordedAt.toISOString() },
      });
    }
  }

  if (sources.includes("fishing-spots")) {
    const rows = await db.fishingSpot.findMany({
      select: { latitude: true, longitude: true, name: true, region: true, bottomType: true },
    });
    for (const r of rows) {
      points.push({
        lat: r.latitude,
        lng: r.longitude,
        dataset: "fishing-spots",
        label: r.name,
        detail: { region: r.region, bottomType: r.bottomType },
      });
    }
  }

  if (sources.includes("alerts")) {
    const rows = await db.weatherAlert.findMany({
      where: { AND: [{ latitude: { not: null } }, { longitude: { not: null } }] },
      select: { latitude: true, longitude: true, title: true, severity: true, status: true, type: true },
      take: 2000,
    });
    for (const r of rows) {
      points.push({
        lat: r.latitude!,
        lng: r.longitude!,
        dataset: "alerts",
        label: r.title,
        detail: { severity: r.severity, status: r.status, type: r.type },
      });
    }
  }

  return NextResponse.json({ points, total: points.length });
}
