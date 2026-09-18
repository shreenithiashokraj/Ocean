"use client";

/**
 * Real-Time Sea Conditions — Fisherman Module view.
 *
 * Client-side view (rendered inside the AppShell single-SPA) that shows the
 * latest Open-Meteo weather + marine snapshot for the user's location (or a
 * searched coastal place), plus a 24-hour forecast chart. Falls back to
 * Chennai (Bay of Bengal) when geolocation is denied or unsupported.
 *
 * Data is fetched through the shared api layer (`api.getSeaConditions`,
 * `api.searchPlaces`) — never fetch()ed directly. When the live API is
 * unreachable the backend returns clearly-labeled demo data (`isDemo: true`)
 * and this view renders a prominent amber notice so fake values are never
 * shown as live.
 */

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Compass,
  Gauge,
  Info,
  LocateFixed,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Snowflake,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Waves,
  Wind,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { api, ApiError } from "@/lib/api";
import type { SeaConditionData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StatCard } from "@/components/common/stat-card";
import {
  CardSkeleton,
  ErrorState,
  Unavailable,
} from "@/components/common/states";

// ── Constants & types ───────────────────────────────────────────────────

const CHENNAI = { lat: 13.0827, lng: 80.2707 };

type RefreshMinutes = "1" | "5" | "15" | "30" | "off";

const REFRESH_OPTIONS: { value: RefreshMinutes; label: string }[] = [
  { value: "1", label: "Every 1 minute" },
  { value: "5", label: "Every 5 minutes" },
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "off", label: "Off" },
];

interface PlaceResult {
  name: string;
  lat: number;
  lng: number;
  country?: string;
  region?: string;
}

interface SeaConditionsResponse {
  data: SeaConditionData;
  isDemo: boolean;
  source: string;
  recordedAt: string | null;
  label: string;
}

interface PlacesResponse {
  results: PlaceResult[];
}

// ── Helpers ─────────────────────────────────────────────────────────────

const COMPASS_POINTS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

function degToCompass(deg: number | null | undefined): string | null {
  if (deg == null || Number.isNaN(deg)) return null;
  return COMPASS_POINTS[Math.round(deg / 22.5) % 16];
}

function fmtNum(n: number | null | undefined, digits = 1): string | null {
  if (n == null || Number.isNaN(n)) return null;
  return n.toFixed(digits);
}

/** Extract "HH:MM" from an open-meteo local-time string like "2024-01-01T06:30". */
function formatHHMM(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (iso.length >= 16) return iso.slice(11, 16);
  return iso;
}

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return "N/A";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

type Safety = "safe" | "caution" | "dangerous" | "unknown";

/** Derive safety status from wind speed (km/h) and wave height (m). */
function deriveStatus(data: SeaConditionData | null): Safety {
  if (!data) return "unknown";
  const wind = data.windSpeed;
  const wave = data.waveHeight;
  if (wind == null && wave == null) return "unknown";
  const w = wind ?? 0;
  const h = wave ?? 0;
  if (w < 25 && h < 1.5) return "safe";
  if (w < 40 && h < 2.5) return "caution";
  return "dangerous";
}

// WMO weather code → lucide icon mapping (Open-Meteo uses WMO codes).
const WEATHER_ICONS: Record<number, typeof Sun> = {
  0: Sun,
  1: CloudSun,
  2: CloudSun,
  3: Cloud,
  45: CloudFog,
  48: CloudFog,
  51: CloudDrizzle, 53: CloudDrizzle, 55: CloudDrizzle, 56: CloudDrizzle, 57: CloudDrizzle,
  61: CloudRain, 63: CloudRain, 65: CloudRain, 66: CloudRain, 67: CloudRain,
  71: Snowflake, 73: Snowflake, 75: Snowflake, 77: Snowflake,
  80: CloudRain, 81: CloudRain, 82: CloudRain,
  85: Snowflake, 86: Snowflake,
  95: CloudLightning, 96: CloudLightning, 99: CloudLightning,
};

function weatherIconFor(code: number | null | undefined) {
  if (code == null) return Cloud;
  return WEATHER_ICONS[code] ?? Cloud;
}

// ── Main component ──────────────────────────────────────────────────────

export function SeaConditionsView() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [label, setLabel] = useState<string>("");
  const [data, setData] = useState<SeaConditionData | null>(null);
  const [isDemo, setIsDemo] = useState<boolean>(false);
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const [source, setSource] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshMinutes, setRefreshMinutes] = useState<RefreshMinutes>("off");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searching, setSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [showResults, setShowResults] = useState<boolean>(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // ── Data fetcher ──────────────────────────────────────────────────
  const fetchData = useCallback(async (lat: number, lng: number, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = (await api.getSeaConditions(lat, lng)) as unknown as SeaConditionsResponse;
      setData(res.data);
      setIsDemo(res.isDemo);
      setRecordedAt(res.recordedAt);
      setSource(res.source);
      setLabel(res.label);
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Failed to fetch sea conditions";
      setError(msg);
      if (!silent) toast.error("Failed to load sea conditions.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // ── On mount: geolocate or fall back to Chennai ───────────────────
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.info("Geolocation is unavailable on this device — showing Chennai by default.");
      setCoords(CHENNAI);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(pos.coords.accuracy ?? null);
      },
      () => {
        toast.info("Location access denied — showing Chennai by default.");
        setCoords(CHENNAI);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  // ── Fetch whenever coords change ─────────────────────────────────
  useEffect(() => {
    if (!coords) return;
    void fetchData(coords.lat, coords.lng);
  }, [coords, fetchData]);

  // ── Auto-refresh interval ─────────────────────────────────────────
  useEffect(() => {
    if (!coords || refreshMinutes === "off") return;
    const ms = Number(refreshMinutes) * 60 * 1000;
    const t = setInterval(() => {
      void fetchData(coords.lat, coords.lng, true);
    }, ms);
    return () => clearInterval(t);
  }, [coords, refreshMinutes, fetchData]);

  // ── Clear search dropdown when query is cleared ─────────────────
  useEffect(() => {
    if (searchQuery === "") {
      setShowResults(false);
      setSearchResults([]);
    }
  }, [searchQuery]);

  // ── Click-outside to dismiss search dropdown ─────────────────────
  useEffect(() => {
    if (!showResults) return;
    function onDocClick(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showResults]);

  // ── "Use my location" button ──────────────────────────────────────
  const useMyLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Geolocation is not supported on this device.");
      return;
    }
    toast.info("Requesting your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(pos.coords.accuracy ?? null);
        toast.success("Using your current location.");
      },
      () => toast.error("Could not access your location."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  // ── Manual place search ───────────────────────────────────────────
  const runSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setShowResults(true);
    try {
      const res = (await api.searchPlaces(q)) as unknown as PlacesResponse;
      setSearchResults(res.results ?? []);
      if ((res.results ?? []).length === 0) {
        toast.info("No matching places found.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Place search failed.");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const pickPlace = useCallback((p: PlaceResult) => {
    setCoords({ lat: p.lat, lng: p.lng });
    setAccuracy(null);
    setShowResults(false);
    setSearchQuery("");
    setSearchResults([]);
    toast.success(`Location set to ${p.name}.`);
  }, []);

  const status = deriveStatus(data);

  // ── Build chart dataset from hourly arrays ───────────────────────
  const chartData = useMemo(() => {
    const hourly = data?.hourly;
    if (!hourly || !hourly.time || hourly.time.length === 0) return [];
    return hourly.time.map((t, i) => ({
      time: t.length >= 16 ? t.slice(11, 16) : t,
      waveHeight: hourly.waveHeight?.[i] ?? null,
      windSpeed: hourly.windSpeed?.[i] ?? null,
    }));
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Real-Time Sea Conditions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live weather & marine data for safer fishing decisions. Source:{" "}
            <span className="font-medium text-foreground">{source || "open-meteo"}</span>
            {recordedAt && (
              <span className="text-muted-foreground">
                {" · "}Updated {formatUpdatedAt(recordedAt)}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2" htmlFor="refresh-select">
            <span className="text-xs font-medium text-muted-foreground">Auto-refresh</span>
            <Select
              value={refreshMinutes}
              onValueChange={(v) => setRefreshMinutes(v as RefreshMinutes)}
            >
              <SelectTrigger
                id="refresh-select"
                className="w-[160px]"
                aria-label="Auto-refresh interval"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFRESH_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={useMyLocation}
            aria-label="Use my current location"
          >
            <LocateFixed className="size-4" />
            My location
          </Button>
        </div>
      </header>

      {/* ── Manual location search ──────────────────────────────────── */}
      <div className="relative mt-4" ref={searchContainerRef}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runSearch();
                }
              }}
              placeholder="Search a coastal city or place…"
              className="pl-9"
              aria-label="Search for a place by name"
              aria-expanded={showResults}
              aria-controls="place-results"
            />
          </div>
          <Button onClick={() => void runSearch()} disabled={searching} size="sm">
            {searching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            Search
          </Button>
        </div>
        {showResults && searchResults.length > 0 && (
          <div
            id="place-results"
            role="listbox"
            className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg"
          >
            <ul className="max-h-72 overflow-y-auto scroll-ocean py-1">
              {searchResults.map((r, i) => (
                <li key={`${r.name}-${r.lat}-${i}`} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => pickPlace(r)}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                  >
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {[r.region, r.country].filter(Boolean).join(", ") || "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Status banner ───────────────────────────────────────────── */}
      <section className="mt-4" aria-live="polite">
        <StatusBanner status={status} isDemo={isDemo} data={data} />
      </section>

      {/* ── Headline metrics strip (StatCard) ─────────────────────── */}
      {data && !error && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Wind Speed"
            value={fmtNum(data.windSpeed, 0)}
            unit="km/h"
            icon={Wind}
            accent="cyan"
            sub={degToCompass(data.windDirection) ? `from ${degToCompass(data.windDirection)}` : undefined}
          />
          <StatCard
            label="Wave Height"
            value={fmtNum(data.waveHeight, 1)}
            unit="m"
            icon={Waves}
            accent="blue"
            sub={fmtNum(data.wavePeriod, 0) ? `${fmtNum(data.wavePeriod, 0)}s period` : undefined}
          />
          <StatCard
            label="Air Temp"
            value={fmtNum(data.airTemperature, 0)}
            unit="°C"
            icon={Thermometer}
            accent="amber"
          />
          <StatCard
            label="Sea Surface"
            value={fmtNum(data.seaSurfaceTemperature, 0)}
            unit="°C"
            icon={Waves}
            accent="green"
          />
        </div>
      )}

      {/* ── Cards grid ─────────────────────────────────────────────── */}
      <section className="mt-4" aria-label="Sea condition details">
        {loading && !data ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <ErrorState
            title="Couldn't load sea conditions"
            message={error}
            onRetry={() => coords && void fetchData(coords.lat, coords.lng)}
          />
        ) : data ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <LocationCard
              label={label}
              lat={coords?.lat ?? data.location?.lat ?? null}
              lng={coords?.lng ?? data.location?.lng ?? null}
              accuracy={accuracy}
              onRefresh={() => coords && void fetchData(coords.lat, coords.lng)}
              onUseMyLocation={useMyLocation}
              loading={loading}
            />
            <WeatherOverviewCard data={data} />
            <WindCard data={data} />
            <WaveCard data={data} />
            <TemperatureCard data={data} />
            <AtmosphericsCard data={data} />
            <SunCard data={data} />
          </div>
        ) : null}
      </section>

      {/* ── Marine condition chart ──────────────────────────────────── */}
      <section className="mt-4" aria-label="24-hour marine forecast chart">
        <MarineConditionChart data={chartData} loading={loading} />
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="mt-6 flex flex-col gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          Last updated:{" "}
          <span className="font-medium text-foreground">
            {formatUpdatedAt(recordedAt)}
          </span>
          {source && <span className="ml-2">· source: {source}</span>}
        </div>
        {isDemo && (
          <div className="flex items-center gap-1.5 text-amber-500">
            <Info className="size-3.5" />
            <span>
              Live API unavailable — showing offline demo data.
            </span>
          </div>
        )}
      </footer>
    </div>
  );
}

export default SeaConditionsView;

// ── Sub-components ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  Safety,
  {
    Icon: typeof CheckCircle2;
    label: string;
    hint: string;
    border: string;
    accentBg: string;
    badge: string;
    dotColor: string;
  }
> = {
  safe: {
    Icon: CheckCircle2,
    label: "Safe to operate",
    hint: "Wind and wave conditions are within safe limits.",
    border: "border-emerald-500/40",
    accentBg: "bg-emerald-500/10 text-emerald-300",
    badge: "from-emerald-500/20 to-emerald-500/5 text-emerald-400",
    dotColor: "bg-emerald-500",
  },
  caution: {
    Icon: AlertTriangle,
    label: "Use caution",
    hint: "Conditions are marginal — assess before heading out.",
    border: "border-amber-500/40",
    accentBg: "bg-amber-500/10 text-amber-300",
    badge: "from-amber-500/20 to-amber-500/5 text-amber-400",
    dotColor: "bg-amber-500",
  },
  dangerous: {
    Icon: AlertOctagon,
    label: "Hazardous conditions",
    hint: "High winds or waves — avoid going to sea.",
    border: "border-rose-500/40",
    accentBg: "bg-rose-500/10 text-rose-300",
    badge: "from-rose-500/20 to-rose-500/5 text-rose-400",
    dotColor: "bg-rose-500",
  },
  unknown: {
    Icon: Info,
    label: "Status unavailable",
    hint: "Wind and wave data are missing for this location.",
    border: "border-border",
    accentBg: "bg-card text-muted-foreground",
    badge: "from-muted/40 to-muted/5 text-muted-foreground",
    dotColor: "bg-muted-foreground",
  },
};

function StatusBanner({
  status,
  isDemo,
  data,
}: {
  status: Safety;
  isDemo: boolean;
  data: SeaConditionData | null;
}) {
  const cfg = STATUS_CONFIG[status];
  return (
    <div
      role="status"
      className={cn(
        "glass-card flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
        cfg.border,
        cfg.accentBg,
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br",
            cfg.badge,
          )}
        >
          <cfg.Icon className="size-5" />
        </div>
        <div>
          <p className="font-semibold leading-tight">{cfg.label}</p>
          <p className="text-sm text-muted-foreground">{cfg.hint}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {data?.windSpeed != null && (
          <Badge variant="outline" className="bg-background/60">
            <Wind className="size-3" />
            {data.windSpeed.toFixed(0)} km/h
          </Badge>
        )}
        {data?.waveHeight != null && (
          <Badge variant="outline" className="bg-background/60">
            <Waves className="size-3" />
            {data.waveHeight.toFixed(1)} m
          </Badge>
        )}
        {isDemo && (
          <Badge
            variant="outline"
            className="border-amber-500/50 bg-amber-500/15 text-amber-300"
          >
            Demo Data / Offline Mode
          </Badge>
        )}
      </div>
    </div>
  );
}

function LocationCard({
  label,
  lat,
  lng,
  accuracy,
  onRefresh,
  onUseMyLocation,
  loading,
}: {
  label: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  onRefresh: () => void;
  onUseMyLocation: () => void;
  loading: boolean;
}) {
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="size-4 text-primary" /> Current Location
        </CardTitle>
        <CardDescription className="truncate">{label || "Unknown location"}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Latitude</dt>
            <dd className="font-medium tabular-nums">
              {lat != null ? lat.toFixed(4) : <Unavailable />}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Longitude</dt>
            <dd className="font-medium tabular-nums">
              {lng != null ? lng.toFixed(4) : <Unavailable />}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">GPS accuracy</dt>
            <dd className="font-medium tabular-nums">
              {accuracy != null ? `±${accuracy.toFixed(0)} m` : <Unavailable />}
            </dd>
          </div>
        </dl>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={onUseMyLocation}
            aria-label="Use my current location"
          >
            <LocateFixed className="size-4" />
            My location
          </Button>
          <Button
            size="sm"
            variant="default"
            className="flex-1"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh sea conditions"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WeatherOverviewCard({ data }: { data: SeaConditionData }) {
  // Use createElement (not a JSX capital tag) to avoid the
  // react-hooks/static-components "components created during render" warning.
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sun className="size-4 text-primary" /> Weather Overview
        </CardTitle>
        <CardDescription>Current surface conditions.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 text-amber-400">
          {createElement(weatherIconFor(data.weatherCode), { className: "size-7" })}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight">
            {data.weatherText || "Unknown"}
          </p>
          {data.airTemperature != null ? (
            <p className="text-sm text-muted-foreground">
              Air temperature:{" "}
              <span className="font-medium text-foreground">
                {data.airTemperature.toFixed(0)}°C
              </span>
            </p>
          ) : (
            <Unavailable className="mt-0.5 block" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function WindCard({ data }: { data: SeaConditionData }) {
  const dir = data.windDirection;
  const compass = degToCompass(dir);
  // Wind direction is the direction FROM which the wind blows.
  // Rotate the arrow so it points downwind (toward where the wind is going).
  const rotation = dir != null ? (dir + 180) % 360 : 0;
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wind className="size-4 text-primary" /> Wind
        </CardTitle>
        <CardDescription>Surface wind at 10m above sea level.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Speed</p>
            {data.windSpeed != null ? (
              <p className="font-semibold tabular-nums">
                {data.windSpeed.toFixed(1)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">km/h</span>
              </p>
            ) : <Unavailable />}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Gusts</p>
            {data.windGusts != null ? (
              <p className="font-semibold tabular-nums">
                {data.windGusts.toFixed(1)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">km/h</span>
              </p>
            ) : <Unavailable />}
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Direction</p>
            {dir != null ? (
              <p className="font-semibold tabular-nums">
                {dir.toFixed(0)}°
                {compass && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    from {compass}
                  </span>
                )}
              </p>
            ) : <Unavailable />}
          </div>
        </div>
        <div
          className="flex size-16 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30"
          aria-label={compass ? `Wind from ${compass}` : "Wind direction"}
        >
          <Navigation
            className="size-8 text-primary transition-transform duration-500"
            style={{ transform: `rotate(${rotation}deg)` }}
            aria-hidden="true"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function WaveCard({ data }: { data: SeaConditionData }) {
  const dir = data.waveDirection;
  const compass = degToCompass(dir);
  const rotation = dir != null ? (dir + 180) % 360 : 0;
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Waves className="size-4 text-primary" /> Waves
        </CardTitle>
        <CardDescription>Sea state at the surface.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Height</p>
            {data.waveHeight != null ? (
              <p className="font-semibold tabular-nums">
                {data.waveHeight.toFixed(1)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">m</span>
              </p>
            ) : <Unavailable />}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Period</p>
            {data.wavePeriod != null ? (
              <p className="font-semibold tabular-nums">
                {data.wavePeriod.toFixed(0)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">s</span>
              </p>
            ) : <Unavailable />}
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Direction</p>
            {dir != null ? (
              <p className="font-semibold tabular-nums">
                {dir.toFixed(0)}°
                {compass && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    from {compass}
                  </span>
                )}
              </p>
            ) : <Unavailable />}
          </div>
        </div>
        <div
          className="flex size-16 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30"
          aria-label={compass ? `Waves from ${compass}` : "Wave direction"}
        >
          <Compass
            className="size-8 text-primary transition-transform duration-500"
            style={{ transform: `rotate(${rotation}deg)` }}
            aria-hidden="true"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function TemperatureCard({ data }: { data: SeaConditionData }) {
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Thermometer className="size-4 text-primary" /> Temperature
        </CardTitle>
        <CardDescription>Air, sea surface & humidity.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Air</p>
          {data.airTemperature != null ? (
            <p className="font-semibold tabular-nums">
              {data.airTemperature.toFixed(0)}
              <span className="ml-0.5 text-xs font-normal text-muted-foreground">°C</span>
            </p>
          ) : <Unavailable />}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Sea surface</p>
          {data.seaSurfaceTemperature != null ? (
            <p className="font-semibold tabular-nums">
              {data.seaSurfaceTemperature.toFixed(0)}
              <span className="ml-0.5 text-xs font-normal text-muted-foreground">°C</span>
            </p>
          ) : <Unavailable />}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Humidity</p>
          {data.humidity != null ? (
            <p className="font-semibold tabular-nums">
              {data.humidity.toFixed(0)}
              <span className="ml-0.5 text-xs font-normal text-muted-foreground">%</span>
            </p>
          ) : <Unavailable />}
        </div>
      </CardContent>
    </Card>
  );
}

function AtmosphericsCard({ data }: { data: SeaConditionData }) {
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="size-4 text-primary" /> Atmospherics
        </CardTitle>
        <CardDescription>Pressure, precipitation & visibility.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Pressure</p>
          {data.pressure != null ? (
            <p className="font-semibold tabular-nums">
              {data.pressure.toFixed(0)}
              <span className="ml-0.5 text-xs font-normal text-muted-foreground">hPa</span>
            </p>
          ) : <Unavailable />}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Precip.</p>
          {data.precipitation != null ? (
            <p className="font-semibold tabular-nums">
              {data.precipitation.toFixed(1)}
              <span className="ml-0.5 text-xs font-normal text-muted-foreground">mm</span>
            </p>
          ) : <Unavailable />}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Visibility</p>
          {data.visibility != null ? (
            <p className="font-semibold tabular-nums">
              {data.visibility >= 1000
                ? `${(data.visibility / 1000).toFixed(1)}`
                : `${data.visibility.toFixed(0)}`}
              <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                {data.visibility >= 1000 ? "km" : "m"}
              </span>
            </p>
          ) : <Unavailable />}
        </div>
      </CardContent>
    </Card>
  );
}

function SunCard({ data }: { data: SeaConditionData }) {
  const sunrise = formatHHMM(data.sunrise);
  const sunset = formatHHMM(data.sunset);
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sunrise className="size-4 text-primary" /> Sun
        </CardTitle>
        <CardDescription>
          {data.utcOffsetSeconds != null
            ? `UTC ${data.utcOffsetSeconds >= 0 ? "+" : ""}${(data.utcOffsetSeconds / 3600).toFixed(1)}h local`
            : "Local sunrise & sunset"}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <Sunrise className="size-5 text-amber-400" />
          <div>
            <p className="text-xs text-muted-foreground">Sunrise</p>
            <p className="font-semibold tabular-nums">{sunrise ?? <Unavailable />}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Sunset className="size-5 text-purple-400" />
          <div>
            <p className="text-xs text-muted-foreground">Sunset</p>
            <p className="font-semibold tabular-nums">{sunset ?? <Unavailable />}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const MARINE_CHART_CONFIG: ChartConfig = {
  waveHeight: { label: "Wave Height (m)", color: "var(--chart-1)" },
  windSpeed: { label: "Wind Speed (km/h)", color: "var(--chart-2)" },
};

function MarineConditionChart({
  data,
  loading,
}: {
  data: { time: string; waveHeight: number | null; windSpeed: number | null }[];
  loading: boolean;
}) {
  const hasWave = data.some((d) => d.waveHeight != null);
  const hasWind = data.some((d) => d.windSpeed != null);

  if ((loading && data.length === 0) || (!hasWave && !hasWind)) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Waves className="size-4 text-primary" /> 24-Hour Marine Forecast
          </CardTitle>
          <CardDescription>
            {loading ? "Loading hourly forecast…" : "No hourly forecast data available for this location."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
            {loading ? (
              <Loader2 className="size-6 animate-spin" />
            ) : (
              <Unavailable />
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Waves className="size-4 text-primary" /> 24-Hour Marine Forecast
        </CardTitle>
        <CardDescription>
          Hourly wave height and wind speed at the selected location.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={MARINE_CHART_CONFIG} className="h-[260px] w-full">
          <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="gradWave" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-waveHeight)" stopOpacity={0.7} />
                <stop offset="100%" stopColor="var(--color-waveHeight)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gradWind" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-windSpeed)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--color-windSpeed)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.3} />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
            />
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            {hasWave && (
              <Area
                yAxisId="left"
                dataKey="waveHeight"
                type="monotone"
                stroke="var(--color-waveHeight)"
                fill="url(#gradWave)"
                strokeWidth={2}
                connectNulls
                name="Wave Height (m)"
              />
            )}
            {hasWind && (
              <Area
                yAxisId="right"
                dataKey="windSpeed"
                type="monotone"
                stroke="var(--color-windSpeed)"
                fill="url(#gradWind)"
                strokeWidth={2}
                connectNulls
                name="Wind Speed (km/h)"
              />
            )}
          </AreaChart>
        </ChartContainer>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px]" style={{ backgroundColor: "var(--chart-1)" }} />
            Wave height (m)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px]" style={{ backgroundColor: "var(--chart-2)" }} />
            Wind speed (km/h)
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
