import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/alerts/[id]/resolve
 * Marks an alert RESOLVED (lifecycle). Assignee or admin only.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const alert = await db.weatherAlert.findUnique({ where: { id } });
  if (!alert) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = alert.userId === session.sub || alert.userId === null || session.role === "ADMIN";
  if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updated = await db.weatherAlert.update({
    where: { id },
    data: { status: "RESOLVED", isRead: true, resolvedAt: new Date() },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
