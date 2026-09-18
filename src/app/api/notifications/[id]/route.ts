import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * DELETE /api/notifications/[id]
 * Deletes a notification owned by the current user. 404 if not owned.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const notif = await db.notification.findUnique({ where: { id } });
  if (!notif || notif.userId !== session.sub) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.notification.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
