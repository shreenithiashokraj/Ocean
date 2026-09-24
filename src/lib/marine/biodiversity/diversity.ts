/**
 * Marine Platform · Feature 1 — Shannon diversity index (paper Eq. 4).
 *
 *   H = −Σ pᵢ ln(pᵢ)
 *
 * Computed STRICTLY from real stored occurrences (MarineSpeciesObservation).
 * H is only produced when a cell holds ≥ MIN_SPECIES_FOR_SHANNON distinct
 * species; anything less is reported as an explicit honesty state, never a
 * placeholder number. The exact input proportions are cached alongside H so
 * every published index is auditable (MarineDiversityMetric.proportionsJson).
 */
import { db } from "@/lib/db";
import { MIN_SPECIES_FOR_SHANNON } from "./config";

export interface CellDiversity {
  cellKey: string | null;
  status: "computed" | "single-species" | "no-observations";
  /** Shannon H — present only when status === "computed" */
  shannonH?: number;
  speciesCount: number;
  individualCount: number;
  /** auditable {species: pi} input — present only when computed */
  proportions?: Record<string, number>;
}

/**
 * Shannon index over a set of per-species counts.
 * Returns null when there are fewer distinct species than the configured
 * minimum (caller surfaces the honesty state instead of a number).
 */
export function shannonIndex(counts: Record<string, number>): number | null {
  const species = Object.entries(counts).filter(([, n]) => n > 0);
  if (species.length < MIN_SPECIES_FOR_SHANNON) return null;
  const total = species.reduce((sum, [, n]) => sum + n, 0);
  if (total <= 0) return null;
  let h = 0;
  for (const [, n] of species) {
    const p = n / total;
    h -= p * Math.log(p);
  }
  return h;
}

/** Compute (and cache) diversity per spatial cell from real observations. */
export async function computeCellDiversity(options: {
  cellSizeDeg: number;
  persist?: boolean;
}): Promise<{ cells: CellDiversity[]; global: CellDiversity }> {
  // Only observations WITH real coordinates participate in the spatial layer.
  const rows = await db.marineSpeciesObservation.findMany({
    where: { spatialCell: { not: null } },
    select: { spatialCell: true, scientificName: true, count: true },
  });

  // Aggregate counts per cell per species.
  const byCell = new Map<string, Record<string, number>>();
  for (const r of rows) {
    if (!r.spatialCell || !r.scientificName) continue;
    const cell = byCell.get(r.spatialCell) ?? {};
    cell[r.scientificName] = (cell[r.scientificName] ?? 0) + r.count;
    byCell.set(r.spatialCell, cell);
  }

  const cells: CellDiversity[] = [];
  for (const [cellKey, counts] of byCell) {
    const individualCount = Object.values(counts).reduce((a, b) => a + b, 0);
    const speciesCount = Object.keys(counts).length;
    const h = shannonIndex(counts);

    if (h === null) {
      // Honesty states are distinct: 1 species ≠ 0 observations (per spec).
      cells.push({
        cellKey,
        status: "single-species",
        speciesCount,
        individualCount,
      });
      continue;
    }

    const proportions = Object.fromEntries(
      Object.entries(counts).map(([sp, n]) => [sp, n / individualCount])
    );
    cells.push({
      cellKey,
      status: "computed",
      shannonH: h,
      speciesCount,
      individualCount,
      proportions,
    });

    if (options.persist) {
      // Cache per-cell metric on the FIRST observation of the cell (the model
      // requires an observationId anchor; cellKey is the real lookup key).
      const anchor = await db.marineSpeciesObservation.findFirst({
        where: { spatialCell: cellKey },
        select: { id: true },
      });
      if (anchor) {
        await db.marineDiversityMetric.upsert({
          where: { scope_cellKey: { scope: "spatial-cell", cellKey } },
          create: {
            observationId: anchor.id,
            scope: "spatial-cell",
            cellKey,
            shannonH: h,
            speciesCount,
            individualCount,
            proportionsJson: JSON.stringify(proportions),
          },
          update: {
            shannonH: h,
            speciesCount,
            individualCount,
            proportionsJson: JSON.stringify(proportions),
            computedAt: new Date(),
          },
        });
      }
    }
  }

  // Global metric across ALL observations (with or without coordinates).
  const allRows = await db.marineSpeciesObservation.findMany({
    select: { scientificName: true, count: true },
  });
  const globalCounts: Record<string, number> = {};
  for (const r of allRows) {
    if (!r.scientificName) continue;
    globalCounts[r.scientificName] = (globalCounts[r.scientificName] ?? 0) + r.count;
  }
  const globalIndividuals = Object.values(globalCounts).reduce((a, b) => a + b, 0);
  const globalH = shannonIndex(globalCounts);
  const global: CellDiversity = globalH === null
    ? {
        cellKey: null,
        status: globalIndividuals === 0 ? "no-observations" : "single-species",
        speciesCount: Object.keys(globalCounts).length,
        individualCount: globalIndividuals,
      }
    : {
        cellKey: null,
        status: "computed",
        shannonH: globalH,
        speciesCount: Object.keys(globalCounts).length,
        individualCount: globalIndividuals,
        proportions: Object.fromEntries(
          Object.entries(globalCounts).map(([sp, n]) => [sp, n / globalIndividuals])
        ),
      };

  return { cells, global };
}
