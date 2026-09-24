import { NextResponse } from "next/server";
import { marineGuard, auditRequest } from "@/lib/marine/route-helpers";
import { computeCellDiversity, type CellDiversity } from "@/lib/marine/biodiversity/diversity";
import {
  resolveCellSizeDeg,
  cellLabel,
  MIN_SPECIES_FOR_SHANNON,
} from "@/lib/marine/biodiversity/config";

export const runtime = "nodejs";

/**
 * GET /api/marine/biodiversity/diversity?cellSize=1
 *
 * Shannon diversity (paper Eq. 4: H = −Σ pᵢ ln pᵢ) per spatial cell, computed
 * from real stored occurrences only. Honesty contract per cell:
 *
 *   status "computed"        → H present + auditable input proportions
 *   status "single-species"  → the cell HAS observations but fewer than
 *                              MIN_SPECIES_FOR_SHANNON distinct species —
 *                              deliberately distinct from…
 *   status "no-observations" → the cell holds no observations at all
 *
 * Cell size is configurable per request (?cellSize=, clamped to sane bounds)
 * and via MARINE_SPATIAL_CELL_DEG — never a hardcoded magic number.
 */
export async function GET(req: Request) {
  const guard = await marineGuard("biodiversity");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const cellSizeDeg = resolveCellSizeDeg(url.searchParams.get("cellSize"));
  const { cells, global } = await computeCellDiversity({ cellSizeDeg, persist: true });

  auditRequest({
    userId: guard.session.userId,
    action: "read",
    resource: "marine.biodiversity.diversity",
    endpoint: "/api/marine/biodiversity/diversity",
    status: 200,
  });

  const computedCount = cells.filter((c) => c.status === "computed").length;

  return NextResponse.json({
    cellSizeDeg,
    minSpeciesForShannon: MIN_SPECIES_FOR_SHANNON,
    global,
    cells: cells.map((c: CellDiversity) => ({
      ...c,
      label: c.cellKey ? cellLabel(c.cellKey, cellSizeDeg) : null,
    })),
    summary: {
      totalCells: cells.length,
      computedCells: computedCount,
      singleSpeciesCells: cells.filter((c) => c.status === "single-species").length,
      emptyCellsReported: 0, // empty cells have no row at all — see note
      note:
        "Cells with zero observations are absent from `cells` (nothing was measured there). " +
        "Cells marked single-species DO hold observations but fewer than the minimum distinct " +
        "species required for Shannon — these are different honesty statements.",
    },
  });
}
