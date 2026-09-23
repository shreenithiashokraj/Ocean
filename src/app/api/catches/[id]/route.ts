import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { serializeCatchRecord, validateCatchInput } from "@/lib/catches";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

async function findOwned(id: string, userId: string) {
  const row = await db.catchRecord.findUnique({ where: { id } });
  // Backend ownership check — never reveal other users' records.
  if (!row || row.userId !== userId) return null;
  return row;
}

/** PUT /api/catches/:id — update a catch record owned by the user. */
export async function PUT(req: Request, { params }: Params) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const existing = await findOwned(id, session.sub);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { data, error } = validateCatchInput(body);
  if (!data) {
    return NextResponse.json({ error: error ?? "Invalid catch data" }, { status: 422 });
  }

  const updated = await db.catchRecord.update({ where: { id }, data });
  return NextResponse.json({ catch: serializeCatchRecord(updated) });
}

/** DELETE /api/catches/:id — delete a catch record owned by the user. */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const existing = await findOwned(id, session.sub);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.catchRecord.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
