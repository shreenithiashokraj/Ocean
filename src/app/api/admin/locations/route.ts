import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/admin/locations
 *
 * Combined admin view of:
 *   - all SavedLocation rows across every user (with the owning user
 *     included for the table), newest first, capped at 100.
 *   - all FishingSpot rows (the curated public spot catalog), oldest first.
 *
 * Returns `{ records: { saved: [...], spots: [...] } }`. The client view
 * reads `records.saved` and `records.spots` separately (the api.ts wrapper
 * types it as `unknown` and the view casts to the expected shape).
 *
 * Auth: `requireRole("ADMIN")` → 401 on missing/non-admin session.
 */
export async function GET() {
  const session = await requireRole("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [savedRows, spotRows] = await Promise.all([
    db.savedLocation.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { name: true, email: true } } },
    }),
    db.fishingSpot.findMany({
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const saved = savedRows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    notes: r.notes,
    category: r.category,
    createdAt: r.createdAt.toISOString(),
    user: r.user ? { name: r.user.name, email: r.user.email } : null,
  }));

  const spots = spotRows.map((s) => ({
    id: s.id,
    name: s.name,
    latitude: s.latitude,
    longitude: s.longitude,
    region: s.region,
    species: s.species,
    depthM: s.depthM,
    bottomType: s.bottomType,
    source: s.source,
    createdAt: s.createdAt.toISOString(),
  }));

  return NextResponse.json({ records: { saved, spots } });
}
