/**
 * Marine Platform · Feature 4 — dataset collectors for the export service.
 * Each collector reads REAL rows from existing tables with the exact PII
 * policy of the existing researcher portal (aggregate fish-analyses, no user
 * identity on catches).
 */
import { db } from "@/lib/db";
import { parseDwc } from "@/lib/marine/biodiversity/observations";

export interface DatasetMeta {
  key: string;
  label: string;
  sources: string[];
}

export const DATASETS: DatasetMeta[] = [
  { key: "species-observations", label: "Species & Biodiversity observations", sources: ["MarineSpeciesObservation"] },
  { key: "edna-asvs", label: "eDNA ASV/OTU records", sources: ["MarineEdnaAsv"] },
  { key: "sea-conditions", label: "Sea conditions (environmental)", sources: ["SeaCondition"] },
  { key: "fishing-spots", label: "Fishing spots", sources: ["FishingSpot"] },
  { key: "fish-analyses", label: "Fish analyses (aggregate, no PII)", sources: ["FishAnalysis"] },
  { key: "catches", label: "Catch records (species/date only)", sources: ["CatchRecord"] },
];

export function datasetMeta(key: string): DatasetMeta | undefined {
  return DATASETS.find((d) => d.key === key);
}

interface CollectInput {
  species?: string;
  origin?: string;
  dateRange: Record<string, unknown>;
  limit: number;
}

export async function collectDataset(
  key: string,
  input: CollectInput
): Promise<{ rows: Record<string, unknown>[]; columns: string[]; sources: string[] }> {
  const { species, origin, dateRange, limit } = input;

  if (key === "species-observations") {
    const data = await db.marineSpeciesObservation.findMany({
      where: {
        ...(species ? { scientificName: { contains: species } } : {}),
        ...(origin ? { originTable: origin } : {}),
        ...dateRange,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const rows = data.map((r) => {
      const rec = r as unknown as Record<string, unknown>;
      const { dwc, ...rest } = rec;
      return { ...rest, dwc: JSON.stringify(parseDwc(typeof dwc === "string" ? dwc : null)) };
    });
    return { rows, columns: rows.length ? Object.keys(rows[0]) : [], sources: ["MarineSpeciesObservation"] };
  }

  if (key === "edna-asvs") {
    const data = await db.marineEdnaAsv.findMany({
      where: {
        ...(species ? { scientificName: { contains: species } } : {}),
        ...dateRange,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        asvId: true, scientificName: true, taxonRank: true, confidence: true,
        targetGene: true, sequence: true, latitude: true, longitude: true,
        eventDate: true, source: true,
      },
    });
    const rows = data as unknown as Record<string, unknown>[];
    return { rows, columns: rows.length ? Object.keys(rows[0]) : [], sources: ["MarineEdnaAsv"] };
  }

  if (key === "sea-conditions") {
    const data = await db.seaCondition.findMany({
      where: dateRange.recordedAt ? { recordedAt: dateRange.recordedAt as never } : {},
      orderBy: { recordedAt: "desc" },
      take: limit,
      select: {
        id: true, latitude: true, longitude: true, locationLabel: true,
        source: true, isDemo: true, recordedAt: true, payload: true,
      },
    });
    const rows = data as unknown as Record<string, unknown>[];
    return { rows, columns: rows.length ? Object.keys(rows[0]) : [], sources: ["SeaCondition"] };
  }

  if (key === "fishing-spots") {
    const data = await db.fishingSpot.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, name: true, latitude: true, longitude: true, region: true,
        species: true, depthM: true, bottomType: true, source: true, createdAt: true,
      },
    });
    const rows = data as unknown as Record<string, unknown>[];
    return { rows, columns: rows.length ? Object.keys(rows[0]) : [], sources: ["FishingSpot"] };
  }

  if (key === "fish-analyses") {
    const data = await db.fishAnalysis.findMany({
      where: { species: { not: null } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, species: true, confidence: true, sizeRange: true, weightRange: true, createdAt: true },
    });
    const rows = data as unknown as Record<string, unknown>[];
    return { rows, columns: rows.length ? Object.keys(rows[0]) : [], sources: ["FishAnalysis"] };
  }

  if (key === "catches") {
    const data = await db.catchRecord.findMany({
      orderBy: { date: "desc" },
      take: limit,
      select: { id: true, species: true, quantity: true, unit: true, catchType: true, date: true },
    });
    const rows = data as unknown as Record<string, unknown>[];
    return { rows, columns: rows.length ? Object.keys(rows[0]) : [], sources: ["CatchRecord"] };
  }

  throw new Error(`Unknown dataset: ${key}`);
}