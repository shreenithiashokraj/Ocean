/**
 * Marine Platform · Feature 1 — Species & Biodiversity configuration.
 *
 * Spatial cell resolution is CONFIGURABLE, never a buried magic number.
 * 1° cells are coarse near the equator and tighter toward the poles; callers
 * can override per request (`?cellSize=`), operators via env
 * (MARINE_SPATIAL_CELL_DEG), and the default is a single named constant here.
 */

/** Default spatial cell size in degrees (paper VIII-C: grid-cell aggregation). */
export const DEFAULT_CELL_SIZE_DEG = 1;

/** Hard upper bound for request-supplied cell sizes (degrees). */
export const MAX_CELL_SIZE_DEG = 10;

/** Minimum granularity accepted from requests (degrees). */
export const MIN_CELL_SIZE_DEG = 0.1;

/** Shannon (Eq. 4) is only computed when a cell holds at least this many
 *  distinct species. Cells with fewer report an explicit honesty state. */
export const MIN_SPECIES_FOR_SHANNON = 2;

/** Read + clamp the configured cell size (env or request param). */
export function resolveCellSizeDeg(requested?: string | number | null): number {
  let raw: number | null = null;
  if (requested !== undefined && requested !== null && requested !== "") {
    const n = Number(requested);
    raw = Number.isFinite(n) && n > 0 ? n : null;
  }
  if (raw === null) {
    const env = process.env.MARINE_SPATIAL_CELL_DEG;
    if (env) {
      const n = Number(env);
      raw = Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  const size = raw ?? DEFAULT_CELL_SIZE_DEG;
  return Math.min(Math.max(size, MIN_CELL_SIZE_DEG), MAX_CELL_SIZE_DEG);
}

/** Stable cell key for a coordinate at the given resolution, e.g. "13:80".
 *  Floor() on the raw degree value (not Math.round) so cells tile the globe
 *  without overlap. Cell size is embedded so metrics are never mixed across
 *  resolutions. */
export function cellKeyFor(lat: number, lng: number, cellSizeDeg: number): string {
  const size = resolveCellSizeDeg(cellSizeDeg);
  const latCell = Math.floor(lat / size);
  const lngCell = Math.floor(lng / size);
  return `${latCell}:${lngCell}`;
}

/** Human-readable cell label (SW corner + size) for UI display. */
export function cellLabel(cellKey: string, cellSizeDeg: number): string {
  const [latCell, lngCell] = cellKey.split(":").map(Number);
  return `${(latCell * cellSizeDeg).toFixed(cellSizeDeg < 1 ? 1 : 0)}°N–${((latCell + 1) * cellSizeDeg).toFixed(cellSizeDeg < 1 ? 1 : 0)}°N, ${(lngCell * cellSizeDeg).toFixed(cellSizeDeg < 1 ? 1 : 0)}°E–${((lngCell + 1) * cellSizeDeg).toFixed(cellSizeDeg < 1 ? 1 : 0)}°E`;
}
