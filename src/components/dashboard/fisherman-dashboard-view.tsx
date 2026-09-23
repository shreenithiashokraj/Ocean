"use client";

/**
 * Fisherman Dashboard — Fisherman Module.
 *
 * The fisherman's personal home view. Layout:
 *   - Welcome banner (name + role badge + current date).
 *   - Quick-access grid: 6 working module cards (Sea Conditions, Safety
 *     Alerts, AI Fish Analysis, Location & Navigation, Catch Logging,
 *     SOS & Emergency).
 *   - Three live cards populated on mount via Promise.all:
 *       · Current conditions (geolocation → Chennai fallback →
 *         api.getSeaConditions)
 *       · Safety status (api.listAlerts({unreadOnly:true}))
 *       · Recent analyses (api.listFishAnalyses())
 *   - Each card has its own Loading / Error / Empty state; the page itself
 *     never blocks on a single failing call.
 *
 * Sticky footer is handled by the AppShell.
 */

import { useEffect, useState } from "react";
import {
  AlertOctagon,
  ArrowRight,
  Calendar,
  ChevronRight,
  Clock,
  Compass,
  Fish,
  LifeBuoy,
  MapPin,
  ShieldAlert,
  Thermometer,
  Waves,
  Wind,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";
import type { SeaConditionData, WeatherAlert } from "@/lib/types";
import { useAppStore, type ViewId } from "@/lib/store";
import { RoleBadge } from "@/components/role-badge";
import {
  CardSkeleton,
  EmptyState,
  ErrorState,
  Unavailable,
} from "@/components/common/states";

// ── Constants ────────────────────────────────────────────────────────────

const CHENNAI = { lat: 13.0827, lng: 80.2707 };

// ── Types ─────────────────────────────────────────────────────────────────

interface SeaConditionsRes {
  data: SeaConditionData;
  isDemo: boolean;
  source: string;
  recordedAt: string | null;
  label?: string;
}

interface AnalysisRow {
  id: string;
  species: string | null;
  confidence: number | null;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined, digits = 1): string | null {
  if (n == null || Number.isNaN(n)) return null;
  return n.toFixed(digits);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    return `${days}d ago`;
  } catch {
    return iso;
  }
}

// ── Quick-access module config ─────────────────────────────────────────────

interface ModuleCard {
  view: ViewId;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string; // tailwind gradient stops
}

const MODULE_CARDS: ModuleCard[] = [
  {
    view: "fisherman.sea-conditions",
    title: "Sea Conditions",
    desc: "Live weather & marine snapshot for your GPS.",
    icon: Waves,
    accent: "from-cyan-500/25 to-cyan-500/5 text-cyan-400",
  },
  {
    view: "fisherman.safety-alerts",
    title: "Safety Alerts",
    desc: "Wind / wave / storm alerts for your zone.",
    icon: ShieldAlert,
    accent: "from-amber-500/25 to-amber-500/5 text-amber-400",
  },
  {
    view: "fisherman.ai-fish-analysis",
    title: "AI Fish Analysis",
    desc: "Upload a photo — get species, size, price.",
    icon: Fish,
    accent: "from-emerald-500/25 to-emerald-500/5 text-emerald-400",
  },
  {
    view: "fisherman.location-navigation",
    title: "Location & Navigation",
    desc: "Map, save fishing spots, find harbours.",
    icon: MapPin,
    accent: "from-purple-500/25 to-purple-500/5 text-purple-400",
  },
  {
    view: "fisherman.catch-logging",
    title: "Catch Logging",
    desc: "Track your daily catch & bycatch.",
    icon: Fish,
    accent: "from-cyan-500/25 to-cyan-500/5 text-cyan-400",
  },
  {
    view: "fisherman.sos-emergency",
    title: "SOS & Emergency",
    desc: "One-tap distress signal (demo record).",
    icon: LifeBuoy,
    accent: "from-rose-500/25 to-rose-500/5 text-rose-400",
  },
];

// ── Component ─────────────────────────────────────────────────────────────

export function FishermanDashboardView() {
  const user = useAppStore((s) => s.user);
  const setView = useAppStore((s) => s.setView);
  const [today] = useState<Date>(() => new Date());

  // ── Live cards state ───────────────────────────────────────────────────
  const [seaRes, setSeaRes] = useState<SeaConditionsRes | null>(null);
  const [seaLoading, setSeaLoading] = useState<boolean>(true);
  const [seaError, setSeaError] = useState<string | null>(null);

  const [unreadAlerts, setUnreadAlerts] = useState<WeatherAlert[] | null>(null);
  const [alertsLoading, setAlertsLoading] = useState<boolean>(true);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  const [analyses, setAnalyses] = useState<AnalysisRow[] | null>(null);
  const [analysesLoading, setAnalysesLoading] = useState<boolean>(true);
  const [analysesError, setAnalysesError] = useState<string | null>(null);

  // ── Bootstrap: geolocate (Chennai fallback) + Promise.all fetch ────────
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      // Resolve a coordinate (geolocation → Chennai on deny/unsupported).
      const coords = await new Promise<{ lat: number; lng: number }>(
        (resolve) => {
          if (
            typeof navigator === "undefined" ||
            !navigator.geolocation
          ) {
            resolve(CHENNAI);
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              }),
            () => resolve(CHENNAI),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
          );
        }
      );

      if (cancelled) return;

      // Fire all three requests in parallel.
      setSeaLoading(true);
      setAlertsLoading(true);
      setAnalysesLoading(true);

      const seaPromise = api
        .getSeaConditions(coords.lat, coords.lng)
        .then((r) => {
          if (cancelled) return;
          setSeaRes(r as unknown as SeaConditionsRes);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const msg =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Failed to load sea conditions.";
          setSeaError(msg);
        })
        .finally(() => {
          if (!cancelled) setSeaLoading(false);
        });

      const alertsPromise = api
        .listAlerts({ unreadOnly: true })
        .then((r) => {
          if (cancelled) return;
          setUnreadAlerts(r.alerts as unknown as WeatherAlert[]);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const msg =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Failed to load safety alerts.";
          setAlertsError(msg);
        })
        .finally(() => {
          if (!cancelled) setAlertsLoading(false);
        });

      const analysesPromise = api
        .listFishAnalyses()
        .then((r) => {
          if (cancelled) return;
          setAnalyses(
            (r.analyses as unknown as AnalysisRow[]).map((a) => ({
              id: a.id,
              species: a.species,
              confidence: a.confidence,
              createdAt: a.createdAt,
            }))
          );
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const msg =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Failed to load recent analyses.";
          setAnalysesError(msg);
        })
        .finally(() => {
          if (!cancelled) setAnalysesLoading(false);
        });

      await Promise.allSettled([seaPromise, alertsPromise, analysesPromise]);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Severity breakdown for safety card ──────────────────────────────────
  const severityBreakdown = (() => {
    if (!unreadAlerts) return [] as { severity: string; count: number }[];
    const map = new Map<string, number>();
    for (const a of unreadAlerts) {
      const sev = a.severity || "UNKNOWN";
      map.set(sev, (map.get(sev) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([severity, count]) => ({ severity, count }))
      .sort((a, b) => b.count - a.count);
  })();

  const sea = seaRes?.data;
  const hasSeaData = !!sea;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* ── Welcome banner ─────────────────────────────────────────────────── */}
      <header className="glass-card animate-fade-up rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Fisherman Dashboard
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome back,{" "}
              <span className="text-cyan-400">
                {user?.name ?? "Fisher"}
              </span>
            </h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="size-3.5" />
              {fmtDate(today)}
            </p>
          </div>
          {user?.role && <RoleBadge role={user.role} />}
        </div>
      </header>

      {/* ── Quick-access module cards ─────────────────────────────────────── */}
      <section
        className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
        aria-label="Quick access"
      >
        {MODULE_CARDS.map((m) => {
          const Icon = m.icon;
          return (
            <Card
              key={m.view}
              className="glass-card animate-fade-up group relative overflow-hidden"
            >
              <button
                onClick={() => setView(m.view)}
                className="flex w-full cursor-pointer items-start gap-3 p-5 text-left transition hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open ${m.title}`}
              >
                <div
                  className={`flex size-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${m.accent}`}
                >
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold tracking-tight">
                      {m.title}
                    </h3>
                    <ArrowRight className="size-4 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {m.desc}
                  </p>
                </div>
              </button>
            </Card>
          );
        })}

      </section>

      {/* ── Live cards row ────────────────────────────────────────────────── */}
      <section
        className="mt-6 grid gap-3 sm:gap-4 lg:grid-cols-3"
        aria-label="Live overview"
      >
        {/* Current conditions */}
        <Card className="glass-card animate-fade-up">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Waves className="size-4 text-sky-400" />
                Current Conditions
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setView("fisherman.sea-conditions")}
              >
                View
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {seaLoading ? (
              <CardSkeleton />
            ) : seaError ? (
              <ErrorState
                title="Conditions unavailable"
                message={seaError}
                className="border-0 bg-transparent p-0"
              />
            ) : !seaRes || !hasSeaData ? (
              <EmptyState
                title="No conditions yet"
                icon={Waves}
                className="py-6"
              />
            ) : (
              <>
                {seaRes.isDemo && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-200">
                    <AlertOctagon className="size-3.5 shrink-0 text-amber-300" />
                    <p>
                      Live API unreachable — showing clearly-labelled demo
                      data.
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {seaRes.label || "Your location"}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Metric
                    icon={Thermometer}
                    label="Air Temp"
                    value={
                      fmtNum(sea?.airTemperature)
                        ? `${fmtNum(sea?.airTemperature)}°C`
                        : null
                    }
                  />
                  <Metric
                    icon={Wind}
                    label="Wind"
                    value={
                      fmtNum(sea?.windSpeed)
                        ? `${fmtNum(sea?.windSpeed)} km/h`
                        : null
                    }
                  />
                  <Metric
                    icon={Waves}
                    label="Wave"
                    value={
                      fmtNum(sea?.waveHeight)
                        ? `${fmtNum(sea?.waveHeight)} m`
                        : null
                    }
                  />
                  <Metric
                    icon={Compass}
                    label="Weather"
                    value={sea?.weatherText || null}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Safety status */}
        <Card className="glass-card animate-fade-up">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="size-4 text-amber-400" />
                Safety Status
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setView("fisherman.safety-alerts")}
              >
                View
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {alertsLoading ? (
              <CardSkeleton />
            ) : alertsError ? (
              <ErrorState
                title="Alerts unavailable"
                message={alertsError}
                className="border-0 bg-transparent p-0"
              />
            ) : !unreadAlerts || unreadAlerts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <ShieldAlert className="size-8 text-emerald-400" />
                <p className="text-sm font-medium">All clear</p>
                <p className="text-xs text-muted-foreground">
                  No unread safety alerts.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums text-amber-300">
                    {unreadAlerts.length}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    unread alert{unreadAlerts.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {severityBreakdown.slice(0, 4).map((b) => {
                    const cls =
                      b.severity === "CRITICAL"
                        ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                        : b.severity === "HIGH"
                          ? "border-orange-500/40 bg-orange-500/15 text-orange-300"
                          : b.severity === "MODERATE"
                            ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                            : "border-slate-500/40 bg-slate-500/15 text-slate-300";
                    return (
                      <li
                        key={b.severity}
                        className="flex items-center justify-between text-xs"
                      >
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${cls}`}
                        >
                          {b.severity}
                        </Badge>
                        <span className="tabular-nums text-muted-foreground">
                          {b.count}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent analyses */}
        <Card className="glass-card animate-fade-up">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Fish className="size-4 text-emerald-400" />
                Recent Analyses
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setView("fisherman.ai-fish-analysis")}
              >
                View
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {analysesLoading ? (
              <CardSkeleton />
            ) : analysesError ? (
              <ErrorState
                title="Analyses unavailable"
                message={analysesError}
                className="border-0 bg-transparent p-0"
              />
            ) : !analyses || analyses.length === 0 ? (
              <EmptyState
                title="No analyses yet"
                description="Upload a fish photo to get started."
                icon={Fish}
                className="py-6"
              />
            ) : (
              <ul className="space-y-2">
                {analyses.slice(0, 3).map((a) => (
                  <li
                    key={a.id}
                    className="glass-card flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {a.species || (
                          <span className="text-muted-foreground">
                            Unidentified
                          </span>
                        )}
                      </p>
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="size-3" />
                        {timeAgo(a.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      {a.confidence != null && Number.isFinite(a.confidence) ? (
                        <>
                          <p className="text-sm font-bold tabular-nums">
                            {Math.round(a.confidence * 100)}%
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            confidence
                          </p>
                        </>
                      ) : (
                        <Unavailable />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

// ── Small metric chip ─────────────────────────────────────────────────────

function Metric({
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
          <p className="truncate text-sm font-medium tabular-nums">{value}</p>
        ) : (
          <Unavailable />
        )}
      </div>
    </div>
  );
}

export default FishermanDashboardView;
