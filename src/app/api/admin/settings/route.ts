import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

const VALID_CATEGORIES = new Set(["general", "api", "alert", "branding"]);

/**
 * GET /api/admin/settings
 * Returns every SystemSetting row (id, key, value, category, updatedAt).
 *
 * POST /api/admin/settings
 * Body: `{ key, value, category? }` — upserts a setting by its unique key.
 * `key` must be ≥1 char; `value` is stored as a string (Numbers/booleans must
 * be serialised by the caller). `category` defaults to `"general"` and is
 * coerced into the allowed set if invalid. Secrets are NEVER accepted here
 * — the admin UI is for non-secret settings only (see admin-settings-view).
 *
 * Auth: `requireRole("ADMIN")` → 401 on missing/non-admin session.
 */
export async function GET() {
  const session = await requireRole("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.systemSetting.findMany({
    orderBy: [{ category: "asc" }, { key: "asc" }],
  });

  const settings = rows.map((r) => ({
    id: r.id,
    key: r.key,
    value: r.value,
    category: r.category,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return NextResponse.json({ settings });
}

export async function POST(req: Request) {
  const session = await requireRole("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { key?: unknown; value?: unknown; category?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  const value = body.value === undefined || body.value === null ? "" : String(body.value);
  const categoryRaw =
    typeof body.category === "string" ? body.category.trim().toLowerCase() : "";
  const category =
    categoryRaw && VALID_CATEGORIES.has(categoryRaw) ? categoryRaw : "general";

  if (key.length < 1) {
    return NextResponse.json(
      { error: "Setting key is required" },
      { status: 422 }
    );
  }

  // Reject any key that looks like a secret token to avoid accidental
  // credential storage in the non-secret settings table.
  const lowerKey = key.toLowerCase();
  if (
    lowerKey.includes("apikey") ||
    lowerKey.includes("api_key") ||
    lowerKey.includes("secret") ||
    lowerKey.includes("password") ||
    lowerKey.includes("token")
  ) {
    return NextResponse.json(
      {
        error:
          "Secrets must be configured via server environment variables, not this UI.",
      },
      { status: 422 }
    );
  }

  await db.systemSetting.upsert({
    where: { key },
    update: { value, category },
    create: { key, value, category },
  });

  return NextResponse.json({ ok: true });
}
