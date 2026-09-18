import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/notifications/read-all
 * Marks every unread notification for the current user as read.
 */
export async function POST() {
  const session = await requireUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await db.notification.updateMany({
    where: { userId: session.sub, isRead: false },
    data: { isRead: true },
  });
  return NextResponse.json({ ok: true, updated: res.count });
}
