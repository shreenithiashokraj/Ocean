import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

/** GET /api/researcher/reports/[id] — fetch a single saved report (owner only). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("RESEARCHER", "ADMIN");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;

  const r = await db.researchReport.findUnique({ where: { id } });
  if (!r || r.userId !== session.sub) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    report: {
      id: r.id,
      title: r.title,
      description: r.description,
      datasetKey: r.datasetKey,
      filtersJson: r.filtersJson,
      summaryJson: r.summaryJson,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    },
  });
}

/** DELETE /api/researcher/reports/[id] — delete a saved report (owner only). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("RESEARCHER", "ADMIN");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;

  const r = await db.researchReport.findUnique({ where: { id } });
  if (!r || r.userId !== session.sub) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.researchReport.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
