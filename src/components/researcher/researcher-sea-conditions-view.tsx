"use client";

/**
 * Researcher Sea Conditions — Fisherman Module.
 *
 * Read-only view for RESEARCHER (and ADMIN) accounts. Two halves:
 *
 * 1. Live snapshot lookup — researcher enters a coordinate (lat/lng),
 *    clicks "Fetch live conditions" and gets a read-only Open-Meteo
 *    snapshot for that coordinate. Uses the researcher-specific
 *    `/api/researcher/sea-conditions/live` endpoint (which does NOT
 *    persist a fisherman-owned row — strictly read-only). Demo data is
 *    labelled clearly with an amber notice.
 *
 * 2. Stored records table — list of all stored SeaCondition rows
 *    (environmental data, no userId/personal info) with locationLabel,
 *    coords, source, isDemo badge, recordedAt. Click a row to open a
 *    Dialog with the full JSON payload for inspection.
 *
 * All data is fetched through the shared api layer
 * (`api.researcherLiveSeaConditions`, `api.researcherSeaConditions`).
 * Sticky footer is handled by AppShell.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Compass,
  Database,
  Gauge,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Thermometer,
  Waves,
  Wind,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import type { SeaConditionData } from "@/lib/types";
import { toast } from "sonner";
import { StatCard } from "@/components/common/stat-card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Unavailable,
} from "@/components/common/states";

// ── Constants ────────────────────────────────────────────────────────────

const CHENNAI = { lat: 13.0827, lng: 80.2707 };

// ── Types ─────────────────────────────────────────────────────────────────

interface LiveResponse {
  data: SeaConditionData;
  isDemo: boolean;
  source: string;
  recordedAt: string | null;
  label: string;
}

interface StoredRecord {
  id: string;
  latitude: number;
  longitude: number;
  locationLabel: string | null;
  source: string;
  isDemo: boolean;
  recordedAt: string;
  createdAt: string;
  payload: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined, digits = 1): string | null {
  if (n == null || Number.isNaN(n)) return null;
  return n.toFixed(digits);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const COMPASS_POINTS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

function degToCompass(deg: number | null | undefined): string | null {
  if (deg == null || Number.isNaN(deg)) return null;
  return COMPASS_POINTS[Math.round(deg / 22.5) % 16];
}

// ── Component ─────────────────────────────────────────────────────────────

export function ResearcherSeaConditionsView() {
  // ── Live lookup state ──────────────────────────────────────────────────
  const [latInput, setLatInput] = useState<string>(String(CHENNAI.lat));
  const [lngInput, setLngInput] = useState<string>(String(CHENNAI.lng));
  const [live, setLive] = useState<LiveResponse | null>(null);
  const [liveLoading, setLiveLoading] = useState<boolean>(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  // ── Stored records state ───────────────────────────────────────────────
  const [records, setRecords] = useState<StoredRecord[] | null>(null);
  const [recordsLoading, setRecordsLoading] = useState<boolean>(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  // ── Row detail dialog ──────────────────────────────────────────────────
  const [selected, setSelected] = useState<StoredRecord | null>(null);

  // ── Stored records fetcher ─────────────────────────────────────────────
  const fetchRecords = useCallback(async () => {
    setRecordsLoading(true);
    setRecordsError(null);
    try {
      const res = await api.researcherSeaConditions();
      setRecords(res.records as unknown as StoredRecord[]);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load stored sea-condition records.";
      setRecordsError(msg);
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  // ── Live lookup fetcher ────────────────────────────────────────────────
  const fetchLive = useCallback(async () => {
    const lat = Number(latInput);
    const lng = Number(lngInput);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("Please enter valid numeric coordinates.");
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast.error("Latitude must be in [-90, 90], longitude in [-180, 180].");
      return;
    }
    setLiveLoading(true);
    setLiveError(null);
    try {
      const res = await api.researcherLiveSeaConditions(lat, lng);
      setLive(res as LiveResponse);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to fetch live sea conditions.";
      setLiveError(msg);
      toast.error("Live lookup failed.");
    } finally {
      setLiveLoading(false);
    }
  }, [latInput, lngInput]);

  // ── Selected row payload (parsed) ──────────────────────────────────────
  let selectedPayload: unknown = null;
  if (selected?.payload) {
    try {
      selectedPayload = JSON.parse(selected.payload);
    } catch {
      selectedPayload = selected.payload;
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="glass-card animate-fade-up rounded-2xl p-5 sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Sea Conditions — Researcher View
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only environmental data. Look up live conditions for any
          coordinate or browse the stored record archive.
        </p>
        <aside
          role="note"
          className="mt-4 flex items-start gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-xs text-purple-200"
        >
          <Info className="size-4 shrink-0 text-purple-300" />
          <p>
            Sea-condition records are environmental — they do not contain
            personal fisherman account info. Live lookups do not persist a
            fisherman-owned row.
          </p>
        </aside>
      </header>

      {/* ── Live lookup card ───────────────────────────────────────────────── */}
      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="glass-card animate-fade-up lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="size-4 text-cyan-400" />
              Live Lookup
            </CardTitle>
            <CardDescription>
              Pull a read-only snapshot for any coordinate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lat-input" className="text-xs">
                  Latitude
                </Label>
                <Input
                  id="lat-input"
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  value={latInput}
                  onChange={(e) => setLatInput(e.target.value)}
                  placeholder="13.0827"
                  aria-label="Latitude"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lng-input" className="text-xs">
                  Longitude
                </Label>
                <Input
                  id="lng-input"
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  value={lngInput}
                  onChange={(e) => setLngInput(e.target.value)}
                  placeholder="80.2707"
                  aria-label="Longitude"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void fetchLive()}
                disabled={liveLoading}
                size="sm"
              >
                {liveLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                Fetch live conditions
              </Button>
              <Button
                onClick={() => {
                  setLatInput(String(CHENNAI.lat));
                  setLngInput(String(CHENNAI.lng));
                }}
                variant="outline"
                size="sm"
                type="button"
              >
                Use Chennai
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Live result compact card */}
        <Card className="glass-card animate-fade-up lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <Waves className="size-4 text-sky-400" />
                Current Snapshot
              </span>
              {live && (
                <Badge
                  variant="outline"
                  className={
                    live.isDemo
                      ? "border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300"
                      : "border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300"
                  }
                >
                  {live.isDemo ? "Demo Data" : "Live Data"}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {live
                ? `${live.label} · source: ${live.source}${
                    live.recordedAt ? ` · ${formatDateTime(live.recordedAt)}` : ""
                  }`
                : "No snapshot fetched yet — enter a coordinate above."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {liveLoading ? (
              <LoadingState label="Fetching live conditions…" />
            ) : liveError ? (
              <ErrorState
                title="Lookup failed"
                message={liveError}
                onRetry={() => void fetchLive()}
              />
            ) : live ? (
              <>
                {live.isDemo && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-200">
                    <AlertTriangle className="size-3.5 shrink-0 text-amber-300" />
                    <p>
                      Live API unreachable for this coordinate — showing
                      clearly-labelled offline demo data.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard
                    label="Air Temp"
                    value={fmtNum(live.data.airTemperature)}
                    unit="°C"
                    icon={Thermometer}
                    accent="amber"
                  />
                  <StatCard
                    label="Wind Speed"
                    value={fmtNum(live.data.windSpeed)}
                    unit="km/h"
                    icon={Wind}
                    accent="cyan"
                    sub={
                      degToCompass(live.data.windDirection)
                        ? `from ${degToCompass(live.data.windDirection)}`
                        : undefined
                    }
                  />
                  <StatCard
                    label="Wave Height"
                    value={fmtNum(live.data.waveHeight)}
                    unit="m"
                    icon={Waves}
                    accent="blue"
                    sub={
                      live.data.wavePeriod
                        ? `period ${fmtNum(live.data.wavePeriod, 0)}s`
                        : undefined
                    }
                  />
                  <StatCard
                    label="Pressure"
                    value={fmtNum(live.data.pressure, 0)}
                    unit="hPa"
                    icon={Gauge}
                    accent="purple"
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <DetailChip
                    icon={Thermometer}
                    label="Sea Surface Temp"
                    value={
                      fmtNum(live.data.seaSurfaceTemperature)
                        ? `${fmtNum(live.data.seaSurfaceTemperature)}°C`
                        : null
                    }
                  />
                  <DetailChip
                    icon={Wind}
                    label="Wind Gusts"
                    value={
                      fmtNum(live.data.windGusts)
                        ? `${fmtNum(live.data.windGusts)} km/h`
                        : null
                    }
                  />
                  <DetailChip
                    icon={Compass}
                    label="Visibility"
                    value={
                      live.data.visibility != null
                        ? `${Math.round(live.data.visibility)} m`
                        : null
                    }
                  />
                  <DetailChip
                    icon={Thermometer}
                    label="Humidity"
                    value={
                      live.data.humidity != null
                        ? `${Math.round(live.data.humidity)}%`
                        : null
                    }
                  />
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" />
                  <span className="tabular-nums">
                    {live.data.location?.lat?.toFixed(4) ?? "—"},{" "}
                    {live.data.location?.lng?.toFixed(4) ?? "—"}
                  </span>
                </div>
              </>
            ) : (
              <EmptyState
                title="No live snapshot yet"
                description={`Enter lat/lng and click "Fetch live conditions".`}
                icon={Waves}
                className="py-8"
              />
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Stored records table ───────────────────────────────────────────── */}
      <section className="mt-6">
        <Card className="glass-card animate-fade-up">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="size-4 text-sky-400" />
                  Stored Sea-Condition Archive
                </CardTitle>
                <CardDescription>
                  {records
                    ? `${records.length} record${records.length === 1 ? "" : "s"} · click a row to inspect the JSON payload`
                    : "Loading archive…"}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchRecords()}
                disabled={recordsLoading}
              >
                <RefreshCw
                  className={
                    recordsLoading ? "size-4 animate-spin" : "size-4"
                  }
                />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recordsLoading ? (
              <LoadingState label="Loading stored records…" />
            ) : recordsError ? (
              <ErrorState
                title="Failed to load archive"
                message={recordsError}
                onRetry={() => void fetchRecords()}
              />
            ) : !records || records.length === 0 ? (
              <EmptyState
                title="No stored records yet"
                description="Records accumulate as fishermen query live conditions."
                icon={Database}
                className="py-8"
              />
            ) : (
              <div className="scroll-ocean max-h-[28rem] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Location</TableHead>
                      <TableHead>Coords</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Recorded</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((r) => (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer"
                        onClick={() => setSelected(r)}
                      >
                        <TableCell className="font-medium">
                          {r.locationLabel || (
                            <span className="text-muted-foreground">
                              Unlabeled
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">
                          {r.latitude.toFixed(3)}, {r.longitude.toFixed(3)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {r.source}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {r.isDemo ? (
                            <Badge
                              variant="outline"
                              className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300"
                            >
                              Demo
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300"
                            >
                              Live
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">
                          {formatDateTime(r.recordedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Row payload dialog ─────────────────────────────────────────────── */}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Database className="size-4 text-sky-400" />
              Sea-Condition Payload
            </DialogTitle>
            <DialogDescription>
              {selected
                ? `${selected.locationLabel || "Unlabeled"} · ${selected.latitude.toFixed(4)}, ${selected.longitude.toFixed(4)} · ${formatDateTime(selected.recordedAt)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="scroll-ocean max-h-[60vh] overflow-y-auto">
              <pre className="rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px] leading-relaxed">
                {JSON.stringify(selectedPayload, null, 2)}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Small helper component ────────────────────────────────────────────────

function DetailChip({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
}) {
  return (
    <div className="glass-card flex items-center gap-2 rounded-lg px-3 py-2">
      <Icon className="size-4 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {value ? (
          <p className="text-sm font-medium tabular-nums">{value}</p>
        ) : (
          <Unavailable />
        )}
      </div>
    </div>
  );
}

export default ResearcherSeaConditionsView;
