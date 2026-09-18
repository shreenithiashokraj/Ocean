import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/admin/users
 *
 * Lists every user (admin only) with their profile phone. Returns
 * `{ users: [...] }`. The active flag, role, email, name and createdAt are
 * surfaced so the admin UI can render the user table + per-row controls.
 *
 * Auth: `requireRole("ADMIN")` — returns 401 when there is no session.
 */
export async function GET() {
  const session = await requireRole("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      profile: { select: { phone: true } },
    },
  });

  const users = rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    phone: u.profile?.phone ?? null,
  }));

  return NextResponse.json({ users });
}
