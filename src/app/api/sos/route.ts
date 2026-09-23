import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { serializeSosEvent } from "@/lib/sos";

export const runtime = "nodejs";

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** GET /api/sos — list current user's SOS/emergency events, newest first. */
export async function GET() {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.sosAlert.findMany({
    where: { userId: session.sub },
    include: { user: { select: { name: true, email: true, profile: { select: { phone: true } } } } },
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  return NextResponse.json({ events: rows.map(serializeSosEvent) });
}

/** POST /api/sos — record a new emergency event for the current user.
 *
 * DEMO SAFETY: this writes a distress record to the project's own database and
 * raises an in-app notification. It does NOT dispatch to a real coast guard or
 * any external emergency service — the UI states this explicitly.
 */
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

  const lat = numOrNull(body.latitude);
  const lng = numOrNull(body.longitude);
  if (
    (lat !== null && (lat < -90 || lat > 90)) ||
    (lng !== null && (lng < -180 || lng > 180))
  ) {
    return NextResponse.json({ error: "Coordinates are out of range" }, { status: 422 });
  }
  const gpsAvailable = body.gpsAvailable === true && lat !== null && lng !== null;

  const accuracyM = numOrNull(body.accuracyM);
  const locationLabel =
    typeof body.locationLabel === "string" && body.locationLabel.trim()
      ? body.locationLabel.trim().slice(0, 200)
      : null;
  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim().slice(0, 1000)
      : null;

  const created = await db.sosAlert.create({
    data: {
      userId: session.sub,
      latitude: gpsAvailable ? lat : null,
      longitude: gpsAvailable ? lng : null,
      gpsAvailable,
      accuracyM:
        accuracyM !== null && accuracyM >= 0 && accuracyM <= 1_000_000 ? accuracyM : null,
      locationLabel,
      message,
      status: "ACTIVE",
    },
    include: {
      user: {
        select: { name: true, email: true, profile: { select: { phone: true } } },
      },
    },
  });

  // Raise an in-app notification (existing system) so the event also shows up
  // in the Notifications module. Best-effort — the SOS record is authoritative.
  try {
    await db.notification.create({
      data: {
        userId: session.sub,
        title: "SOS emergency alert recorded",
        message: gpsAvailable
          ? `Distress event logged at ${lat?.toFixed(5)}, ${lng?.toFixed(5)}. Demo record — no external dispatch.`
          : "Distress event logged with location unavailable. Demo record — no external dispatch.",
        type: "alert",
        severity: "CRITICAL",
        category: "alert",
      },
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({ event: serializeSosEvent(created) }, { status: 201 });
}
