import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { logApiCall } from "@/lib/weather";
import { DEFAULT_PAGE_SIZE, searchMarineRecords } from "@/lib/explorer";

export const runtime = "nodejs";

/**
 * GET /api/researcher/explorer
 *
 * Unified Data Explorer search endpoint for the Researcher portal. Fans out
 * across the marine domains backed by real stored data (Oceanographic and
 * Fisheries) and returns one normalized, paginated result set:
 *
 *   ?domain=all|oceanographic|fisheries|edna
 *   &dataset=<registry key>            (optional, must belong to the domain)
 *   &search=<free text>                (species, location, dataset, taxon…)
 *   &source=<exact source value>       (from the real `sources` facet)
 *   &location=<free text>
 *   &taxon=<free text>
 *   &from=YYYY-MM-DD&to=YYYY-MM-DD     (inclusive date range)
 *   &page=1&pageSize=25
 *
 * Response: `{ records, total, page, pageSize, truncated, domains, sources }`.
 * `records` are built only from columns that exist in the current schema — no
 * fabricated datasets, no PII (owner ids, images and free-text owner notes are
 * never selected).
 *
 * Guarded by RESEARCHER / ADMIN (same guard as the other researcher routes).
 */
export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await requireRole("RESEARCHER", "ADMIN");
  if (!session) {
    return NextResponse.json(
      { error: "Forbidden — researcher role required." },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const str = (key: string) => {
    const value = url.searchParams.get(key);
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };
  const int = (key: string, fallback: number) => {
    const value = Number(url.searchParams.get(key));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  };

  try {
    const result = await searchMarineRecords({
      domain: str("domain"),
      dataset: str("dataset"),
      search: str("search"),
      source: str("source"),
      location: str("location"),
      taxon: str("taxon"),
      from: str("from"),
      to: str("to"),
      page: int("page", 1),
      pageSize: int("pageSize", DEFAULT_PAGE_SIZE),
    });

    await logApiCall({
      userId: session.sub,
      service: "researcher",
      endpoint: "/api/researcher/explorer",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
      message: `records=${result.records.length} total=${result.total}`,
    });

    return NextResponse.json(result);
  } catch (err) {
    await logApiCall({
      userId: session.sub,
      service: "researcher",
      endpoint: "/api/researcher/explorer",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
      message: err instanceof Error ? err.message : "error",
    });
    return NextResponse.json(
      { error: "Failed to search marine records." },
      { status: 500 }
    );
  }
}
