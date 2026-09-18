"use client";

/**
 * Researcher GIS View — Fisherman Module (Task F5).
 *
 * Pulls aggregate geographic observations from `/api/researcher/gis?sources=`
 * and renders them on the shared Leaflet map. No fisherman PII — the GIS
 * endpoint returns only environmental sea-condition coordinates (stripped of
 * userId), public fishing spots, and weather-alert coordinates.
 *
 * Filters by source via Switch controls; markers are coloured by dataset.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Anchor,
  Info,
  MapPin,
  RefreshCw,
  Waves,
} from "lucide-react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/common/stat-card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/states";

// Lazy-load the Leaflet map (ssr:false) so Leaflet only ever runs in the browser.
// The shared component at @/components/location/leaflet-map already handles
// OSM attribution and SSR safety internally; we still wrap in dynamic() to
// guarantee no SSR chunk leaks.
const LeafletMap = dynamic(
  () => import("@/components/location/leaflet-map").then((m) => m.LeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[400px] w-full items-center justify-center rounded-xl bg-muted/30 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 size-4 animate-spin" />
        Loading map…
      </div>
    ),
  }
);

// ── Types (mirror API contract in src/lib/api.ts) ────────────────────────────

interface GisPoint {
  lat: number;
  lng: number;
  dataset: string;
  label: string;
  detail?: Record<string, unknown>;
}

interface GisResponse {
  points: GisPoint[];
  total: number;
}

// ── Source configuration ────────────────────────────────────────────────────

type SourceKey = "sea-conditions" | "fishing-spots" | "alerts";

interface SourceCfg {
  key: SourceKey;
  label: string;
  color: string; // CSS color
  icon: typeof Waves;
  accent: "cyan" | "amber" | "red";
}

const SOURCES: SourceCfg[] = [
  {
    key: "sea-conditions",
    label: "Sea Conditions",
    color: "#22d3ee",
    icon: Waves,
    accent: "cyan",
  },
  {
    key: "fishing-spots",
    label: "Fishing Spots",
    color: "#f59e0b",
    icon: Anchor,
    accent: "amber",
  },
  {
    key: "alerts",
    label: "Weather Alerts",
    color: "#fb7185",
    icon: AlertTriangle,
    accent: "red",
  },
];

const COLOR_BY_DATASET: Record<string, string> = {
  "sea-conditions": "#22d3ee",
  "fishing-spots": "#f59e0b",
  alerts: "#fb7185",
};

function colorFor(dataset: string): string {
  return COLOR_BY_DATASET[dataset] ?? "#22d3ee";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ResearcherGisView() {
  const [enabled, setEnabled] = useState<Record<SourceKey, boolean>>({
    "sea-conditions": true,
    "fishing-spots": true,
    alerts: true,
  });
  const [data, setData] = useState<GisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const selected = SOURCES.filter((s) => enabled[s.key]).map((s) => s.key);
      // If user toggled ALL off, still request — server returns 0 points.
      const r = await api.getResearcherGis(selected);
      setData(r as unknown as GisResponse);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Failed to load GIS data.";
      setError(msg);
      toast.error("Failed to load research GIS data.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Derived markers + center ───────────────────────────────────────────────
  const markers = useMemo(() => {
    if (!data) return [];
    return data.points.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      title: p.label,
      color: colorFor(p.dataset),
      popup: `<strong>${escapeHtml(p.label)}</strong><br/>${escapeHtml(p.dataset)}${
        p.detail
          ? `<br/><small>${escapeHtml(JSON.stringify(p.detail))}</small>`
          : ""
      }`,
    }));
  }, [data]);

  const center = useMemo<{ lat: number; lng: number } | undefined>(() => {
    if (!data || data.points.length === 0) return undefined;
    let sumLat = 0;
    let sumLng = 0;
    for (const p of data.points) {
      sumLat += p.lat;
      sumLng += p.lng;
    }
    return { lat: sumLat / data.points.length, lng: sumLng / data.points.length };
  }, [data]);

  const counts = useMemo(() => {
    const c: Record<SourceKey, number> = {
      "sea-conditions": 0,
      "fishing-spots": 0,
      alerts: 0,
    };
    if (data) {
      for (const p of data.points) {
        if (p.dataset in c) c[p.dataset as SourceKey]++;
      }
    }
    return c;
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="glass-card animate-fade-up rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Geographic Research View
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Spatial overlay of sea-condition observations, fishing spots, and
              weather alerts — no fisherman PII.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="self-start"
            aria-label="Refresh GIS data"
          >
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            Refresh
          </Button>
        </div>
      </header>

      {/* ── Stat cards ───────────────────────────────────────────────────────── */}
      <section
        className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        aria-label="GIS point summary"
      >
        <StatCard
          label="Total points"
          value={data?.total ?? 0}
          icon={MapPin}
          accent="cyan"
          sub="Across selected sources"
        />
        <StatCard
          label="Sea conditions"
          value={counts["sea-conditions"]}
          icon={Waves}
          accent="cyan"
          sub={enabled["sea-conditions"] ? "Visible" : "Hidden by filter"}
        />
        <StatCard
          label="Fishing spots"
          value={counts["fishing-spots"]}
          icon={Anchor}
          accent="amber"
          sub={enabled["fishing-spots"] ? "Visible" : "Hidden by filter"}
        />
        <StatCard
          label="Weather alerts"
          value={counts["alerts"]}
          icon={AlertTriangle}
          accent="red"
          sub={enabled["alerts"] ? "Visible" : "Hidden by filter"}
        />
      </section>

      {/* ── Body: 2-col (controls + map) on lg ───────────────────────────────── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[16rem_1fr]">
        {/* Filters / legend column */}
        <aside className="space-y-4">
          <Card className="glass-card animate-fade-up">
            <CardHeader>
              <CardTitle className="text-base">Sources</CardTitle>
              <CardDescription>
                Toggle which datasets appear on the map.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {SOURCES.map((s) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/10 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                        aria-hidden
                      />
                      <Icon className="size-4 text-muted-foreground" />
                      <div className="leading-tight">
                        <div className="text-xs font-medium">{s.label}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {counts[s.key].toLocaleString()} point
                          {counts[s.key] === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={enabled[s.key]}
                      onCheckedChange={(v) =>
                        setEnabled((prev) => ({ ...prev, [s.key]: v }))
                      }
                      aria-label={`Toggle ${s.label}`}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="glass-card animate-fade-up">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Info className="size-4 text-cyan-400" />
                Legend
              </CardTitle>
              <CardDescription>Marker colour by dataset.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {SOURCES.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                    aria-hidden
                  />
                  <span className="text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <aside
            role="note"
            className="flex items-start gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-xs text-purple-200"
          >
            <Info className="size-4 shrink-0 text-purple-300" />
            <p>
              Data shown is aggregated for research purposes. Individual
              fisherman identities are not exposed.
            </p>
          </aside>
        </aside>

        {/* Map column */}
        <div className="space-y-3">
          {error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : loading && !data ? (
            <div className="glass-card flex h-[600px] items-center justify-center rounded-xl">
              <LoadingState label="Loading GIS points…" />
            </div>
          ) : !data || data.points.length === 0 ? (
            <div className="glass-card flex h-[600px] items-center justify-center rounded-xl">
              <EmptyState
                title="No points to display"
                description="Enable at least one source above, or wait for fishermen to log records."
                icon={MapPin}
                className="py-6"
              />
            </div>
          ) : (
            <Card className="glass-card animate-fade-up overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="size-4 text-cyan-400" />
                  Research Map
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    {data.total.toLocaleString()} markers
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {data.total > markers.length
                    ? `Showing first ${markers.length.toLocaleString()} of ${data.total.toLocaleString()} markers.`
                    : `Showing all ${data.total.toLocaleString()} markers.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className="h-[600px] w-full rounded-xl border border-border/40 bg-muted/20"
                  role="region"
                  aria-label="Researcher geographic observations map"
                >
                  <LeafletMap
                    center={center}
                    zoom={center ? 4 : 2}
                    markers={markers}
                    className="h-full w-full"
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default ResearcherGisView;
