import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/notifications
 *
 * Returns notifications for the current user, newest first, limit 100.
 * Notifications are strictly per-user (userId is non-nullable in the schema),
 * so no broadcast scoping is needed here.
 */
export async function GET() {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.notification.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const notifications = rows.map((r) => ({
    id: r.id,
    title: r.title,
    message: r.message,
    type: r.type,
    isRead: r.isRead,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json({ notifications });
}
