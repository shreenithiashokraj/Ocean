import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/admin/api-logs
 *
 * Returns the most recent 100 ApiLog rows newest first, with the acting
 * user's email included (null when the call was system/auth-less).
 *
 * Auth: `requireRole("ADMIN")` → 401 on missing/non-admin session.
 */
export async function GET() {
  const session = await requireRole("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.apiLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true, name: true } } },
  });

  const logs = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userEmail: r.user?.email ?? null,
    userName: r.user?.name ?? null,
    service: r.service,
    endpoint: r.endpoint,
    method: r.method,
    status: r.status,
    durationMs: r.durationMs,
    message: r.message,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json({ logs });
}
