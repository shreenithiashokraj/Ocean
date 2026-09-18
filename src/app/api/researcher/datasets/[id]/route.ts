import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getDatasetMeta, datasetPreview, datasetCount, datasetBounds } from "@/lib/datasets";

export const runtime = "nodejs";

/**
 * GET /api/researcher/datasets/[id]?page=&pageSize=&search=
 * Returns dataset metadata + a paginated preview of real records. For
 * fish-analyses, records are returned WITHOUT owner PII (aggregate research).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("RESEARCHER", "ADMIN");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: key } = await ctx.params;

  const meta = getDatasetMeta(key);
  if (!meta) return NextResponse.json({ error: "Unknown dataset" }, { status: 404 });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.max(1, Number(url.searchParams.get("pageSize") ?? "10"));
  const search = url.searchParams.get("search") ?? "";

  const [preview, count, bounds] = await Promise.all([
    datasetPreview(key, { page, pageSize, search: search || undefined }),
    datasetCount(key),
    datasetBounds(key),
  ]);

  return NextResponse.json({
    dataset: {
      key: meta.key,
      name: meta.name,
      description: meta.description,
      dataType: meta.dataType,
      source: meta.source,
      status: meta.status,
      fields: meta.fields,
    },
    records: preview.rows,
    total: preview.total,
    page,
    pageSize,
    recordCount: count,
    coverage: bounds,
  });
}
