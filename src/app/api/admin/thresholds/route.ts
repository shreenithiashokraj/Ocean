import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

/** Convert a value to a finite number; returns null when invalid. */
function toFinite(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/admin/thresholds
 * Returns all AlertThreshold rows ordered by metric.
 *
 * POST /api/admin/thresholds
 * Body: `{ metric, caution, high, critical, unit }` — upserts a threshold by
 * its unique metric name. All four numeric fields must be finite numbers;
 * unit is a free-text string (≤20 chars). These thresholds drive the alert
 * engine in `/api/alerts/run` (see Task 4).
 *
 * Auth: `requireRole("ADMIN")` → 401 on missing/non-admin session.
 */
export async function GET() {
  const session = await requireRole("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.alertThreshold.findMany({
    orderBy: { metric: "asc" },
  });

  const thresholds = rows.map((r) => ({
    id: r.id,
    metric: r.metric,
    caution: r.caution,
    high: r.high,
    critical: r.critical,
    unit: r.unit,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return NextResponse.json({ thresholds });
}

export async function POST(req: Request) {
  const session = await requireRole("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    metric?: unknown;
    caution?: unknown;
    high?: unknown;
    critical?: unknown;
    unit?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const metric = typeof body.metric === "string" ? body.metric.trim() : "";
  const caution = toFinite(body.caution);
  const high = toFinite(body.high);
  const critical = toFinite(body.critical);
  const unit =
    typeof body.unit === "string" ? body.unit.trim().slice(0, 20) : "";

  if (metric.length < 1) {
    return NextResponse.json(
      { error: "Metric name is required" },
      { status: 422 }
    );
  }
  if (caution === null || high === null || critical === null) {
    return NextResponse.json(
      { error: "caution / high / critical must be finite numbers" },
      { status: 422 }
    );
  }
  if (unit.length < 1) {
    return NextResponse.json(
      { error: "Unit is required" },
      { status: 422 }
    );
  }

  await db.alertThreshold.upsert({
    where: { metric },
    update: { caution, high, critical, unit },
    create: { metric, caution, high, critical, unit },
  });

  return NextResponse.json({ ok: true });
}
