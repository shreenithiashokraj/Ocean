import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { logApiCall } from "@/lib/weather";

/**
 * GET /api/researcher/sea-conditions
 *
 * Returns stored SeaCondition rows (newest first, limit 200) for research
 * purposes. Sea conditions are environmental (not personal) data, so
 * researchers may read all rows. The response shape strips `userId` and
 * any other personal/account identifiers — only environmental fields are
 * returned (locationLabel, coords, source, isDemo, recordedAt, payload).
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
    const rows = await db.seaCondition.findMany({
      orderBy: { recordedAt: "desc" },
      take: 200,
      select: {
        id: true,
        latitude: true,
        longitude: true,
        locationLabel: true,
        source: true,
        isDemo: true,
        recordedAt: true,
        createdAt: true,
        payload: true,
      },
    });

    const records = rows.map((r) => ({
      id: r.id,
      latitude: r.latitude,
      longitude: r.longitude,
      locationLabel: r.locationLabel,
      source: r.source,
      isDemo: r.isDemo,
      recordedAt: r.recordedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      payload: r.payload, // JSON string — UI parses on demand in a Dialog
    }));

    await logApiCall({
      userId: session.sub,
      service: "researcher",
      endpoint: "/api/researcher/sea-conditions",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
      message: `records=${records.length}`,
    });

    return NextResponse.json({ records });
  } catch (err) {
    await logApiCall({
      userId: session.sub,
      service: "researcher",
      endpoint: "/api/researcher/sea-conditions",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
      message: err instanceof Error ? err.message : "error",
    });
    return NextResponse.json(
      { error: "Failed to load stored sea conditions." },
      { status: 500 }
    );
  }
}
