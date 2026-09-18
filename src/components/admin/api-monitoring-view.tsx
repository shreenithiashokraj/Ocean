"use client";

/**
 * Admin API Monitoring — Fisherman Module (Task F6).
 *
 * Single admin client view that renders external-service health derived from
 * the `api_logs` table (last 24h). Pulls two endpoints in parallel:
 *   - `api.getApiHealth()` → overall + per-service summary (status / counts / p95).
 *   - `api.getApiLogs()`   → last 100 raw calls (we show the newest 25).
 *
 * Health is always conveyed via icon + text + color (never color alone) so the
 * status is legible to colour-blind users and screen readers. Backend already
 * gates both routes with `requireRole("ADMIN")`; this view is admin-only by
 * virtue of the AppShell routing the store into it.
 *
 * Auto-refreshes every 60s while mounted. Sticky footer handled by AppShell.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ServerCrash,
  ShieldCheck,
  ShieldAlert,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
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
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { StatCard } from "@/components/common/stat-card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/states";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Wire types (mirror api.getApiHealth / api.getApiLogs) ────────────────────

type HealthState = "healthy" | "degraded" | "unavailable";

interface ServiceHealth {
  service: string;
  health: HealthState;
  total: number;
  errors: number;
  lastStatus: number | null;
  lastAt: string | null;
  p95Ms: number | null;
}

interface ApiHealthResponse {
  overall: HealthState;
  services: ServiceHealth[];
}

interface ApiLogRow {
  id: string;
  service: string;
  endpoint: string;
  method: string;
  status: number;
  durationMs: number | null;
  message: string | null;
  userEmail: string | null;
  createdAt: string;
}

// ── Health presentation (icon + label + color, never color alone) ───────────

const HEALTH_PRESENTATION: Record<
  HealthState,
  {
    label: string;
    bannerText: string;
    bannerSub: string;
    icon: LucideIcon;
    /** Tailwind classes for the overall banner card */
    bannerCard: string;
    bannerIconWrap: string;
    bannerIconColor: string;
    /** Badge classes for the per-service table chips */
    badge: string;
  }
> = {
  healthy: {
    label: "Healthy",
    bannerText: "All systems operational",
    bannerSub: "Every external service answered 2xx in the last 24h.",
    icon: CheckCircle2,
    bannerCard: "border-emerald-500/40 bg-emerald-500/10",
    bannerIconWrap: "bg-emerald-500/20",
    bannerIconColor: "text-emerald-400",
    badge: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  },
  degraded: {
    label: "Degraded",
    bannerText: "Degraded",
    bannerSub: "At least one service had recent 4xx/5xx responses.",
    icon: AlertTriangle,
    bannerCard: "border-amber-500/40 bg-amber-500/10",
    bannerIconWrap: "bg-amber-500/20",
    bannerIconColor: "text-amber-400",
    badge: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  },
  unavailable: {
    label: "Unavailable",
    bannerText: "Unavailable",
    bannerSub: "One or more services failed most recently or have no recent calls.",
    icon: ServerCrash,
    bannerCard: "border-rose-500/40 bg-rose-500/10",
    bannerIconWrap: "bg-rose-500/20",
    bannerIconColor: "text-rose-400",
    badge: "border-rose-500/40 bg-rose-500/15 text-rose-300",
  },
};

// Severity rank used to sort the services table — worst first.
const HEALTH_RANK: Record<HealthState, number> = {
  unavailable: 0,
  degraded: 1,
  healthy: 2,
};

// ── Chart config ─────────────────────────────────────────────────────────────

const CALLS_CHART_CONFIG: ChartConfig = {
  total: { label: "Total calls", color: "#22d3ee" },
  errors: { label: "Errors", color: "#fb7185" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "—";
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  } catch {
    return "—";
  }
}

function fmtMs(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1000) return `${Math.round(n)} ms`;
  return `${(n / 1000).toFixed(2)} s`;
}

function statusBadgeClass(status: number): string {
  if (status >= 200 && status < 300) {
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  }
  if (status >= 400 && status < 500) {
    return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  }
  if (status >= 500) {
    return "border-rose-500/40 bg-rose-500/15 text-rose-300";
  }
  return "border-slate-500/40 bg-slate-500/15 text-slate-300";
}

function statusLabel(status: number): string {
  if (status >= 200 && status < 300) return "2xx success";
  if (status >= 300 && status < 400) return "3xx redirect";
  if (status >= 400 && status < 500) return "4xx client error";
  if (status >= 500) return "5xx server error";
  return "unknown";
}

// ── Component ────────────────────────────────────────────────────────────────

export function ApiMonitoringView() {
  const [health, setHealth] = useState<ApiHealthResponse | null>(null);
  const [logs, setLogs] = useState<ApiLogRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  /** Bumped by the 60s interval so the UI can show a live "auto-refresh" tick. */
  const [autoTick, setAutoTick] = useState<number>(0);

  // Keep the latest loader in a ref so the interval can call it without
  // re-subscribing on every render.
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, logsRes] = await Promise.all([
        api.getApiHealth(),
        api.getApiLogs(),
      ]);
      setHealth(healthRes as ApiHealthResponse);
      setLogs((logsRes.logs ?? []) as ApiLogRow[]);
      setLastRefresh(new Date());
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load API monitoring data.";
      setError(msg);
      toast.error("API monitoring: " + msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Keep the ref in sync with the latest loader (must be after `load` is
  // declared to avoid a temporal-dead-zone ReferenceError).
  loadRef.current = load;

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh every 60s.
  useEffect(() => {
    const id = window.setInterval(() => {
      setAutoTick((t) => t + 1);
      void loadRef.current();
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // ── Derived data ───────────────────────────────────────────────────────────

  const sortedServices = useMemo<ServiceHealth[]>(() => {
    const list = health?.services ?? [];
    // Sort by health severity (unavailable → degraded → healthy), then by
    // error rate desc, then alphabetically for stable ordering.
    return [...list].sort((a, b) => {
      const rankDiff = HEALTH_RANK[a.health] - HEALTH_RANK[b.health];
      if (rankDiff !== 0) return rankDiff;
      const errA = a.total > 0 ? a.errors / a.total : 0;
      const errB = b.total > 0 ? b.errors / b.total : 0;
      if (errB !== errA) return errB - errA;
      return a.service.localeCompare(b.service);
    });
  }, [health]);

  const counts = useMemo(() => {
    const list = health?.services ?? [];
    return {
      total: list.length,
      healthy: list.filter((s) => s.health === "healthy").length,
      degraded: list.filter((s) => s.health === "degraded").length,
      unavailable: list.filter((s) => s.health === "unavailable").length,
    };
  }, [health]);

  const recentLogs = useMemo<ApiLogRow[]>(
    () => (logs ?? []).slice(0, 25),
    [logs],
  );

  const chartData = useMemo(() => {
    return sortedServices.map((s) => ({
      service: s.service,
      total: s.total,
      errors: s.errors,
    }));
  }, [sortedServices]);

  const overall: HealthState = health?.overall ?? "unavailable";
  const overallPres = HEALTH_PRESENTATION[overall];
  const OverallIcon = overallPres.icon;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Monitoring</h1>
          <p className="text-sm text-muted-foreground">
            Health of external service integrations over the last 24h.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-[11px] text-muted-foreground"
            aria-live="polite"
          >
            {lastRefresh
              ? `Updated ${timeAgo(lastRefresh.toISOString())}`
              : "Not yet updated"}
            {autoTick > 0 ? " · auto-refresh on" : ""}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </header>

      {/* ── Error / Loading guards ─────────────────────────────────────────── */}
      {error && (
        <div className="mt-4">
          <ErrorState
            title="Failed to load API monitoring"
            message={error}
            onRetry={() => void load()}
          />
        </div>
      )}

      {loading && !health ? (
        <div className="mt-6">
          <LoadingState label="Loading API health…" />
        </div>
      ) : health ? (
        <div className="mt-6 space-y-6">
          {/* ── Overall health banner ───────────────────────────────────────── */}
          <section aria-label="Overall API health">
            <Card
              role="status"
              aria-live="polite"
              className={cn(
                "glass-card overflow-hidden border-2",
                overallPres.bannerCard,
              )}
            >
              <CardContent className="flex flex-col items-start gap-4 py-6 sm:flex-row sm:items-center sm:gap-6">
                <div
                  className={cn(
                    "flex size-14 shrink-0 items-center justify-center rounded-2xl",
                    overallPres.bannerIconWrap,
                  )}
                  aria-hidden
                >
                  <OverallIcon className={cn("size-8", overallPres.bannerIconColor)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Overall status
                  </p>
                  <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                    {overallPres.bannerText}
                    <span className="sr-only"> — {overallPres.label}</span>
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {overallPres.bannerSub}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
                  <Badge
                    variant="outline"
                    className={cn("uppercase", overallPres.badge)}
                  >
                    {overallPres.label}
                  </Badge>
                  <Badge variant="outline" className="uppercase">
                    {counts.total} service{counts.total === 1 ? "" : "s"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── StatCards row ──────────────────────────────────────────────── */}
          <section
            aria-label="Service health summary"
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            <StatCard
              label="Total Services"
              value={counts.total}
              icon={Activity}
              accent="cyan"
              sub="external integrations"
            />
            <StatCard
              label="Healthy"
              value={counts.healthy}
              icon={ShieldCheck}
              accent="green"
              sub="2xx most recent"
            />
            <StatCard
              label="Degraded"
              value={counts.degraded}
              icon={AlertTriangle}
              accent="amber"
              sub="recent errors"
            />
            <StatCard
              label="Unavailable"
              value={counts.unavailable}
              icon={ServerCrash}
              accent="red"
              sub="last call failed"
            />
          </section>

          {/* ── Services table + call-volume chart ─────────────────────────── */}
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Services table — spans 3 cols on large screens */}
            <Card className="glass-card lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="size-4 text-primary" />
                  Service Health
                </CardTitle>
                <CardDescription>
                  Per-service status, call counts, errors, last HTTP status
                  and p95 latency (last 24h). Sorted by severity.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sortedServices.length === 0 ? (
                  <EmptyState
                    title="No external API calls yet"
                    description="Services will appear here once the platform calls an external provider."
                    icon={Activity}
                    className="py-8"
                  />
                ) : (
                  <div className="scroll-ocean overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[11px] uppercase">
                            Service
                          </TableHead>
                          <TableHead className="text-[11px] uppercase">
                            Health
                          </TableHead>
                          <TableHead className="text-right text-[11px] uppercase">
                            Calls
                          </TableHead>
                          <TableHead className="text-right text-[11px] uppercase">
                            Errors
                          </TableHead>
                          <TableHead className="text-right text-[11px] uppercase">
                            Last
                          </TableHead>
                          <TableHead className="text-[11px] uppercase">
                            When
                          </TableHead>
                          <TableHead className="text-right text-[11px] uppercase">
                            p95
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedServices.map((s) => {
                          const pres = HEALTH_PRESENTATION[s.health];
                          const HealthIcon = pres.icon;
                          return (
                            <TableRow key={s.service}>
                              <TableCell className="font-mono text-xs font-medium">
                                {s.service}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn("gap-1 text-[10px] uppercase", pres.badge)}
                                >
                                  <HealthIcon className="size-3" aria-hidden />
                                  {pres.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {s.total}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {s.errors}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {s.lastStatus != null ? (
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[10px]",
                                      statusBadgeClass(s.lastStatus),
                                    )}
                                    title={statusLabel(s.lastStatus)}
                                  >
                                    {s.lastStatus}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {timeAgo(s.lastAt)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-xs">
                                {fmtMs(s.p95Ms)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Call-volume BarChart — spans 2 cols on large screens */}
            <Card className="glass-card lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Timer className="size-4 text-primary" />
                  Call Volume by Service
                </CardTitle>
                <CardDescription>
                  Total calls vs. error responses, per external service.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <EmptyState
                    title="No calls to chart"
                    description="Service call counts will appear here once logged."
                    icon={Timer}
                    className="py-8"
                  />
                ) : (
                  <ChartContainer
                    config={CALLS_CHART_CONFIG}
                    className="aspect-[4/3] max-h-[320px] w-full"
                  >
                    <BarChart
                      data={chartData}
                      margin={{ top: 10, right: 10, bottom: 0, left: -16 }}
                    >
                      <CartesianGrid
                        vertical={false}
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.08)"
                      />
                      <XAxis
                        dataKey="service"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        fontSize={10}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                        height={48}
                      />
                      <YAxis
                        allowDecimals={false}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        width={32}
                      />
                      <ChartTooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        content={<ChartTooltipContent />}
                      />
                      <Bar
                        dataKey="total"
                        fill="var(--color-total)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={36}
                      />
                      <Bar
                        dataKey="errors"
                        fill="var(--color-errors)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={36}
                      />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Recent API calls ──────────────────────────────────────────── */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="size-4 text-primary" />
                Recent API Calls
              </CardTitle>
              <CardDescription>
                Last 25 external calls across all services.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentLogs.length === 0 ? (
                <EmptyState
                  title="No API calls logged"
                  description="Recent external calls will be listed here once they happen."
                  icon={Clock}
                  className="py-8"
                />
              ) : (
                <div className="scroll-ocean max-h-96 overflow-y-auto overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[11px] uppercase">
                          Service
                        </TableHead>
                        <TableHead className="text-[11px] uppercase">
                          Endpoint
                        </TableHead>
                        <TableHead className="text-[11px] uppercase">
                          Method
                        </TableHead>
                        <TableHead className="text-[11px] uppercase">
                          Status
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase">
                          Duration
                        </TableHead>
                        <TableHead className="text-[11px] uppercase">
                          User
                        </TableHead>
                        <TableHead className="text-[11px] uppercase">
                          When
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentLogs.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-mono text-xs">
                            {l.service}
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                            {l.endpoint}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] uppercase">
                              {l.method}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                statusBadgeClass(l.status),
                              )}
                              title={statusLabel(l.status)}
                            >
                              {l.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {fmtMs(l.durationMs)}
                          </TableCell>
                          <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">
                            {l.userEmail ?? "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {timeAgo(l.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Secrets note ───────────────────────────────────────────────── */}
          <aside
            role="note"
            className="flex items-start gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 text-sm text-cyan-100"
          >
            <ShieldAlert className="size-4 shrink-0 text-cyan-300" />
            <p>
              API keys and secrets are managed via server environment variables
              and are never shown here. This view surfaces only request status
              codes, counts, and timings — never credentials or request bodies.
            </p>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export default ApiMonitoringView;
