import { NextResponse } from "next/server";
import { marineGuard } from "@/lib/marine/route-helpers";
import { buildExport, datasetMeta } from "@/lib/marine/exports/service";

export const runtime = "nodejs";

/**
 * POST /api/marine/exports/preview
 * Body: { dataset, format?, species?, origin?, from?, to?, limit? }
 *
 * Returns the first rows + total count WITHOUT downloading, so the UI can
 * preview before export. Uses the exact same collector as the real export —
 * no divergence between preview and file.
 */
export async function POST(req: Request) {
  const guard = await marineGuard("exports");
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const dataset = typeof body.dataset === "string" ? body.dataset : "";
  if (!datasetMeta(dataset)) {
    return NextResponse.json({ error: `Unknown dataset: ${dataset || "(none)"}` }, { status: 404 });
  }

  try {
    const result = await buildExport({
      dataset,
      format: "json",
      species: typeof body.species === "string" ? body.species : undefined,
      origin: typeof body.origin === "string" ? body.origin : undefined,
      from: typeof body.from === "string" && body.from ? body.from : null,
      to: typeof body.to === "string" && body.to ? body.to : null,
      limit: Math.min(Math.max(1, Number(body.limit ?? "5000")), 50000),
    });
    const parsed = JSON.parse(result.content) as { provenance: unknown; records: unknown[] };
    return NextResponse.json({
      provenance: parsed.provenance,
      previewRows: parsed.records.slice(0, 10),
      recordCount: result.recordCount,
      filename: result.filename,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Preview failed" },
      { status: 500 }
    );
  }
}
