import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/alerts/:id/read
 *
 * Marks an alert as read for the current user. Ownership is enforced:
 *   - alert.userId === session.sub  (own alert), OR
 *   - alert.userId === null         (broadcast alert visible to everyone)
 * Returns 404 if the alert does not exist or is not owned by the user.
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
    return NextResponse.json({ error: "Missing alert id" }, { status: 400 });
  }

  const alert = await db.weatherAlert.findUnique({ where: { id } });
  if (!alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  // Ownership: own alert OR broadcast (null userId). Mismatch → 404 (do not
  // leak existence to non-owners).
  if (alert.userId !== null && alert.userId !== session.sub) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  if (!alert.isRead) {
    await db.weatherAlert.update({
      where: { id },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ ok: true });
}
