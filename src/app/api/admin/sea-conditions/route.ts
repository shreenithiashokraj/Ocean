import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/admin/sea-conditions
 *
 * Returns the most recent 100 SeaCondition rows newest first, including the
 * acting user's name/email. `payload` (the raw JSON string) IS returned so
 * the admin UI can pretty-print it in a row-click dialog.
 *
 * Auth: `requireRole("ADMIN")` → 401 on missing/non-admin session.
 */
export async function GET() {
  const session = await requireRole("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.seaCondition.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, email: true } } },
  });

  const records = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    latitude: r.latitude,
    longitude: r.longitude,
    locationLabel: r.locationLabel,
    source: r.source,
    isDemo: r.isDemo,
    recordedAt: r.recordedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    payload: r.payload,
    user: r.user
      ? { name: r.user.name, email: r.user.email }
      : null,
  }));

  return NextResponse.json({ records });
}
