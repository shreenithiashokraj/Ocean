import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { serializeAlert, touchExpiredAlerts } from "@/lib/alerts";
import type { WeatherAlert } from "@/lib/types";

export const runtime = "nodejs";

/**
 * GET /api/alerts
 * GET /api/alerts?unread=1
 *
 * Returns alerts visible to the current user: their own (userId = session.sub)
 * + broadcast alerts (userId = null). Admins see ALL alerts. Newest first,
 * limit 100. Auto-expires ACTIVE alerts whose endTime has passed before
 * returning, so the lifecycle reflects reality.
 *
 * Auth: any authenticated user (requireUser). Role-based scoping enforced here.
 */
export async function GET(req: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Phase 2: auto-expire stale ACTIVE alerts before listing.
  await touchExpiredAlerts();

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const statusFilter = url.searchParams.get("status"); // ACTIVE|ACKNOWLEDGED|EXPIRED|RESOLVED
  const severityFilter = url.searchParams.get("severity");

  // Admins see ALL alerts; fishermen/researchers see own + broadcast.
  const visibleToMe =
    session.role === "ADMIN" ? {} : { OR: [{ userId: session.sub }, { userId: null }] };

  // build where with optional filters
  const clauses: Record<string, unknown>[] = [];
  if (unreadOnly) clauses.push({ isRead: false });
  if (statusFilter) clauses.push({ status: statusFilter });
  if (severityFilter) clauses.push({ severity: severityFilter });
  clauses.push(visibleToMe);

  const where = clauses.length > 1 ? { AND: clauses } : clauses[0] ?? {};

  const rows = await db.weatherAlert.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const alerts: WeatherAlert[] = rows.map(serializeAlert);

  return NextResponse.json({ alerts });
}
