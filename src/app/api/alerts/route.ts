import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { WeatherAlert } from "@/lib/types";

export const runtime = "nodejs";

/**
 * GET /api/alerts
 * GET /api/alerts?unread=1
 *
 * Returns alerts visible to the current user: their own (userId = session.sub)
 * + broadcast alerts (userId = null). Newest first, limit 100.
 *
 * Auth: any authenticated user (requireUser). Role-based scoping is handled
 * here — a fisherman sees their own + broadcast alerts. (Admin variants live
 * under /api/admin/* and use requireRole("ADMIN").)
 */
export async function GET(req: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "1";

  // Admins can see ALL alerts (every user + broadcast). Fishermen/researchers
  // see only their own + broadcast (role-based scoping enforced here, backend).
  const visibleToMe =
    session.role === "ADMIN" ? {} : { OR: [{ userId: session.sub }, { userId: null }] };

  const where = unreadOnly ? { AND: [{ isRead: false }, visibleToMe] } : visibleToMe;

  const rows = await db.weatherAlert.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const alerts: WeatherAlert[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type as WeatherAlert["type"],
    severity: r.severity as WeatherAlert["severity"],
    description: r.description,
    location: r.location,
    latitude: r.latitude,
    longitude: r.longitude,
    startTime: r.startTime.toISOString(),
    endTime: r.endTime ? r.endTime.toISOString() : null,
    source: r.source,
    isRead: r.isRead,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json({ alerts });
}
