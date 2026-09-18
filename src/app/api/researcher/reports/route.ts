import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { DATASET_REGISTRY } from "@/lib/datasets";

export const runtime = "nodejs";

const VALID_KEYS = new Set(DATASET_REGISTRY.map((d) => d.key));

/** GET /api/researcher/reports — list the caller's saved reports. */
export async function GET() {
  const session = await requireRole("RESEARCHER", "ADMIN");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const reports = await db.researchReport.findMany({
    where: { userId: session.sub },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    reports: reports.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      datasetKey: r.datasetKey,
      filtersJson: r.filtersJson,
      summaryJson: r.summaryJson,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}

/** POST /api/researcher/reports — create a saved report. */
export async function POST(req: Request) {
  const session = await requireRole("RESEARCHER", "ADMIN");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: {
    title?: unknown;
    description?: unknown;
    datasetKey?: unknown;
    filters?: unknown;
    summary?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 2) {
    return NextResponse.json({ error: "Title must be at least 2 characters" }, { status: 422 });
  }
  const datasetKey = typeof body.datasetKey === "string" ? body.datasetKey : "";
  if (!VALID_KEYS.has(datasetKey)) {
    return NextResponse.json({ error: "Invalid dataset key" }, { status: 422 });
  }
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) || null : null;
  const filtersJson = body.filters ? JSON.stringify(body.filters) : null;
  const summaryJson = body.summary ? JSON.stringify(body.summary) : null;

  const report = await db.researchReport.create({
    data: {
      userId: session.sub,
      title,
      description,
      datasetKey,
      filtersJson,
      summaryJson,
    },
  });

  return NextResponse.json({
    ok: true,
    report: {
      id: report.id,
      title: report.title,
      description: report.description,
      datasetKey: report.datasetKey,
      filtersJson: report.filtersJson,
      summaryJson: report.summaryJson,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    },
  });
}
