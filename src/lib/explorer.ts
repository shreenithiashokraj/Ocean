/**
 * Unified Data Explorer — isolated data-access layer (server-only).
 *
 * The Unified Data Explorer lets a Researcher search and filter marine records
 * across the three domains described in the OceanInsight project paper:
 *
 *   1. Oceanographic
 *   2. Fisheries
 *   3. Molecular Biodiversity / eDNA
 *
 * DATA HONESTY: nothing here is fabricated. Every row returned by
 * `searchMarineRecords()` comes from a real Prisma query against models that
 * the Fisherman Module already persists (SeaCondition, FishAnalysis,
 * FishingSpot, WeatherAlert). The Molecular Biodiversity / eDNA domain has no
 * backing table in this deployment, so it resolves to an empty — but honest —
 * result set; the UI shows its empty state instead of inventing records.
 *
 * SAFETY: this module is additive and self-contained. It does not modify the
 * existing dataset registry (`src/lib/datasets.ts`), the existing
 * `/api/researcher/datasets*` endpoints, the Prisma schema, or any UI code.
 * Metadata (name / source / status) is *read* from the existing registry.
 */
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { DATASET_REGISTRY, getDatasetMeta } from "@/lib/datasets";

// ── Domain registry ──────────────────────────────────────────────────────────

export type ExplorerDomainKey = "oceanographic" | "fisheries" | "edna";

export interface ExplorerDomainDef {
  key: ExplorerDomainKey;
  label: string;
  /** dataset-registry keys that back this domain ([] = no source yet) */
  datasetKeys: string[];
  /** honest explanation surfaced when the domain has no backing source */
  note?: string;
}

export const EXPLORER_DOMAINS: ExplorerDomainDef[] = [
  {
    key: "oceanographic",
    label: "Oceanographic",
    datasetKeys: ["sea-conditions", "alerts"],
  },
  {
    key: "fisheries",
    label: "Fisheries",
    datasetKeys: ["fish-analyses", "fishing-spots"],
  },
  {
    key: "edna",
    label: "Molecular Biodiversity / eDNA",
    datasetKeys: [],
    note:
      "No molecular biodiversity (eDNA / metabarcoding) laboratory source is connected to this deployment yet, so this domain currently holds no records.",
  },
];

const ALL_DATASET_KEYS = DATASET_REGISTRY.map((d) => d.key);

/** Registry keys selected by a domain filter ("all"/unknown → every dataset). */
export function datasetKeysFor(domain?: string | null): string[] {
  if (!domain || domain === "all") return ALL_DATASET_KEYS;
  const def = EXPLORER_DOMAINS.find((d) => d.key === domain);
  if (!def) return ALL_DATASET_KEYS;
  return def.datasetKeys.filter((k) => ALL_DATASET_KEYS.includes(k));
}

// ── Unified record shape ─────────────────────────────────────────────────────

export interface MarineRecordDetail {
  label: string;
  value: string;
}

/**
 * One normalized marine record. Every field maps onto a column that actually
 * exists in the current database — nothing is derived or invented.
 */
export interface MarineRecord {
  /** real database primary key */
  id: string;
  datasetKey: string;
  datasetName: string;
  domainKey: ExplorerDomainKey | null;
  domainLabel: string;
  /** human label for the record (location / species / place / alert title) */
  title: string;
  /** species / taxon — only set for datasets that store one */
  taxon: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  /** collection / observation timestamp (recordedAt | createdAt | startTime) */
  occurredAt: string | null;
  source: string;
  /** alert lifecycle status when the record has one, else registry status */
  status: string;
  details: MarineRecordDetail[];
}

export interface ExplorerDomainInfo {
  key: ExplorerDomainKey;
  label: string;
  datasetKeys: string[];
  note: string | null;
  /** false when the domain has no backing data source in this deployment */
  hasSource: boolean;
  /** record count currently stored for the domain (0 when no source) */
  recordCount: number;
}

export interface ExplorerQuery {
  domain?: string | null;
  dataset?: string | null;
  search?: string | null;
  source?: string | null;
  location?: string | null;
  taxon?: string | null;
  /** inclusive date-range bounds, "YYYY-MM-DD" */
  from?: string | null;
  to?: string | null;
  page?: number;
  pageSize?: number;
}

export interface ExplorerResult {
  records: MarineRecord[];
  /** exact number of matching records across the selected datasets */
  total: number;
  page: number;
  pageSize: number;
  /** true when a dataset exceeded the per-dataset fetch window */
  truncated: boolean;
  domains: ExplorerDomainInfo[];
  /** real distinct source values — used as filter options (never invented) */
  sources: string[];
}

/** Per-dataset fetch window (keeps the fan-out bounded on small SQLite DBs). */
const MAX_ROWS_PER_DATASET = 500;
export const DEFAULT_PAGE_SIZE = 25;

// ── Small helpers ────────────────────────────────────────────────────────────

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function dayStart(value?: string | null): Date | undefined {
  if (!value || !DATE_ONLY.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function dayEnd(value?: string | null): Date | undefined {
  if (!value || !DATE_ONLY.test(value)) return undefined;
  const d = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function text(value?: string | null): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

/** Inclusive date-range clause shared by every dataset fetcher. */
function dateRange(from?: string | null, to?: string | null) {
  const gte = dayStart(from);
  const lte = dayEnd(to);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

/** Friendly labels for the well-known SeaCondition payload parameters. */
const PARAM_LABELS: Record<string, string> = {
  weatherText: "Weather",
  weatherCode: "Weather code",
  airTemperature: "Air temperature (°C)",
  seaSurfaceTemperature: "Sea-surface temperature (°C)",
  waterTemperature: "Water temperature (°C)",
  windSpeed: "Wind speed (km/h)",
  windDirection: "Wind direction (°)",
  windGusts: "Wind gusts (km/h)",
  waveHeight: "Wave height (m)",
  wavePeriod: "Wave period (s)",
  waveDirection: "Wave direction (°)",
  pressure: "Pressure (hPa)",
  humidity: "Humidity (%)",
  precipitation: "Precipitation (mm)",
  visibility: "Visibility (m)",
};

/** Flatten a stored SeaCondition payload into real, displayable parameters. */
function payloadParams(payload: unknown): MarineRecordDetail[] {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(String(payload)) as Record<string, unknown>;
  } catch {
    return [];
  }
  const out: MarineRecordDetail[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    const type = typeof value;
    if (value === null || value === undefined) continue;
    // only scalars — nested objects/arrays are not flattened
    if (type !== "string" && type !== "number" && type !== "boolean") continue;
    out.push({ label: PARAM_LABELS[key] ?? key, value: String(value) });
  }
  return out;
}

interface DatasetFetch {
  records: MarineRecord[];
  total: number;
}

const EMPTY_FETCH: DatasetFetch = { records: [], total: 0 };

// ── Per-dataset fetchers (real queries only) ─────────────────────────────────

async function fetchFishAnalyses(q: ExplorerQuery): Promise<DatasetFetch> {
  // FishAnalysis stores no coordinates/location column → a location filter
  // simply cannot match this dataset.
  if (text(q.location)) return EMPTY_FETCH;

  const meta = getDatasetMeta("fish-analyses");
  const declaredSource = meta?.source ?? "z-ai-web-dev-sdk VLM";
  // FishAnalysis has no `source` column; its provenance is the registry value.
  const source = text(q.source);
  if (source && source !== declaredSource) return EMPTY_FETCH;

  const search = text(q.search);
  const taxon = text(q.taxon);
  const createdAt = dateRange(q.from, q.to);

  const where: Prisma.FishAnalysisWhereInput = {
    AND: [
      ...(search
        ? [{ OR: [{ species: { contains: search } }, { notes: { contains: search } }] }]
        : []),
      ...(taxon ? [{ species: { contains: taxon } }] : []),
      ...(createdAt ? [{ createdAt }] : []),
    ],
  };

  const [rows, total] = await Promise.all([
    db.fishAnalysis.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS_PER_DATASET,
      // NO PII: owner identity + stored image payload are never selected.
      select: {
        id: true,
        species: true,
        confidence: true,
        sizeRange: true,
        weightRange: true,
        qualityWarning: true,
        createdAt: true,
      },
    }),
    db.fishAnalysis.count({ where }),
  ]);

  return {
    total,
    records: rows.map((r) => ({
      id: r.id,
      datasetKey: "fish-analyses",
      datasetName: meta?.name ?? "Fish species predictions",
      domainKey: "fisheries",
      domainLabel: "Fisheries",
      title: r.species || "Unidentified species record",
      taxon: r.species,
      location: null,
      latitude: null,
      longitude: null,
      occurredAt: r.createdAt.toISOString(),
      source: declaredSource,
      status: meta?.status ?? "active",
      details: [
        { label: "Record type", value: "AI fish-species prediction (VLM)" },
        {
          label: "Confidence",
          value:
            typeof r.confidence === "number" && Number.isFinite(r.confidence)
              ? `${Math.round(r.confidence * 100)}%`
              : "Not recorded",
        },
        { label: "Size range", value: r.sizeRange || "Not recorded" },
        { label: "Weight range", value: r.weightRange || "Not recorded" },
        { label: "Quality warning", value: r.qualityWarning || "None" },
      ],
    })),
  };
}
async function fetchSeaConditions(q: ExplorerQuery): Promise<DatasetFetch> {
  // SeaCondition stores no species/taxon column → a taxon filter cannot match.
  if (text(q.taxon)) return EMPTY_FETCH;

  const search = text(q.search);
  const location = text(q.location);
  const source = text(q.source);
  const recordedAt = dateRange(q.from, q.to);

  const where: Prisma.SeaConditionWhereInput = {
    AND: [
      ...(search
        ? [{ OR: [{ locationLabel: { contains: search } }, { source: { contains: search } }] }]
        : []),
      ...(location ? [{ locationLabel: { contains: location } }] : []),
      ...(source ? [{ source }] : []),
      ...(recordedAt ? [{ recordedAt }] : []),
    ],
  };

  const [rows, total] = await Promise.all([
    db.seaCondition.findMany({
      where,
      orderBy: { recordedAt: "desc" },
      take: MAX_ROWS_PER_DATASET,
      select: {
        id: true,
        latitude: true,
        longitude: true,
        locationLabel: true,
        source: true,
        isDemo: true,
        recordedAt: true,
        payload: true,
      },
    }),
    db.seaCondition.count({ where }),
  ]);

  const meta = getDatasetMeta("sea-conditions");
  return {
    total,
    records: rows.map((r) => ({
      id: r.id,
      datasetKey: "sea-conditions",
      datasetName: meta?.name ?? "Sea conditions",
      domainKey: "oceanographic",
      domainLabel: "Oceanographic",
      title: r.locationLabel || "Sea-condition snapshot",
      taxon: null,
      location: r.locationLabel,
      latitude: r.latitude,
      longitude: r.longitude,
      occurredAt: r.recordedAt.toISOString(),
      source: r.source,
      status: meta?.status ?? "active",
      details: [
        { label: "Record type", value: "Environmental sea-condition snapshot" },
        {
          label: "Record state",
          value: r.isDemo ? "Demo record (offline sample)" : "Live observation",
        },
        ...payloadParams(r.payload),
      ],
    })),
  };
}

async function fetchFishingSpots(q: ExplorerQuery): Promise<DatasetFetch> {
  const search = text(q.search);
  const location = text(q.location);
  const taxon = text(q.taxon);
  const source = text(q.source);
  const createdAt = dateRange(q.from, q.to);

  const where: Prisma.FishingSpotWhereInput = {
    AND: [
      ...(search
        ? [
            {
              OR: [
                { name: { contains: search } },
                { region: { contains: search } },
                { species: { contains: search } },
              ],
            },
          ]
        : []),
      ...(location
        ? [{ OR: [{ region: { contains: location } }, { name: { contains: location } }] }]
        : []),
      ...(taxon ? [{ species: { contains: taxon } }] : []),
      ...(source ? [{ source }] : []),
      ...(createdAt ? [{ createdAt }] : []),
    ],
  };

  const [rows, total] = await Promise.all([
    db.fishingSpot.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS_PER_DATASET,
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        region: true,
        species: true,
        depthM: true,
        bottomType: true,
        source: true,
        createdAt: true,
      },
    }),
    db.fishingSpot.count({ where }),
  ]);

  const meta = getDatasetMeta("fishing-spots");
  return {
    total,
    records: rows.map((r) => ({
      id: r.id,
      datasetKey: "fishing-spots",
      datasetName: meta?.name ?? "Fishing spot registry",
      domainKey: "fisheries",
      domainLabel: "Fisheries",
      title: r.name,
      taxon: r.species || null,
      location: r.region || r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      occurredAt: r.createdAt.toISOString(),
      source: r.source,
      status: meta?.status ?? "active",
      details: [
        { label: "Record type", value: "Curated fishing harbour / port" },
        { label: "Region", value: r.region || "Not recorded" },
        { label: "Species noted", value: r.species || "Not recorded" },
        {
          label: "Depth (m)",
          value: typeof r.depthM === "number" ? r.depthM.toFixed(1) : "Not recorded",
        },
        { label: "Bottom type", value: r.bottomType || "Not recorded" },
      ],
    })),
  };
}

async function fetchWeatherAlerts(q: ExplorerQuery): Promise<DatasetFetch> {
  // WeatherAlert stores no species/taxon column → a taxon filter cannot match.
  if (text(q.taxon)) return EMPTY_FETCH;

  const search = text(q.search);
  const location = text(q.location);
  const source = text(q.source);
  const startTime = dateRange(q.from, q.to);

  const where: Prisma.WeatherAlertWhereInput = {
    AND: [
      ...(search
        ? [
            {
              OR: [
                { title: { contains: search } },
                { location: { contains: search } },
                { type: { contains: search } },
                { severity: { contains: search } },
              ],
            },
          ]
        : []),
      ...(location ? [{ location: { contains: location } }] : []),
      ...(source ? [{ source }] : []),
      ...(startTime ? [{ startTime }] : []),
    ],
  };

  const [rows, total] = await Promise.all([
    db.weatherAlert.findMany({
      where,
      orderBy: { startTime: "desc" },
      take: MAX_ROWS_PER_DATASET,
      select: {
        id: true,
        title: true,
        type: true,
        severity: true,
        description: true,
        location: true,
        latitude: true,
        longitude: true,
        metric: true,
        actualValue: true,
        thresholdValue: true,
        status: true,
        source: true,
        startTime: true,
        endTime: true,
      },
    }),
    db.weatherAlert.count({ where }),
  ]);

  const meta = getDatasetMeta("alerts");
  return {
    total,
    records: rows.map((r) => ({
      id: r.id,
      datasetKey: "alerts",
      datasetName: meta?.name ?? "Weather alert log",
      domainKey: "oceanographic",
      domainLabel: "Oceanographic",
      title: r.title,
      taxon: null,
      location: r.location,
      latitude: r.latitude,
      longitude: r.longitude,
      occurredAt: r.startTime.toISOString(),
      source: r.source,
      // Alerts carry their own lifecycle status — more useful than registry status.
      status: r.status,
      details: [
        { label: "Record type", value: `Weather / marine alert (${r.type})` },
        { label: "Severity", value: r.severity },
        { label: "Description", value: r.description },
        { label: "Metric", value: r.metric || "Not recorded" },
        { label: "Observed value", value: r.actualValue || "Not recorded" },
        { label: "Threshold", value: r.thresholdValue || "Not recorded" },
        { label: "Window start", value: r.startTime.toISOString() },
        { label: "Window end", value: r.endTime ? r.endTime.toISOString() : "Not recorded" },
      ],
    })),
  };
}

const FETCHERS: Record<string, (q: ExplorerQuery) => Promise<DatasetFetch>> = {
  "sea-conditions": fetchSeaConditions,
  "fish-analyses": fetchFishAnalyses,
  "fishing-spots": fetchFishingSpots,
  alerts: fetchWeatherAlerts,
};

// ── Facets (real values only) ────────────────────────────────────────────────

/** Domain filters with live record counts for the domain selector. */
export async function explorerDomains(): Promise<ExplorerDomainInfo[]> {
  const [sea, fish, spots, alerts] = await Promise.all([
    db.seaCondition.count(),
    db.fishAnalysis.count(),
    db.fishingSpot.count(),
    db.weatherAlert.count(),
  ]);
  const counts: Record<string, number> = {
    "sea-conditions": sea,
    "fish-analyses": fish,
    "fishing-spots": spots,
    alerts,
  };

  return EXPLORER_DOMAINS.map((d) => ({
    key: d.key,
    label: d.label,
    datasetKeys: d.datasetKeys,
    note: d.note ?? null,
    hasSource: d.datasetKeys.length > 0,
    recordCount: d.datasetKeys.reduce((sum, key) => sum + (counts[key] ?? 0), 0),
  }));
}

/** Distinct source values that actually exist in the stored records. */
export async function explorerSources(): Promise<string[]> {
  const [sea, spots, alerts] = await Promise.all([
    db.seaCondition.findMany({ distinct: ["source"], select: { source: true } }),
    db.fishingSpot.findMany({ distinct: ["source"], select: { source: true } }),
    db.weatherAlert.findMany({ distinct: ["source"], select: { source: true } }),
  ]);

  const set = new Set<string>();
  for (const row of [...sea, ...spots, ...alerts]) {
    if (row.source) set.add(row.source);
  }
  // FishAnalysis rows have no source column — their provenance is the registry value.
  const fishMeta = getDatasetMeta("fish-analyses");
  if (fishMeta) set.add(fishMeta.source);

  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// ── Unified search ───────────────────────────────────────────────────────────

/**
 * Search + filter marine records across the selected domains/datasets.
 * Reads from existing tables only; `total` is an exact match count.
 */
export async function searchMarineRecords(q: ExplorerQuery = {}): Promise<ExplorerResult> {
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(q.pageSize) || DEFAULT_PAGE_SIZE)));

  const domainKeys = datasetKeysFor(text(q.domain));
  const requestedDataset = text(q.dataset);
  const keys = requestedDataset ? domainKeys.filter((k) => k === requestedDataset) : domainKeys;

  const [domains, sources] = await Promise.all([explorerDomains(), explorerSources()]);

  if (keys.length === 0) {
    // e.g. the eDNA domain (no backing source yet) or a domain/dataset mismatch.
    return { records: [], total: 0, page, pageSize, truncated: false, domains, sources };
  }

  const results = await Promise.all(keys.map((key) => FETCHERS[key](q)));
  const total = results.reduce((sum, r) => sum + r.total, 0);
  const truncated = results.some((r) => r.total > MAX_ROWS_PER_DATASET);

  const merged = results
    .flatMap((r) => r.records)
    .sort((a, b) => {
      const av = a.occurredAt ? Date.parse(a.occurredAt) : 0;
      const bv = b.occurredAt ? Date.parse(b.occurredAt) : 0;
      return bv - av;
    });

  const start = (page - 1) * pageSize;

  return {
    records: merged.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    truncated,
    domains,
    sources,
  };
}
