import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

const VALID_ROLES = new Set(["ADMIN", "RESEARCHER", "FISHERMAN"]);

/**
 * PATCH /api/admin/users/:id
 *
 * Body: `{ role, isActive }` — both required. Role must be one of
 * ADMIN / RESEARCHER / FISHERMAN; isActive must be a boolean.
 *
 * Self-deactivation guard: if the target id === the admin's own session.sub
 * and `isActive` is `false`, the route rejects with 400 (you cannot lock
 * yourself out). Promoting/demoting your own role is permitted (an admin
 * may step down to RESEARCHER, though doing so will immediately lock them
 * out of further admin routes — they can re-elevate from the DB if needed).
 *
 * Auth: `requireRole("ADMIN")` → 401 on missing session.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  let body: { role?: unknown; isActive?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const role =
    typeof body.role === "string" ? body.role.toUpperCase().trim() : "";
  const isActive = typeof body.isActive === "boolean" ? body.isActive : null;

  if (!VALID_ROLES.has(role)) {
    return NextResponse.json(
      { error: "Role must be ADMIN, RESEARCHER or FISHERMAN" },
      { status: 422 }
    );
  }
  if (isActive === null) {
    return NextResponse.json(
      { error: "isActive must be a boolean" },
      { status: 422 }
    );
  }

  // Prevent self-deactivation so an admin cannot lock themselves out.
  if (id === session.sub && isActive === false) {
    return NextResponse.json(
      { error: "You cannot deactivate yourself" },
      { status: 400 }
    );
  }

  // Ensure the target user exists (404 if not).
  const existing = await db.user.findUnique({
    where: { id },
    select: { id: true, role: true, isActive: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // ── Last-active-admin protection ───────────────────────────────────────
  // If the target is currently an ACTIVE ADMIN and the change would remove
  // them from the active-admin set (deactivate OR demote to non-ADMIN),
  // ensure at least one other active admin remains. This prevents an admin
  // from accidentally removing the last administrative access.
  const removingAdmin =
    existing.role === "ADMIN" && existing.isActive && (role !== "ADMIN" || isActive === false);
  if (removingAdmin) {
    const activeAdminCount = await db.user.count({
      where: { role: "ADMIN", isActive: true },
    });
    if (activeAdminCount <= 1) {
      return NextResponse.json(
        {
          error:
            "Cannot remove the last active administrator. Promote another user to ADMIN first.",
        },
        { status: 400 }
      );
    }
  }

  await db.user.update({
    where: { id },
    data: { role, isActive },
  });

  return NextResponse.json({ ok: true });
}
