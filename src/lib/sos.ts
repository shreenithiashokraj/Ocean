/**
 * SOS / emergency helpers (backend only).
 * DTO shape shared by /api/sos routes.
 */

export interface SosEventDTO {
  id: string;
  latitude: number | null;
  longitude: number | null;
  gpsAvailable: boolean;
  accuracyM: number | null;
  locationLabel: string | null;
  locationText: string;
  timestamp: string;
  status: string; // ACTIVE | RESOLVED | CANCELLED
  message: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  fishermanName: string | null;
  contactPhone: string | null;
  createdAt: string;
}

type SosRow = {
  id: string;
  latitude: number | null;
  longitude: number | null;
  gpsAvailable: boolean;
  accuracyM: number | null;
  locationLabel: string | null;
  timestamp: Date;
  status: string;
  message: string | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  createdAt: Date;
  user?: { name: string; email: string; profile?: { phone: string | null } | null } | null;
};

function fmtCoord(v: number | null, pos: string, neg: string): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`;
}

/** Map a Prisma SosAlert row (with user + profile) to the API shape. */
export function serializeSosEvent(r: SosRow): SosEventDTO {
  const latText = fmtCoord(r.latitude, "N", "S");
  const lngText = fmtCoord(r.longitude, "E", "W");
  const coords =
    latText && lngText
      ? `${latText}, ${lngText}`
      : r.gpsAvailable
        ? "GPS reported but coordinates missing"
        : "Location unavailable";
  return {
    id: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    gpsAvailable: r.gpsAvailable,
    accuracyM: r.accuracyM,
    locationLabel: r.locationLabel,
    locationText: r.locationLabel ? `${r.locationLabel} · ${coords}` : coords,
    timestamp: r.timestamp.toISOString(),
    status: r.status,
    message: r.message ?? "",
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    resolvedBy: r.resolvedBy,
    fishermanName: r.user?.name ?? null,
    contactPhone: r.user?.profile?.phone ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

const VALID_STATUS = new Set(["ACTIVE", "RESOLVED", "CANCELLED"]);

export function isValidSosStatus(v: unknown): v is string {
  return typeof v === "string" && VALID_STATUS.has(v);
}
