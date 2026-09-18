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
  createdAt: string;
}
