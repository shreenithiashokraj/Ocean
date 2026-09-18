import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/notifications
 * GET /api/notifications?unread=1
 *
 * Returns notifications for the current user, newest first, limit 100.
 * Notifications are strictly per-user (userId is non-nullable). Phase 2 adds
 * severity, category and alertId so the notification center can group/filter
 * and link to the related alert.
 */
export async function GET(req: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const category = url.searchParams.get("category");

  const clauses: Record<string, unknown>[] = [{ userId: session.sub }];
  if (unreadOnly) clauses.push({ isRead: false });
  if (category) clauses.push({ category });

  const rows = await db.notification.findMany({
    where: { AND: clauses },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const notifications = rows.map((r) => ({
    id: r.id,
    title: r.title,
    message: r.message,
    type: r.type,
    severity: r.severity,
    category: r.category,
    alertId: r.alertId,
    isRead: r.isRead,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json({ notifications });
}
