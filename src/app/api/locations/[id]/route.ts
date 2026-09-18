import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

/** DELETE /api/locations/:id — delete a saved location owned by the user. */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const row = await db.savedLocation.findUnique({ where: { id } });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Backend ownership check: only the owner can delete their saved location.
  if (row.userId !== session.sub) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.savedLocation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
