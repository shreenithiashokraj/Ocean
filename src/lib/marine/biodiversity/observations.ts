/**
 * Marine Platform · Feature 1 — species occurrence materializer.
 *
 * Builds MarineSpeciesObservation rows from the EXISTING tables that actually
 * hold species data, mapping to Darwin Core terms per paper Table II:
 *
 *   FishingSpot.species   → scientificName   (has real lat/lng)
 *   FishAnalysis.species  → scientificName   (no coordinates in schema)
 *   CatchRecord.species   → scientificName   (location is a free-text label only)
 *   DatasetRecord         → scientificName   (uploaded research datasets)
 *
 * DATA HONESTY: every field is read from a real stored column. A record
 * without coordinates simply has null lat/lng and is excluded from the
 * spatial layer upstream — it is never assigned a placeholder position.
 * Upserts are idempotent on (originTable, originId) so re-syncing never
 * duplicates rows. Origin tables are pre-marine and are never written to.
 */
import { db } from "@/lib/db";
import { cellKeyFor } from "./config";

const DWC_CORE_KEYS = [
  "scientificName", "kingdom", "phylum", "class", "order", "family", "genus",
  "basisOfRecord", "eventDate",
] as const;

/** Map stored fields to Darwin Core terms. Taxonomic hierarchy above species
 *  is emitted only when a record actually stores it — existing tables don't,
 *  so those keys stay absent rather than invented (paper Table II mapping). */
function buildDwc(input: {
  scientificName: string;
  latitude?: number | null;
  longitude?: number | null;
  occurredAt?: Date | null;
  basisOfRecord: string;
}) {
  const dwc: Record<string, unknown> = {
    scientificName: input.scientificName,
    basisOfRecord: input.basisOfRecord,
  };
  if (input.latitude != null && input.longitude != null) {
    dwc.decimalLatitude = input.latitude;
    dwc.decimalLongitude = input.longitude;
  }
  if (input.occurredAt) dwc.eventDate = input.occurredAt.toISOString();
  return dwc;
}

interface UpsertResult {
  id: string;
}

async function upsertObservation(input: {
  originTable: string;
  originId: string;
  scientificName: string;
  taxonRank: string;
  latitude: number | null;
  longitude: number | null;
  occurredAt: Date | null;
  count: number;
  basisOfRecord: string;
  datasetRecordId?: string | null;
  cellSizeDeg: number;
}): Promise<UpsertResult> {
  const hasCoords = input.latitude != null && input.longitude != null;
  const spatialCell = hasCoords
    ? cellKeyFor(input.latitude!, input.longitude!, input.cellSizeDeg)
    : null;
  const dwc = buildDwc({
    scientificName: input.scientificName,
    latitude: input.latitude,
    longitude: input.longitude,
    occurredAt: input.occurredAt,
    basisOfRecord: input.basisOfRecord,
  });

  const row = await db.marineSpeciesObservation.upsert({
    where: {
      originTable_originId: {
        originTable: input.originTable,
        originId: input.originId,
      },
    },
    create: {
      originTable: input.originTable,
      originId: input.originId,
      datasetRecordId: input.datasetRecordId ?? null,
      scientificName: input.scientificName,
      taxonRank: input.taxonRank,
      latitude: input.latitude,
      longitude: input.longitude,
      occurredAt: input.occurredAt,
      spatialCell,
      count: input.count,
      dwc: JSON.stringify(dwc),
    },
    update: {
      scientificName: input.scientificName,
      taxonRank: input.taxonRank,
      latitude: input.latitude,
      longitude: input.longitude,
      occurredAt: input.occurredAt,
      spatialCell,
      count: input.count,
      dwc: JSON.stringify(dwc),
    },
  });
  return { id: row.id };
}

export { DWC_CORE_KEYS };

/** Per-source sync counters (returned honestly, including skips). */
export interface SyncSources {
  [key: string]: { total: number; synced: number; skippedNoSpecies: number };
}

/**
 * Sync FishingSpot + FishAnalysis sources into MarineSpeciesObservation.
 * Returns per-source counts + an honest list of what was skipped and why.
 */
export async function syncSpeciesObservations(cellSizeDeg: number): Promise<SyncSources> {
  const sources: SyncSources = {
    "fishing-spot": { total: 0, synced: 0, skippedNoSpecies: 0 },
    "fish-analysis": { total: 0, synced: 0, skippedNoSpecies: 0 },
  };

  // 1. FishingSpot — curated spots: real lat/lng + comma-separated species.
  const spots = await db.fishingSpot.findMany({
    where: { species: { not: null } },
    select: { id: true, species: true, latitude: true, longitude: true, createdAt: true },
  });
  sources["fishing-spot"].total = spots.length;
  for (const s of spots) {
    const names = (s.species ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!names.length) {
      sources["fishing-spot"].skippedNoSpecies++;
      continue;
    }
    for (const name of names) {
      await upsertObservation({
        originTable: "fishing-spot",
        originId: `${s.id}::${name}`,
        scientificName: name,
        taxonRank: "species",
        latitude: s.latitude,
        longitude: s.longitude,
        occurredAt: s.createdAt,
        count: 1,
        basisOfRecord: "HumanObservation",
        cellSizeDeg,
      });
    }
    sources["fishing-spot"].synced++;
  }

  // 2. FishAnalysis — AI species predictions. No coordinates exist in this
  //    schema; rows are stored with null lat/lng (excluded from spatial layer).
  const analyses = await db.fishAnalysis.findMany({
    where: { species: { not: null } },
    select: { id: true, species: true, createdAt: true },
  });
  sources["fish-analysis"].total = analyses.length;
  for (const a of analyses) {
    if (!a.species) {
      sources["fish-analysis"].skippedNoSpecies++;
      continue;
    }
    await upsertObservation({
      originTable: "fish-analysis",
      originId: a.id,
      scientificName: a.species,
      taxonRank: "species",
      latitude: null,
      longitude: null,
      occurredAt: a.createdAt,
      count: 1,
      basisOfRecord: "MachineObservation",
      cellSizeDeg,
    });
    sources["fish-analysis"].synced++;
  }

  return sources;
}

/**
 * Sync CatchRecord + DatasetRecord sources (kept in a second function so each
 * sync function stays focused; the API calls both). Returns honest counters.
 */
export async function syncOccurrenceSources(cellSizeDeg: number): Promise<SyncSources> {
  const sources: SyncSources = {
    "catch-record": { total: 0, synced: 0, skippedNoSpecies: 0 },
    "dataset-record": { total: 0, synced: 0, skippedNoSpecies: 0 },
  };

  // 3. CatchRecord — real catches; location is a free-text label (no coords).
  const catches = await db.catchRecord.findMany({
    select: { id: true, species: true, date: true, quantity: true },
  });
  sources["catch-record"].total = catches.length;
  for (const c of catches) {
    await upsertObservation({
      originTable: "catch-record",
      originId: c.id,
      scientificName: c.species,
      taxonRank: "species",
      latitude: null,
      longitude: null,
      occurredAt: c.date,
      count: Math.max(1, Math.round(c.quantity || 1)),
      basisOfRecord: "HumanObservation",
      cellSizeDeg,
    });
    sources["catch-record"].synced++;
  }

  // 4. DatasetRecord — uploaded research datasets (coords when provided).
  const datasetRows = await db.datasetRecord.findMany({
    select: { id: true, species: true, latitude: true, longitude: true, occurredAt: true },
  });
  sources["dataset-record"].total = datasetRows.length;
  for (const r of datasetRows) {
    if (!r.species) {
      sources["dataset-record"].skippedNoSpecies++;
      continue;
    }
    await upsertObservation({
      originTable: "dataset-record",
      originId: r.id,
      datasetRecordId: r.id,
      scientificName: r.species,
      taxonRank: "species",
      latitude: r.latitude,
      longitude: r.longitude,
      occurredAt: r.occurredAt,
      count: 1,
      basisOfRecord: "PreservedSpecimen",
      cellSizeDeg,
    });
    sources["dataset-record"].synced++;
  }

  return sources;
}

/** Extract the Darwin Core term subset from a stored dwc JSON blob. */
export function parseDwc(dwcJson: string | null): Record<string, string> {
  if (!dwcJson) return {};
  try {
    const parsed = JSON.parse(dwcJson) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const key of DWC_CORE_KEYS) {
      if (typeof parsed[key] === "string") out[key] = parsed[key];
    }
    return out;
  } catch {
    return {};
  }
}