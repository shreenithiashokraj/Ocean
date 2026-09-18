/**
 * Research dataset registry (backend only).
 *
 * The Researcher Data Explorer lists REAL, queryable datasets. Rather than
 * fabricating scientific datasets, this registry describes the actual data
 * sources already persisted in the database (environmental sea-condition
 * snapshots, AI fish-analysis predictions, curated fishing spots, and weather
 * alerts). Each entry has a stable `key`, human metadata, and a `count` /
 * `preview` accessor backed by a real Prisma query.
 *
 * When a dataset is empty, the UI shows a useful empty state explaining what
 * data is required — never a fabricated table of numbers.
 */
import { db } from "@/lib/db";

export interface DatasetMeta {
  key: string;
  name: string;
  description: string;
  dataType: string; // Oceanographic | Fisheries | Taxonomy | etc.
  source: string;
  status: "active" | "archived";
  /** fields available for filtering in the explorer */
  fields: { key: string; label: string; type: "text" | "number" | "date" | "enum"; options?: string[] }[];
}

export const DATASET_REGISTRY: DatasetMeta[] = [
  {
    key: "sea-conditions",
    name: "Marine & Weather Observations",
    description:
      "Environmental sea-condition snapshots recorded by fishermen and the live Open-Meteo integration. Temperature, wind, waves, pressure and more.",
    dataType: "Oceanographic",
    source: "Open-Meteo + Fisherman Module",
    status: "active",
    fields: [
      { key: "locationLabel", label: "Location", type: "text" },
      { key: "source", label: "Source", type: "enum", options: ["open-meteo", "offline (demo)"] },
      { key: "isDemo", label: "Demo", type: "enum", options: ["true", "false"] },
      { key: "recordedAt", label: "Recorded", type: "date" },
    ],
  },
  {
    key: "fish-analyses",
    name: "Fish Species Predictions",
    description:
      "AI-generated fish species predictions (VLM) with confidence scores, size/weight estimates and characteristics. Aggregate research view — individual fisherman identities are not exposed.",
    dataType: "Fisheries",
    source: "z-ai-web-dev-sdk VLM",
    status: "active",
    fields: [
      { key: "species", label: "Species", type: "text" },
      { key: "confidence", label: "Confidence", type: "number" },
      { key: "createdAt", label: "Date", type: "date" },
    ],
  },
  {
    key: "fishing-spots",
    name: "Fishing Spot Registry",
    description:
      "Curated real-world fishing harbours and ports with coordinates, region and bottom type. No fabricated fish-population counts.",
    dataType: "Fisheries",
    source: "OpenStreetMap",
    status: "active",
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "region", label: "Region", type: "text" },
      { key: "bottomType", label: "Bottom", type: "enum", options: ["sand", "reef", "rocky", "mud"] },
    ],
  },
  {
    key: "alerts",
    name: "Weather Alert Log",
    description:
      "System-generated weather and marine alerts with severity, lifecycle status, metric values and thresholds. Useful for historical safety analysis.",
    dataType: "Oceanographic",
    source: "Fisherman Module Alert Engine",
    status: "active",
    fields: [
      { key: "severity", label: "Severity", type: "enum", options: ["LOW", "MODERATE", "HIGH", "CRITICAL"] },
      { key: "type", label: "Type", type: "enum", options: ["WIND", "WAVE", "RAIN", "STORM", "VISIBILITY", "SEA_STATE", "TEMPERATURE"] },
      { key: "status", label: "Status", type: "enum", options: ["ACTIVE", "ACKNOWLEDGED", "EXPIRED", "RESOLVED"] },
      { key: "createdAt", label: "Created", type: "date" },
    ],
  },
];

export function getDatasetMeta(key: string): DatasetMeta | undefined {
  return DATASET_REGISTRY.find((d) => d.key === key);
}

/** Live record count for a dataset (real DB query). */
export async function datasetCount(key: string): Promise<number> {
  switch (key) {
    case "sea-conditions":
      return db.seaCondition.count();
    case "fish-analyses":
      return db.fishAnalysis.count();
    case "fishing-spots":
      return db.fishingSpot.count();
    case "alerts":
      return db.weatherAlert.count();
    default:
      return 0;
  }
}

/** Geographic coverage bounds (min/max lat/lng) for a dataset — real query. */
export async function datasetBounds(
  key: string
): Promise<{ minLat: number; maxLat: number; minLng: number; maxLng: number } | null> {
  switch (key) {
    case "sea-conditions": {
      const rows = await db.seaCondition.findMany({
        where: { AND: [{ latitude: { gte: -90 } }, { longitude: { gte: -180 } }] },
        select: { latitude: true, longitude: true },
        take: 5000,
      });
      if (!rows.length) return null;
      return bounds(rows.map((r) => ({ lat: r.latitude, lng: r.longitude })));
    }
    case "fishing-spots": {
      const rows = await db.fishingSpot.findMany({ select: { latitude: true, longitude: true } });
      if (!rows.length) return null;
      return bounds(rows.map((r) => ({ lat: r.latitude, lng: r.longitude })));
    }
    case "alerts": {
      const rows = await db.weatherAlert.findMany({
        where: { AND: [{ latitude: { not: null } }, { longitude: { not: null } }] },
        select: { latitude: true, longitude: true },
      });
      const pts = rows
        .filter((r) => r.latitude != null && r.longitude != null)
        .map((r) => ({ lat: r.latitude!, lng: r.longitude! }));
      if (!pts.length) return null;
      return bounds(pts);
    }
    default:
      return null;
  }
}

function bounds(pts: { lat: number; lng: number }[]) {
  return {
    minLat: Math.min(...pts.map((p) => p.lat)),
    maxLat: Math.max(...pts.map((p) => p.lat)),
    minLng: Math.min(...pts.map((p) => p.lng)),
    maxLng: Math.max(...pts.map((p) => p.lng)),
  };
}

/** Paginated preview rows for a dataset — real query, no PII for fish-analyses. */
export async function datasetPreview(
  key: string,
  opts: { page: number; pageSize: number; search?: string }
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const page = Math.max(1, opts.page);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize));
  const skip = (page - 1) * pageSize;
  const search = opts.search?.trim();

  switch (key) {
    case "sea-conditions": {
      const where = search
        ? {
            OR: [
              { locationLabel: { contains: search } },
              { source: { contains: search } },
            ],
          }
        : {};
      const [rows, total] = await Promise.all([
        db.seaCondition.findMany({
          where,
          orderBy: { recordedAt: "desc" },
          skip,
          take: pageSize,
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
      return {
        rows: rows.map((r) => ({
          id: r.id,
          latitude: r.latitude,
          longitude: r.longitude,
          locationLabel: r.locationLabel,
          source: r.source,
          isDemo: r.isDemo,
          recordedAt: r.recordedAt.toISOString(),
          // parsed summary of payload (no PII — environmental only)
          summary: safeSummary(r.payload),
        })),
        total,
      };
    }
    case "fish-analyses": {
      // NO PII: omit userId/user. Aggregate research view only.
      const where = search
        ? {
            OR: [{ species: { contains: search } }, { notes: { contains: search } }],
          }
        : {};
      const [rows, total] = await Promise.all([
        db.fishAnalysis.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
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
        rows: rows.map((r) => ({
          id: r.id,
          species: r.species,
          confidence: r.confidence,
          sizeRange: r.sizeRange,
          weightRange: r.weightRange,
          qualityWarning: r.qualityWarning,
          createdAt: r.createdAt.toISOString(),
        })),
        total,
      };
    }
    case "fishing-spots": {
      const where = search
        ? {
            OR: [
              { name: { contains: search } },
              { region: { contains: search } },
            ],
          }
        : {};
      const [rows, total] = await Promise.all([
        db.fishingSpot.findMany({
          where,
          orderBy: { name: "asc" },
          skip,
          take: pageSize,
          select: {
            id: true,
            name: true,
            latitude: true,
            longitude: true,
            region: true,
            depthM: true,
            bottomType: true,
            source: true,
          },
        }),
        db.fishingSpot.count({ where }),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          name: r.name,
          latitude: r.latitude,
          longitude: r.longitude,
          region: r.region,
          depthM: r.depthM,
          bottomType: r.bottomType,
          source: r.source,
        })),
        total,
      };
    }
    case "alerts": {
      const where = search
        ? {
            OR: [
              { title: { contains: search } },
              { location: { contains: search } },
              { type: { contains: search } },
              { severity: { contains: search } },
            ],
          }
        : {};
      const [rows, total] = await Promise.all([
        db.weatherAlert.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
          select: {
            id: true,
            title: true,
            type: true,
            severity: true,
            status: true,
            location: true,
            latitude: true,
            longitude: true,
            metric: true,
            actualValue: true,
            thresholdValue: true,
            startTime: true,
            endTime: true,
            createdAt: true,
          },
        }),
        db.weatherAlert.count({ where }),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          title: r.title,
          type: r.type,
          severity: r.severity,
          status: r.status,
          location: r.location,
          latitude: r.latitude,
          longitude: r.longitude,
          metric: r.metric,
          actualValue: r.actualValue,
          thresholdValue: r.thresholdValue,
          startTime: r.startTime.toISOString(),
          endTime: r.endTime ? r.endTime.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
        })),
        total,
      };
    }
    default:
      return { rows: [], total: 0 };
  }
}

/** Pull a compact environmental summary out of a SeaCondition payload JSON. */
function safeSummary(payloadStr: string): Record<string, unknown> {
  try {
    const p = JSON.parse(payloadStr) as Record<string, unknown>;
    return {
      airTemperature: p.airTemperature ?? null,
      windSpeed: p.windSpeed ?? null,
      waveHeight: p.waveHeight ?? null,
      weatherText: p.weatherText ?? null,
      pressure: p.pressure ?? null,
      humidity: p.humidity ?? null,
    };
  } catch {
    return {};
  }
}
