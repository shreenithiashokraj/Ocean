import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { DATASET_REGISTRY, datasetCount, datasetBounds } from "@/lib/datasets";

export const runtime = "nodejs";

/**
 * GET /api/researcher/datasets
 * Lists the real dataset registry with live record counts + geographic bounds.
 * Guarded by RESEARCHER/ADMIN. No PII (all datasets are environmental/aggregate).
 */
export async function GET() {
  const session = await requireRole("RESEARCHER", "ADMIN");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const datasets = await Promise.all(
    DATASET_REGISTRY.map(async (d) => {
      const [count, bounds] = await Promise.all([
        datasetCount(d.key),
        datasetBounds(d.key),
      ]);
      return {
        key: d.key,
        name: d.name,
        description: d.description,
        dataType: d.dataType,
        source: d.source,
        status: d.status,
        fields: d.fields,
        recordCount: count,
        coverage: bounds,
        lastUpdated: count > 0 ? new Date().toISOString() : null,
      };
    })
  );

  return NextResponse.json({ datasets });
}
