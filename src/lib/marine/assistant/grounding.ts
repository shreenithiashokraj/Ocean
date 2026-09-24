/**
 * Marine Platform · Feature 3 — AI Research Assistant grounding layer.
 *
 * Collects REAL aggregate facts from the existing database (counts, species
 * lists, diversity metrics, eDNA summary, environmental parameters available).
 * These facts are passed to the configured LLM (server-side Z.AI — same
 * provider the existing AI Fish Analysis uses) so the model EXPLAINS real
 * data; it never invents it. The API response separates:
 *
 *   grounding  → the exact database facts used (auditable)
 *   answer     → LLM-composed natural-language explanation of those facts
 *
 * If no AI provider is configured, the facts are still returned with
 * `llm: { configured: false }` and an honest message — facts never require
 * the LLM, only the explanation does.
 */
import { db } from "@/lib/db";
import { ednaSummary } from "@/lib/marine/edna/store";

export interface GroundingFacts {
  observedSpecies: { name: string; count: number }[];
  distinctSpeciesCount: number;
  totalObservations: number;
  spatialCells: number;
  computedShannonCells: { cellKey: string; shannonH: number; speciesCount: number }[];
  edna: Awaited<ReturnType<typeof ednaSummary>>;
  availableEnvironmentalParameters: string[];
  environmentalSnapshotCount: number;
  fishingSpotsWithSpecies: number;
  catchSpecies: { name: string; totalQuantity: number }[];
  datasetRecordCount: number;
}

/** Collect real grounding facts (all queries are cheap aggregates). */
export async function collectGrounding(): Promise<GroundingFacts> {
  const [bySpecies, obsAgg, cells, edna, seaCount, seaSamples, spotCount, catches, datasets] =
    await Promise.all([
      db.marineSpeciesObservation.groupBy({
        by: ["scientificName"],
        _sum: { count: true },
        _count: { _all: true },
        orderBy: { _count: { scientificName: "desc" } },
      }),
      db.marineSpeciesObservation.aggregate({ _sum: { count: true }, _count: { _all: true } }),
      db.marineDiversityMetric.findMany({
        where: { scope: "spatial-cell" },
        select: { cellKey: true, shannonH: true, speciesCount: true },
        orderBy: { shannonH: "desc" },
        take: 10,
      }),
      ednaSummary(),
      db.seaCondition.count(),
      db.seaCondition.findMany({ select: { payload: true }, take: 3, orderBy: { recordedAt: "desc" } }),
      db.fishingSpot.count({ where: { species: { not: null } } }),
      db.catchRecord.groupBy({ by: ["species"], _sum: { quantity: true }, orderBy: { species: "asc" } }),
      db.datasetRecord.count(),
    ]);

  // Discover which environmental parameters actually exist in stored payloads.
  const paramSet = new Set<string>();
  for (const s of seaSamples) {
    try {
      const p = JSON.parse(s.payload) as Record<string, unknown>;
      for (const [k, v] of Object.entries(p)) {
        if (v !== null && typeof v !== "object") paramSet.add(k);
      }
    } catch { /* payload is not JSON — skip */ }
  }

  return {
    observedSpecies: bySpecies
      .filter((s) => s.scientificName)
      .slice(0, 30)
      .map((s) => ({ name: s.scientificName!, count: s._sum.count ?? s._count._all })),
    distinctSpeciesCount: bySpecies.filter((s) => s.scientificName).length,
    totalObservations: obsAgg._sum.count ?? obsAgg._count._all,
    spatialCells: cells.length,
    computedShannonCells: cells.map((c) => ({ cellKey: c.cellKey ?? "", shannonH: c.shannonH, speciesCount: c.speciesCount })),
    edna,
    availableEnvironmentalParameters: [...paramSet].sort(),
    environmentalSnapshotCount: seaCount,
    fishingSpotsWithSpecies: spotCount,
    catchSpecies: catches.map((c) => ({ name: c.species, totalQuantity: c._sum.quantity ?? 0 })),
    datasetRecordCount: datasets,
  };
}

/** Compact, token-efficient textual rendering of the facts for the LLM. */
export function factsToPrompt(f: GroundingFacts): string {
  const lines: string[] = [];
  lines.push(`Distinct species labels: ${f.distinctSpeciesCount}; total occurrence records: ${f.totalObservations}`);
  if (f.observedSpecies.length) {
    lines.push(`Top species by occurrence count: ${f.observedSpecies.map((s) => `${s.name} (${s.count})`).join("; ")}`);
  } else {
    lines.push("No species observations are stored yet.");
  }
  if (f.computedShannonCells.length) {
    lines.push(`Shannon diversity (computed cells): ${f.computedShannonCells.map((c) => `${c.cellKey} H=${c.shannonH.toFixed(3)} (${c.speciesCount} species)`).join("; ")}`);
  } else {
    lines.push("No spatial cells have enough data for Shannon index yet.");
  }
  lines.push(`eDNA ASVs stored: ${f.edna.totalAsvs}; taxonomically resolved: ${f.edna.taxonomicallyResolved}; reference DB connected: ${f.edna.referenceDatabase.connected}`);
  lines.push(`Environmental snapshots: ${f.environmentalSnapshotCount}; parameters present in payloads: ${f.availableEnvironmentalParameters.join(", ") || "none yet"}`);
  if (f.catchSpecies.length) {
    lines.push(`Catch records by species: ${f.catchSpecies.map((c) => `${c.name} (${c.totalQuantity})`).join("; ")}`);
  }
  lines.push(`Fishing spots with species labels: ${f.fishingSpotsWithSpecies}; uploaded research dataset rows: ${f.datasetRecordCount}`);
  return lines.join("\n");
}

/** The system prompt — enforces the grounding contract. */
export function assistantSystemPrompt(): string {
  return [
    "You are the Marine Research Assistant inside the OceanInsight Fisherman Module.",
    "You will receive REAL aggregate facts extracted from the project database.",
    "RULES:",
    "1. Use ONLY the provided facts for numeric claims. If a fact is absent, say the data is not available.",
    "2. You may explain scientific concepts (Shannon diversity, eDNA metabarcoding, taxonomy) freely.",
    "3. Never fabricate species, coordinates, dates, counts, or confidence values.",
    "4. Keep answers concise (<= 200 words) and factual.",
  ].join("\n");
}
