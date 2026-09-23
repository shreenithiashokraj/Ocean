import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { serializeCatchRecord, validateCatchInput } from "@/lib/catches";

export const runtime = "nodejs";

/** GET /api/catches — list current user's catch records, newest first. */
export async function GET(req: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const speciesQ = url.searchParams.get("species")?.trim().toLowerCase() || "";
  const locationQ = url.searchParams.get("location")?.trim().toLowerCase() || "";

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw)) {
    dateFilter.gte = new Date(`${fromRaw}T00:00:00.000Z`);
  }
  if (toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
    dateFilter.lte = new Date(`${toRaw}T00:00:00.000Z`);
  }

  const rows = await db.catchRecord.findMany({
    where: {
      userId: session.sub,
      ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  const catches = rows
    .map(serializeCatchRecord)
    .filter(
      (c) =>
        (!speciesQ || c.species.toLowerCase().includes(speciesQ)) &&
        (!locationQ || c.location.toLowerCase().includes(locationQ))
    );

  return NextResponse.json({ catches });
}

/** POST /api/catches — save a new catch record for the current user. */
export async function POST(req: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const created = await db.catchRecord.create({
    data: { userId: session.sub, ...data },
  });

  return NextResponse.json(
    { catch: serializeCatchRecord(created) },
    { status: 201 }
  );
}
