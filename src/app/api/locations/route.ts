import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

const VALID_CATEGORIES = new Set(["fishing", "harbor", "home", "waypoint"]);

/** GET /api/locations — list current user's saved locations, newest first. */
export async function GET() {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await db.savedLocation.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
  });
  const locations = rows.map((r) => ({
    id: r.id,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    notes: r.notes ?? "",
    category: r.category,
    createdAt: r.createdAt.toISOString(),
  }));
  return NextResponse.json({ locations });
}

/** POST /api/locations — save a new location for the current user. */
export async function POST(req: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    name?: unknown;
    lat?: unknown;
    lng?: unknown;
    notes?: unknown;
    category?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lng = typeof body.lng === "number" ? body.lng : Number(body.lng);
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const categoryRaw =
    typeof body.category === "string" ? body.category.trim().toLowerCase() : "";
  const category =
    categoryRaw && VALID_CATEGORIES.has(categoryRaw) ? categoryRaw : "fishing";

  if (name.length < 2) {
    return NextResponse.json(
      { error: "Name must be at least 2 characters" },
      { status: 422 }
    );
  }
  if (Number.isNaN(lat) || lat < -90 || lat > 90) {
    return NextResponse.json(
      { error: "Latitude must be between -90 and 90" },
      { status: 422 }
    );
  }
  if (Number.isNaN(lng) || lng < -180 || lng > 180) {
    return NextResponse.json(
      { error: "Longitude must be between -180 and 180" },
      { status: 422 }
    );
  }

  const created = await db.savedLocation.create({
    data: {
      userId: session.sub,
      name,
      latitude: lat,
      longitude: lng,
      notes: notes || null,
      category,
    },
  });

  return NextResponse.json(
    {
      location: {
        id: created.id,
        name: created.name,
        latitude: created.latitude,
        longitude: created.longitude,
        notes: created.notes ?? "",
        category: created.category,
        createdAt: created.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
