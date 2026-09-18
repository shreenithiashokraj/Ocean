import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logApiCall } from "@/lib/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ─── DELETE /api/fish-analysis/:id — delete one of the user's own analyses ─ */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  const session = await requireUser();
  if (!session) {
    await logApiCall({
      userId: null,
      service: "fish-analysis",
      endpoint: "/api/fish-analysis/:id",
      method: "DELETE",
      status: 401,
      message: "unauthenticated",
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing analysis id" }, { status: 422 });
  }

  let row: { userId: string } | null;
  try {
    row = await db.fishAnalysis.findUnique({
      where: { id },
      select: { userId: true },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logApiCall({
      userId: session.sub,
      service: "fish-analysis",
      endpoint: `/api/fish-analysis/${id}`,
      method: "DELETE",
      status: 500,
      durationMs: Date.now() - startedAt,
      message: `lookup failed: ${msg}`,
    });
    return NextResponse.json({ error: "Failed to find analysis." }, { status: 500 });
  }

  if (!row) {
    await logApiCall({
      userId: session.sub,
      service: "fish-analysis",
      endpoint: `/api/fish-analysis/${id}`,
      method: "DELETE",
      status: 404,
      message: "not found",
    });
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  // Fisherman owns their own analyses — enforced server-side.
  if (row.userId !== session.sub) {
    await logApiCall({
      userId: session.sub,
      service: "fish-analysis",
      endpoint: `/api/fish-analysis/${id}`,
      method: "DELETE",
      status: 403,
      message: "ownership mismatch",
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await db.fishAnalysis.delete({ where: { id } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logApiCall({
      userId: session.sub,
      service: "fish-analysis",
      endpoint: `/api/fish-analysis/${id}`,
      method: "DELETE",
      status: 500,
      durationMs: Date.now() - startedAt,
      message: `delete failed: ${msg}`,
    });
    return NextResponse.json({ error: "Failed to delete analysis." }, { status: 500 });
  }

  await logApiCall({
    userId: session.sub,
    service: "fish-analysis",
    endpoint: `/api/fish-analysis/${id}`,
    method: "DELETE",
    status: 200,
    durationMs: Date.now() - startedAt,
    message: "deleted",
  });

  return NextResponse.json({ ok: true });
}
