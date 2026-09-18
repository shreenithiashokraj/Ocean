import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/admin/fish-analyses
 *
 * Returns the most recent 100 FishAnalysis rows newest first, including the
 * acting user. `imageDataUrl` is intentionally OMITTED from the list payload
 * to keep the response small; instead each row carries a boolean `hasImage`
 * so the UI can show a thumbnail indicator without transferring every
 * stored image on page load.
 *
 * Auth: `requireRole("ADMIN")` → 401 on missing/non-admin session.
 */
export async function GET() {
  const session = await requireRole("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.fishAnalysis.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, email: true } } },
  });

  const records = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    species: r.species,
    confidence: r.confidence,
    sizeRange: r.sizeRange,
    weightRange: r.weightRange,
    notes: r.notes,
    qualityWarning: r.qualityWarning,
    pricePerKg: r.pricePerKg,
    currency: r.currency,
    market: r.market,
    createdAt: r.createdAt.toISOString(),
    hasImage: !!r.imageDataUrl,
    user: r.user
      ? { name: r.user.name, email: r.user.email }
      : null,
  }));

  return NextResponse.json({ records });
}
