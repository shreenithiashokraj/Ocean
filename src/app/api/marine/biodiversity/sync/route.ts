import { NextResponse } from "next/server";
import { marineGuard, auditRequest } from "@/lib/marine/route-helpers";
import { syncSpeciesObservations, syncOccurrenceSources } from "@/lib/marine/biodiversity/observations";
import { DEFAULT_CELL_SIZE_DEG } from "@/lib/marine/biodiversity/config";

export const runtime = "nodejs";

/**
 * POST /api/marine/biodiversity/sync
 *
 * Materializes MarineSpeciesObservation rows from the existing species-bearing
 * tables (FishingSpot, FishAnalysis, CatchRecord, DatasetRecord). Idempotent —
 * safe to re-run; re-syncing never duplicates rows. Returns honest per-source
 * counters including what was skipped and why. No origin table is modified.
 */
export async function POST() {
  const guard = await marineGuard("biodiversity");
  if (!guard.ok) return guard.response;

  try {
    const [a, b] = await Promise.all([
      syncSpeciesObservations(DEFAULT_CELL_SIZE_DEG),
      syncOccurrenceSources(DEFAULT_CELL_SIZE_DEG),
    ]);
    const sources = { ...a, ...b };
    auditRequest({
      userId: guard.session.userId,
      action: "write",
      resource: "marine.biodiversity.sync",
      endpoint: "/api/marine/biodiversity/sync",
      status: 200,
    });
    return NextResponse.json({
      ok: true,
      sources,
      cellSizeDeg: DEFAULT_CELL_SIZE_DEG,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 }
    );
  }
}
