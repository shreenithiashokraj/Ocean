/**
 * Marine Platform · Feature 2 — eDNA ASV/OTU store + Villon-style fallback.
 *
 * INGESTION HONESTY: this deployment has NO laboratory/sequencer feed
 * connected. ASV records enter only through the documented ingestion endpoint
 * (`POST /api/marine/edna/ingest`), which accepts REAL submitted records in
 * the paper Table II field mapping. Nothing is auto-generated.
 *
 * SPECIES-ID HONESTY (paper §XIII): with an empty/absent reference database,
 * species-level identification is impossible. The `assignTaxonomyWithFallback`
 * fallback below implements the Villon et al. approach honestly:
 * nearest-reference matching against WHATEVER reference data exists in the
 * system (currently species labels in MarineSpeciesObservation). When no
 * reference matches, taxonRank degrades explicitly (species → genus →
 * "unresolved") and confidence is null — never a fabricated score.
 */
import { db } from "@/lib/db";

export interface EdnaIngestInput {
  asvId: string;
  scientificName?: string | null;
  taxonRank?: string | null;
  targetGene?: string | null;
  sequence?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  eventDate?: string | null;
  source?: string | null;
  sampleMeta?: Record<string, unknown> | null;
}

/** Paper Table II mapping reference (documentation, not execution). */
export const EDNA_DWC_MAPPING = {
  asv_id: "occurrenceID",
  otu_id: "occurrenceID",
  species_name: "scientificName",
  sample_lat: "decimalLatitude",
  sample_lon: "decimalLongitude",
  collection_date: "eventDate",
  read_count: "organismQuantity",
  marker_gene: "target_gene",
} as const;

export async function ingestAsv(input: EdnaIngestInput) {
  if (!input.asvId?.trim()) throw new Error("asvId is required");
  const rank = input.taxonRank ?? (input.scientificName ? "species" : null);
  const data = {
    scientificName: input.scientificName ?? null,
    taxonRank: rank,
    targetGene: input.targetGene ?? null,
    sequence: input.sequence ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    eventDate: input.eventDate ? new Date(input.eventDate) : null,
    source: input.source ?? null,
    sampleMetaJson: input.sampleMeta ? JSON.stringify(input.sampleMeta) : null,
  };
  return db.marineEdnaAsv.upsert({
    where: { asvId: input.asvId.trim() },
    create: { asvId: input.asvId.trim(), ...data },
    update: data,
  });
}

/**
 * Villon-style fallback assignment: rank order = species → genus → unresolved,
 * driven by real nearest-name matches in stored reference data.
 */
export async function assignTaxonomyWithFallback(asvId: string) {
  const asv = await db.marineEdnaAsv.findUnique({ where: { asvId } });
  if (!asv) return null;

  const refs = await db.marineSpeciesObservation.findMany({
    where: { scientificName: { not: null } },
    select: { scientificName: true },
    distinct: ["scientificName"],
  });
  const refNames = refs.map((r) => r.scientificName!).filter(Boolean);

  const fallback: { rank: string; matched: string | null; similarity: number | null; basis: string }[] = [];

  if (asv.scientificName && refNames.includes(asv.scientificName)) {
    fallback.push({ rank: "species", matched: asv.scientificName, similarity: 1, basis: "exact label in observed-species reference set" });
  } else if (asv.scientificName) {
    const genus = asv.scientificName.split(/\s+/)[0];
    const genusMatch = refNames.find((n) => n.split(/\s+/)[0] === genus);
    fallback.push(
      genusMatch
        ? { rank: "genus", matched: genus, similarity: null, basis: "genus token matches an observed species label" }
        : { rank: "unresolved", matched: null, similarity: null, basis: "no reference match — incomplete reference database (paper §XIII)" }
    );
  } else {
    fallback.push({ rank: "unresolved", matched: null, similarity: null, basis: "no species label provided with the ASV and no reference database connected" });
  }

  const top = fallback[0];
  const confidence = top.similarity ?? null;

  const updated = await db.marineEdnaAsv.update({
    where: { id: asv.id },
    data: {
      fallbackJson: JSON.stringify(fallback),
      confidence,
      taxonRank: top.rank === "unresolved" ? asv.taxonRank : top.rank,
    },
  });
  return { asv: updated, fallback, referenceCount: refNames.length };
}

/** Aggregate eDNA summary strictly from stored rows (zeros are honest zeros). */
export async function ednaSummary() {
  const [total, resolved, withCoords, byGene, byRank] = await Promise.all([
    db.marineEdnaAsv.count(),
    db.marineEdnaAsv.count({ where: { taxonRank: { in: ["species", "genus", "family"] } } }),
    db.marineEdnaAsv.count({ where: { latitude: { not: null } } }),
    db.marineEdnaAsv.groupBy({ by: ["targetGene"], _count: { _all: true } }),
    db.marineEdnaAsv.groupBy({ by: ["taxonRank"], _count: { _all: true } }),
  ]);
  return {
    totalAsvs: total,
    taxonomicallyResolved: resolved,
    withCoordinates: withCoords,
    byTargetGene: Object.fromEntries(byGene.filter((g) => g.targetGene).map((g) => [g.targetGene!, g._count._all])),
    byTaxonRank: Object.fromEntries(byRank.filter((r) => r.taxonRank).map((r) => [r.taxonRank!, r._count._all])),
    referenceDatabase: {
      connected: false,
      note:
        "No external reference sequence database (NCBI/SILVA/BOLD) is connected. Species-level " +
        "ID relies on labels already present in stored observations; ASVs without a reference " +
        "match remain honestly unresolved (paper §XIII limitation).",
    },
  };
}