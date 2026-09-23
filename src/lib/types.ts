// Shared TypeScript types used across the Fisherman Module.

export interface FishAnalysisResult {
  species: string | null;
  confidence: number | null; // 0..1
  alternatives: { species: string; confidence: number }[] | null;
  sizeRange: string | null;
  weightRange: string | null;
  characteristics: string[] | null;
  notes: string | null;
  qualityWarning: string | null;
  market?: {
    pricePerKg: string | null;
    currency: string | null;
    market: string | null;
    priceDate: string | null;
    source: string | null;
  } | null;
}

export interface SeaConditionData {
  location?: { lat: number; lng: number; label?: string } | null;
  airTemperature?: number | null;
  weatherCode?: number | null;
  weatherText?: string | null;
  windSpeed?: number | null; // km/h
  windDirection?: number | null; // degrees
  windGusts?: number | null;
  waveHeight?: number | null; // m
  wavePeriod?: number | null; // s
  waveDirection?: number | null;
  seaSurfaceTemperature?: number | null;
  visibility?: number | null; // m
  pressure?: number | null; // hPa
  humidity?: number | null; // %
  precipitation?: number | null; // mm
  sunrise?: string | null;
  sunset?: string | null;
  utcOffsetSeconds?: number | null;
  hourly?: {
    time: string[];
    waveHeight?: number[];
    windSpeed?: number[];
    airTemperature?: number[];
    precipitation?: number[];
  } | null;
  raw?: unknown;
}

export type AlertSeverity = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type AlertType =
  | "WIND"
  | "WAVE"
  | "RAIN"
  | "STORM"
  | "VISIBILITY"
  | "SEA_STATE"
  | "TEMPERATURE";
/** Phase 2: alert lifecycle. */
export type AlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "EXPIRED" | "RESOLVED";

export interface WeatherAlert {
  id: string;
  title: string;
  type: AlertType;
  severity: AlertSeverity;
  description: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  startTime: string;
  endTime: string | null;
  source: string;
  isRead: boolean;
  /** Phase 2: lifecycle + metric context */
  status: AlertStatus;
  metric: string | null;
  actualValue: string | null;
  thresholdValue: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

/** Phase 2: notification with severity + related alert. */
export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string; // info | success | warning | alert
  severity: AlertSeverity | null;
  category: string; // general | alert | system | analysis
  alertId: string | null;
  isRead: boolean;
  createdAt: string;
}

/** Phase 3: catch-logging record (mirrors the /api/catches DTO). */
export interface CatchRecord {
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

export interface CatchRecordInput {
  date: string;
  time?: string | null;
  species: string;
  quantity: number;
  unit: string;
  averageSize?: number | null;
  averageSizeUnit?: string;
  estimatedWeight?: number | null;
  bycatch?: boolean;
  bycatchSpecies?: string | null;
  location: string;
  notes?: string | null;
  photoDataUrl?: string | null;
}

/** Phase 3: SOS / emergency event (mirrors the /api/sos DTO). */
export interface SosEvent {
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

export interface SosEventInput {
  latitude?: number | null;
  longitude?: number | null;
  gpsAvailable: boolean;
  accuracyM?: number | null;
  locationLabel?: string | null;
  message?: string | null;
}
