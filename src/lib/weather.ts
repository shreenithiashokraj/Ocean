/**
 * Shared weather & marine data service (backend only).
 *
 * Uses Open-Meteo (free, no API key) for:
 *   - weather forecast  (https://api.open-meteo.com/v1/forecast)
 *   - marine forecast   (https://marine-api.open-meteo.com/v1)
 *   - forward geocoding  (https://geocoding-api.open-meteo.com/v1/search)
 *
 * Falls back to clearly-labeled DEMO data when the API is unreachable so the
 * UI never shows fake data as live data.
 */
import type { SeaConditionData } from "@/lib/types";
import { db } from "@/lib/db";

const WEATHER_URL =
  process.env.OPEN_METEO_WEATHER_URL || "https://api.open-meteo.com/v1/forecast";
const MARINE_URL =
  process.env.OPEN_METEO_MARINE_URL || "https://marine-api.open-meteo.com/v1";
const GEO_URL =
  process.env.OPEN_METEO_GEO_URL || "https://geocoding-api.open-meteo.com/v1/search";

// ── WMO weather interpretation codes (Open-Meteo uses these) ────────────────
const WMO: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export function wmoCodeToText(code: number | null | undefined): string | null {
  if (code == null) return null;
  return WMO[code] ?? "Unknown";
}

/** Demo/offline payload — clearly labeled, never shown as live. */
function demoPayload(lat: number, lng: number): SeaConditionData {
  return {
    location: { lat, lng, label: "Demo location (offline)" },
    airTemperature: 29,
    weatherCode: 2,
    weatherText: "Partly cloudy (demo data)",
    windSpeed: 14,
    windDirection: 90,
    windGusts: 22,
    waveHeight: 1.2,
    wavePeriod: 6,
    seaSurfaceTemperature: 28,
    visibility: 10000,
    pressure: 1010,
    humidity: 72,
    precipitation: 0.2,
    hourly: null,
  };
}

interface FetchResult {
  data: SeaConditionData;
  isDemo: boolean;
  source: string;
  recordedAt: string | null;
  error?: string;
}

/** Fetch combined weather + marine data for a coordinate. */
export async function fetchWeatherMarine(lat: number, lng: number): Promise<FetchResult> {
  const weatherParams = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current:
      [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "is_day",
        "precipitation",
        "weather_code",
        "cloud_cover",
        "pressure_msl",
        "wind_speed_10m",
        "wind_direction_10m",
        "wind_gusts_10m",
      ].join(","),
    hourly: ["wave_height", "wind_speed_10m", "temperature_2m", "precipitation"].join(","),
    daily:
      [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "sunrise",
        "sunset",
        "precipitation_sum",
      ].join(","),
    timezone: "auto",
    forecast_days: "1",
  });

  const marineParams = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current:
      [
        "wave_height",
        "wave_direction",
        "wave_period",
        "sea_surface_temperature",
      ].join(","),
    hourly: ["wave_height", "wave_period"].join(","),
    timezone: "auto",
    forecast_days: "1",
  });

  try {
    const [weatherRes, marineRes] = await Promise.all([
      fetch(`${WEATHER_URL}?${weatherParams.toString()}`, {
        headers: { Accept: "application/json" },
        // @ts-ignore — cache is a valid fetch option in server runtimes
        cache: "no-store",
        next: { revalidate: 0 },
      }),
      fetch(`${MARINE_URL}?${marineParams.toString()}`, {
        headers: { Accept: "application/json" },
        // @ts-ignore
        cache: "no-store",
        next: { revalidate: 0 },
      }),
    ]);

    if (!weatherRes.ok) throw new Error(`weather API ${weatherRes.status}`);
    const weather = await weatherRes.json();

    // Marine endpoint only covers sea areas; inland coords return 404/empty.
    let marine: Record<string, unknown> | null = null;
    if (marineRes.ok) {
      marine = (await marineRes.json()) as Record<string, unknown>;
    }

    const cur = (weather.current ?? {}) as Record<string, number>;
    const daily = (weather.daily ?? {}) as Record<string, unknown>;
    const utcOffset = (weather.utc_offset_seconds ?? 0) as number;

    const sunriseArr = (daily.sunrise ?? []) as string[];
    const sunsetArr = (daily.sunset ?? []) as string[];

    const seaCur = (marine?.current ?? {}) as Record<string, number>;
    const waveHeight = seaCur.wave_height ?? null;
    const waveDirection = seaCur.wave_direction ?? null;
    const wavePeriod = seaCur.wave_period ?? null;
    const sst = seaCur.sea_surface_temperature ?? null;

    const data: SeaConditionData = {
      location: { lat, lng },
      airTemperature: cur.temperature_2m ?? null,
      weatherCode: cur.weather_code ?? null,
      weatherText: wmoCodeToText(cur.weather_code ?? null),
      windSpeed: cur.wind_speed_10m ?? null,
      windDirection: cur.wind_direction_10m ?? null,
      windGusts: cur.wind_gusts_10m ?? null,
      waveHeight,
      waveDirection,
      wavePeriod,
      seaSurfaceTemperature: sst,
      visibility: null, // Open-Meteo forecast doesn't include visibility in free tier
      pressure: cur.pressure_msl ?? null,
      humidity: cur.relative_humidity_2m ?? null,
      precipitation: cur.precipitation ?? null,
      sunrise: sunriseArr[0] ?? null,
      sunset: sunsetArr[0] ?? null,
      utcOffsetSeconds: utcOffset,
      hourly: {
        time: (weather.hourly?.time ?? []) as string[],
        waveHeight: marine?.hourly
          ? ((marine.hourly as Record<string, number[]>).wave_height ?? [])
          : [],
        windSpeed: (weather.hourly?.wind_speed_10m ?? []) as number[],
        airTemperature: (weather.hourly?.temperature_2m ?? []) as number[],
        precipitation: (weather.hourly?.precipitation ?? []) as number[],
      },
      raw: { weather, marine },
    };

    return {
      data,
      isDemo: false,
      source: "open-meteo",
      recordedAt: (cur.time as string) ?? new Date().toISOString(),
    };
  } catch (err) {
    // Offline / API failure → clearly labeled demo data
    return {
      data: demoPayload(lat, lng),
      isDemo: true,
      source: "offline (demo)",
      recordedAt: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Reverse geocode lat/lng → "City, Country" label (BigDataCloud, free, no key). */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    const res = await fetch(url, {
      // @ts-ignore
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`geocode ${res.status}`);
    const j = (await res.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
      countryName?: string;
    };
    const parts = [j.city || j.locality, j.principalSubdivision, j.countryName].filter(
      Boolean
    ) as string[];
    return parts.length ? parts.join(", ") : `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  } catch {
    return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  }
}

/** Forward geocode a place name → candidate matches (Open-Meteo geocoding). */
export async function forwardGeocode(q: string): Promise<
  { name: string; lat: number; lng: number; country?: string; region?: string }[]
> {
  if (!q.trim()) return [];
  try {
    const url = `${GEO_URL}?name=${encodeURIComponent(q)}&count=6&language=en&format=json`;
    const res = await fetch(url, {
      // @ts-ignore
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];
    const j = (await res.json()) as {
      results?: {
        name: string;
        latitude: number;
        longitude: number;
        country?: string;
        admin1?: string;
      }[];
    };
    return (j.results ?? []).map((r) => ({
      name: r.name,
      lat: r.latitude,
      lng: r.longitude,
      country: r.country,
      region: r.admin1,
    }));
  } catch {
    return [];
  }
}

/** Log an external API call to the api_logs table (best-effort). */
export async function logApiCall(input: {
  userId?: string | null;
  service: string;
  endpoint: string;
  method?: string;
  status: number;
  durationMs?: number;
  message?: string;
}) {
  try {
    await db.apiLog.create({
      data: {
        userId: input.userId ?? null,
        service: input.service,
        endpoint: input.endpoint,
        method: input.method ?? "GET",
        status: input.status,
        durationMs: input.durationMs ?? null,
        message: input.message ?? null,
      },
    });
  } catch {
    /* logging must never break the request */
  }
}
