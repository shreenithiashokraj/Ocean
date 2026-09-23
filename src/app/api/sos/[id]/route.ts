import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { isValidSosStatus, serializeSosEvent } from "@/lib/sos";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

/** PATCH /api/sos/:id — resolve or cancel an emergency event.
 *
 * Resolution workflow (existing RBAC): only ADMIN may mark RESOLVED — fishermen
 * see their events as read-only history. The owner may mark their own event
 * CANCELLED (e.g. false alarm); ACTIVE → RESOLVED requires an admin/responder.
 */
export async function PATCH(req: Request, { params }: Params) {
  const session = await requireRole("FISHERMAN", "ADMIN", "RESEARCHER");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const row = await db.sosAlert.findUnique({
    where: { id },
    include: {
      user: {
        select: { name: true, email: true, profile: { select: { phone: true } } },
      },
    },
  });
  // Never reveal other fishermen's events (admins may see all).
  if (!row || (row.userId !== session.sub && session.role !== "ADMIN")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const status = body.status;
  if (!isValidSosStatus(status) || status === "ACTIVE") {
    return NextResponse.json(
      { error: "Status must be RESOLVED or CANCELLED" },
      { status: 422 }
    );
  }
  if (status === "RESOLVED" && session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only an admin/responder can mark an event resolved" },
      { status: 403 }
    );
  }
  if (status === "CANCELLED" && row.userId !== session.sub) {
    return NextResponse.json(
      { error: "Only the owner can cancel their event" },
      { status: 403 }
    );
  }

  const updated = await db.sosAlert.update({
    where: { id },
    data: {
      status,
      resolvedAt: status === "RESOLVED" ? new Date() : row.resolvedAt,
      resolvedBy: status === "RESOLVED" ? session.sub : row.resolvedBy,
    },
    include: {
      user: {
        select: { name: true, email: true, profile: { select: { phone: true } } },
      },
    },
  });

  return NextResponse.json({ event: serializeSosEvent(updated) });
}
