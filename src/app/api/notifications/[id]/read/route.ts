import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/notifications/:id/read
 *
 * Marks a notification as read. Strict ownership: notification.userId must
 * equal the current session. Returns 404 if not found or not owned.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing notification id" }, { status: 400 });
  }

  const notif = await db.notification.findUnique({ where: { id } });
  if (!notif || notif.userId !== session.sub) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }

  if (!notif.isRead) {
    await db.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ ok: true });
}
