import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/alerts/[id]/acknowledge
 * Marks an alert ACKNOWLEDGED (lifecycle). Caller must be the assignee or an
 * admin; broadcast alerts (userId=null) may be acknowledged by anyone. 404 if
 * the alert is not visible to the caller.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const alert = await db.weatherAlert.findUnique({ where: { id } });
  if (!alert) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Ownership: assignee or admin or broadcast
  const isOwner = alert.userId === session.sub || alert.userId === null || session.role === "ADMIN";
  if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updated = await db.weatherAlert.update({
    where: { id },
    data: {
      status: "ACKNOWLEDGED",
      isRead: true,
      acknowledgedAt: new Date(),
      acknowledgedBy: session.sub,
    },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
