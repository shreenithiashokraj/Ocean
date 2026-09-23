/**
 * Catch-logging helpers (backend only).
 * DTO shape + input validation shared by /api/catches routes.
 */

export interface CatchRecordDTO {
  id: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:mm
  species: string;
  quantity: number;
  unit: string; // kg | count
  averageSize: number | null;
  averageSizeUnit: string; // cm | in
  estimatedWeight: number | null; // kg
  catchType: string; // CATCH | BYCATCH
  bycatch: boolean;
  bycatchSpecies: string | null;
  location: string;
  notes: string;
  photoDataUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

type CatchRow = {
  id: string;
  date: Date;
  time: string | null;
  species: string;
  quantity: number;
  unit: string;
  averageSize: number | null;
  averageSizeUnit: string;
  estimatedWeight: number | null;
  catchType: string;
  bycatchSpecies: string | null;
  location: string;
  notes: string | null;
  photoDataUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Map a Prisma CatchRecord row to the API shape. */
export function serializeCatchRecord(r: CatchRow): CatchRecordDTO {
  return {
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    time: r.time,
    species: r.species,
    quantity: r.quantity,
    unit: r.unit,
    averageSize: r.averageSize,
    averageSizeUnit: r.averageSizeUnit,
    estimatedWeight: r.estimatedWeight,
    catchType: r.catchType,
    bycatch: r.catchType === "BYCATCH",
    bycatchSpecies: r.bycatchSpecies,
    location: r.location,
    notes: r.notes ?? "",
    photoDataUrl: r.photoDataUrl,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export interface ValidatedCatchInput {
  date: Date;
  time: string | null;
  species: string;
  quantity: number;
  unit: string;
  averageSize: number | null;
  averageSizeUnit: string;
  estimatedWeight: number | null;
  catchType: string;
  bycatchSpecies: string | null;
  location: string;
  notes: string | null;
  photoDataUrl: string | null;
}

const VALID_UNITS = new Set(["kg", "count"]);
const VALID_SIZE_UNITS = new Set(["cm", "in"]);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validate + normalize the catch form payload. */
export function validateCatchInput(body: Record<string, unknown>): {
  data?: ValidatedCatchInput;
  error?: string;
} {
  const dateRaw = typeof body.date === "string" ? body.date.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return { error: "Date is required (YYYY-MM-DD)" };
  }
  // Calendar date, stored at UTC midnight so it never drifts across timezones.
  const date = new Date(`${dateRaw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return { error: "Date is invalid" };
  }

  const timeRaw =
    body.time == null || body.time === ""
      ? null
      : typeof body.time === "string"
        ? body.time.trim()
        : "";
  const time = timeRaw === "" ? null : timeRaw;
  if (time !== null && (time === "" || !TIME_RE.test(time))) {
    return { error: "Time must be HH:mm (24-hour)" };
  }

  const species = typeof body.species === "string" ? body.species.trim() : "";
  if (species.length < 2) {
    return { error: "Fish/species name must be at least 2 characters" };
  }

  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: "Quantity must be a number greater than 0" };
  }

  const unitRaw =
    typeof body.unit === "string" ? body.unit.trim().toLowerCase() : "kg";
  if (!VALID_UNITS.has(unitRaw)) {
    return { error: "Unit must be kg or count" };
  }

  const bycatch = body.bycatch === true || body.catchType === "BYCATCH";
  const catchType = bycatch ? "BYCATCH" : "CATCH";

  const averageSize =
    body.averageSize == null || body.averageSize === ""
      ? null
      : Number(body.averageSize);
  if (averageSize !== null && (!Number.isFinite(averageSize) || averageSize <= 0)) {
    return { error: "Average size must be a number greater than 0" };
  }
  const sizeUnitRaw =
    typeof body.averageSizeUnit === "string"
      ? body.averageSizeUnit.trim().toLowerCase()
      : "cm";
  const averageSizeUnit = VALID_SIZE_UNITS.has(sizeUnitRaw) ? sizeUnitRaw : "cm";

  const estimatedWeight =
    body.estimatedWeight == null || body.estimatedWeight === ""
      ? null
      : Number(body.estimatedWeight);
  if (
    estimatedWeight !== null &&
    (!Number.isFinite(estimatedWeight) || estimatedWeight < 0)
  ) {
    return { error: "Estimated weight must be 0 or more" };
  }

  const location = typeof body.location === "string" ? body.location.trim() : "";
  if (location.length < 2) {
    return { error: "Fishing location is required" };
  }

  const bycatchSpecies =
    typeof body.bycatchSpecies === "string" && body.bycatchSpecies.trim()
      ? body.bycatchSpecies.trim().slice(0, 120)
      : null;

  const notes =
    typeof body.notes === "string" && body.notes.trim()
      ? body.notes.trim().slice(0, 2000)
      : null;

  // Optional photo. Same data-URL pattern as FishAnalysis.imageDataUrl.
  // Guard the payload size (~1.5 MB encoded) so SQLite rows stay small.
  let photoDataUrl: string | null = null;
  if (typeof body.photoDataUrl === "string" && body.photoDataUrl.trim()) {
    const v = body.photoDataUrl.trim();
    if (!v.startsWith("data:image/")) {
      return { error: "Photo must be an image data URL" };
    }
    if (v.length > 2_000_000) {
      return { error: "Photo is too large (max ~1.5 MB)" };
    }
    photoDataUrl = v;
  }

  return {
    data: {
      date,
      time,
      species: species.slice(0, 120),
      quantity,
      unit: unitRaw,
      averageSize,
      averageSizeUnit,
      estimatedWeight,
      catchType,
      bycatchSpecies,
      location: location.slice(0, 200),
      notes,
      photoDataUrl,
    },
  };
}
