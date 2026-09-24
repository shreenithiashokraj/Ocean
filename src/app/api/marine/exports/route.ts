import { NextResponse } from "next/server";
import { marineGuard, auditRequest } from "@/lib/marine/route-helpers";
import { buildExport, datasetMeta } from "@/lib/marine/exports/service";

export const runtime = "nodejs";

/**
 * GET /api/marine/exports?dataset=<key>&format=csv|json&species=&origin=&from=&to=&limit=
 *
 * Streams a real CSV/JSON file with provenance embedded (json) and an
 * Attachment Content-Disposition using the documented filename pattern
 * (e.g. species-observations-2026-09-23.csv).
 */
export async function GET(req: Request) {
  const guard = await marineGuard("exports");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const dataset = url.searchParams.get("dataset")?.trim() ?? "";
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  if (!datasetMeta(dataset)) {
    return NextResponse.json(
      { error: `Unknown dataset: ${dataset || "(none)"}` },
      { status: 404 }
    );
  }
  if (format !== "csv" && format !== "json") {
    return NextResponse.json({ error: "format must be csv or json" }, { status: 400 });
  }

  try {
    const result = await buildExport({
      dataset,
      format,
      species: url.searchParams.get("species")?.trim() || undefined,
      origin: url.searchParams.get("origin")?.trim() || undefined,
      from: url.searchParams.get("from") || null,
      to: url.searchParams.get("to") || null,
      limit: Math.min(Math.max(1, Number(url.searchParams.get("limit") ?? "5000")), 50000),
    });

    auditRequest({
      userId: guard.session.userId,
      action: "export",
      resource: `marine.export.${dataset}`,
      endpoint: "/api/marine/exports",
      status: 200,
    });

    return new NextResponse(result.content, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-Export-Record-Count": String(result.recordCount),
        "X-Export-Filename": result.filename,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Export failed" },
      { status: 500 }
    );
  }
}
