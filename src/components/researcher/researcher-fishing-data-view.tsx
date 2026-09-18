"use client";

/**
 * Researcher Fishing Data & Reports — Fisherman Module.
 *
 * Full aggregate dashboard for RESEARCHER (and ADMIN) accounts. Pulls
 * `/api/researcher/fishing-data` once on mount and renders:
 *   - Species distribution (PieChart + sortable table).
 *   - Confidence buckets (BarChart).
 *   - Monthly analysis trend (AreaChart, last 6 months).
 *   - Fishing spots table (curated, environmental).
 *   - Alert severity summary (cards).
 *   - "Export CSV" button — downloads speciesDistribution as CSV
 *     (client-side Blob download, no server round-trip).
 *
 * No PII is displayed — only aggregate counts + species names + curated
 * spot data. Sticky footer handled by AppShell.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Database,
  Download,
  Fish,
  Info,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Waves,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";
import { StatCard } from "@/components/common/stat-card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Unavailable,
} from "@/components/common/states";

// ── Types ─────────────────────────────────────────────────────────────────

interface ResearcherFishingData {
  speciesDistribution: {
    species: string;
    count: number;
    avgConfidence: number | null;
  }[];
  confidenceBuckets: { bucket: string; count: number }[];
  totalAnalyses: number;
  recentSeaConditions: {
    id: string;
    latitude: number;
    longitude: number;
    locationLabel: string | null;
    source: string;
    isDemo: boolean;
    recordedAt: string;
    payload: string;
  }[];
  alertSummary: { severity: string; count: number; unread: number }[];
  fishingSpots: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    region: string | null;
    species: string | null;
    depthM: number | null;
    bottomType: string | null;
    source: string;
  }[];
  monthlyTrend: { month: string; analyses: number }[];
}

// ── Chart helpers ─────────────────────────────────────────────────────────

const SPECIES_COLORS = [
  "#22d3ee",
  "#34d399",
  "#f59e0b",
  "#a78bfa",
  "#fb7185",
  "#60a5fa",
  "#f472b6",
  "#facc15",
  "#2dd4bf",
  "#c084fc",
];

const SPECIES_CHART_CONFIG: ChartConfig = {
  count: { label: "Observations", color: "#22d3ee" },
};

const CONFIDENCE_CHART_CONFIG: ChartConfig = {
  count: { label: "Analyses", color: "#34d399" },
};

const TREND_CHART_CONFIG: ChartConfig = {
  analyses: { label: "Analyses", color: "#22d3ee" },
};

// ── Severity styling (mirror safety-alerts view) ──────────────────────────

const SEVERITY_STYLES: Record<
  string,
  { chip: string; label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  LOW: { chip: "border-slate-500/40 bg-slate-500/15 text-slate-300", label: "Low", icon: Info },
  MODERATE: { chip: "border-amber-500/40 bg-amber-500/15 text-amber-300", label: "Moderate", icon: AlertTriangle },
  HIGH: { chip: "border-orange-500/40 bg-orange-500/15 text-orange-300", label: "High", icon: AlertOctagon },
  CRITICAL: { chip: "border-rose-500/40 bg-rose-500/15 text-rose-300", label: "Critical", icon: ShieldAlert },
};

// ── Number / time helpers ─────────────────────────────────────────────────

function pct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

// ── Component ─────────────────────────────────────────────────────────────

export function ResearcherFishingDataView() {
  const [data, setData] = useState<ResearcherFishingData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.researcherFishingData();
      setData(res as ResearcherFishingData);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load research data.";
      setError(msg);
      toast.error("Failed to load aggregate fishing data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── CSV export (species distribution) ───────────────────────────────────
  const handleExportCsv = useCallback(() => {
    if (!data || data.speciesDistribution.length === 0) {
      toast.info("No species data to export.");
      return;
    }
    const rows = [
      ["species", "count", "avg_confidence"],
      ...data.speciesDistribution.map((s) => [
        s.species,
        String(s.count),
        s.avgConfidence != null ? s.avgConfidence.toFixed(4) : "",
      ]),
    ];
    // Quote species names in case they contain commas.
    const csv = rows
      .map((r) =>
        r
          .map((cell) => {
            const v = String(cell);
            if (v.includes(",") || v.includes("\"") || v.includes("\n")) {
              return `"${v.replace(/"/g, "\"\"")}"`;
            }
            return v;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `species-distribution-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("CSV exported.");
  }, [data]);

  // Memo: species chart data with stable color mapping
  const speciesChartData = useMemo(() => {
    if (!data) return [];
    return data.speciesDistribution.map((s, idx) => ({
      name: s.species,
      value: s.count,
      fill: SPECIES_COLORS[idx % SPECIES_COLORS.length],
    }));
  }, [data]);

  const totalAlerts =
    data?.alertSummary.reduce((sum, a) => sum + a.count, 0) ?? 0;
  const unreadAlerts =
    data?.alertSummary.reduce((sum, a) => sum + a.unread, 0) ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="glass-card animate-fade-up rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Fishing Data &amp; Reports
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Aggregate observations across the fleet — species distribution,
              model confidence, trends, and curated fishing grounds.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchData()}
              disabled={loading}
            >
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleExportCsv}
              disabled={!data || data.speciesDistribution.length === 0}
            >
              <Download className="size-4" />
              Export CSV
            </Button>
          </div>
        </div>
        <aside
          role="note"
          className="mt-4 flex items-start gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-xs text-purple-200"
        >
          <Info className="size-4 shrink-0 text-purple-300" />
          <p>
            Data shown is aggregated for research purposes. Individual
            fisherman identities, SavedLocations, and personal account info
            are not exposed by this view.
          </p>
        </aside>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {error ? (
        <div className="mt-6">
          <ErrorState
            title="Failed to load report"
            message={error}
            onRetry={() => void fetchData()}
          />
        </div>
      ) : loading ? (
        <div className="mt-6">
          <LoadingState label="Aggregating research data…" />
        </div>
      ) : data ? (
        <>
          {/* ── Top stats ─────────────────────────────────────────────────── */}
          <section
            className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
            aria-label="Report summary"
          >
            <StatCard
              label="Total Analyses"
              value={data.totalAnalyses}
              icon={Activity}
              accent="cyan"
              sub="All fishermen"
            />
            <StatCard
              label="Distinct Species"
              value={data.speciesDistribution.length}
              icon={Fish}
              accent="green"
              sub="VLM-classified"
            />
            <StatCard
              label="Total Alerts"
              value={totalAlerts}
              icon={ShieldAlert}
              accent="amber"
              sub={`${unreadAlerts} unread`}
            />
            <StatCard
              label="Curated Spots"
              value={data.fishingSpots.length}
              icon={MapPin}
              accent="purple"
              sub="OpenStreetMap"
            />
          </section>

          {/* ── Charts row 1: species pie + confidence bar ─────────────────── */}
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            {/* Species distribution — PieChart */}
            <Card className="glass-card animate-fade-up">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Fish className="size-4 text-cyan-400" />
                  Species Distribution
                </CardTitle>
                <CardDescription>
                  Observations grouped by classified species.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.speciesDistribution.length === 0 ? (
                  <EmptyState
                    title="No species data yet"
                    description="Fish analyses will appear here once recorded."
                    icon={Fish}
                    className="py-8"
                  />
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <ChartContainer
                      config={SPECIES_CHART_CONFIG}
                      className="mx-auto aspect-square max-h-[260px]"
                    >
                      <PieChart>
                        <Pie
                          data={speciesChartData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={50}
                          outerRadius={90}
                          paddingAngle={2}
                        >
                          {speciesChartData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.fill} />
                          ))}
                        </Pie>
                        <ChartTooltip
                          content={<ChartTooltipContent nameKey="name" />}
                        />
                      </PieChart>
                    </ChartContainer>
                    <div className="scroll-ocean max-h-[260px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Species</TableHead>
                            <TableHead className="text-right">N</TableHead>
                            <TableHead className="text-right">Conf.</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.speciesDistribution.map((s, idx) => (
                            <TableRow key={s.species}>
                              <TableCell className="py-1.5 font-medium">
                                <span className="flex items-center gap-2">
                                  <span
                                    className="inline-block size-2.5 rounded-full"
                                    style={{
                                      backgroundColor:
                                        SPECIES_COLORS[
                                          idx % SPECIES_COLORS.length
                                        ],
                                    }}
                                    aria-hidden
                                  />
                                  {s.species}
                                </span>
                              </TableCell>
                              <TableCell className="py-1.5 text-right tabular-nums">
                                {s.count}
                              </TableCell>
                              <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground">
                                {pct(s.avgConfidence)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Confidence buckets — BarChart */}
            <Card className="glass-card animate-fade-up">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="size-4 text-emerald-400" />
                  Confidence Distribution
                </CardTitle>
                <CardDescription>
                  VLM confidence buckets across all analyses.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={CONFIDENCE_CHART_CONFIG}
                  className="aspect-[4/3] max-h-[300px] w-full"
                >
                  <BarChart
                    data={data.confidenceBuckets}
                    margin={{ top: 10, right: 10, bottom: 0, left: -10 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.08)"
                    />
                    <XAxis
                      dataKey="bucket"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                    />
                    <YAxis
                      allowDecimals={false}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent />}
                    />
                    <Bar
                      dataKey="count"
                      fill="var(--color-count)"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </section>

          {/* ── Monthly trend — AreaChart ─────────────────────────────────── */}
          <section className="mt-6">
            <Card className="glass-card animate-fade-up">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="size-4 text-cyan-400" />
                  Monthly Analysis Trend
                </CardTitle>
                <CardDescription>
                  Fish analyses per month over the last 6 months.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={TREND_CHART_CONFIG}
                  className="aspect-[5/2] max-h-[280px] w-full"
                >
                  <AreaChart
                    data={data.monthlyTrend}
                    margin={{ top: 10, right: 10, bottom: 0, left: -10 }}
                  >
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.55} />
                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.08)"
                    />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                    />
                    <YAxis
                      allowDecimals={false}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="analyses"
                      stroke="var(--color-analyses)"
                      strokeWidth={2.5}
                      fill="url(#trendGrad)"
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </section>

          {/* ── Alert summary + Fishing spots ─────────────────────────────── */}
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            {/* Alert severity summary */}
            <Card className="glass-card animate-fade-up">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlert className="size-4 text-amber-400" />
                  Alert Severity Summary
                </CardTitle>
                <CardDescription>
                  Aggregate counts across all stored WeatherAlerts.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.alertSummary.length === 0 ? (
                  <EmptyState
                    title="No alerts recorded"
                    description="Alerts appear once the alert engine has run."
                    icon={ShieldAlert}
                    className="py-8"
                  />
                ) : (
                  <ul className="space-y-2">
                    {data.alertSummary.map((a) => {
                      const style =
                        SEVERITY_STYLES[a.severity] ??
                        ({
                          chip:
                            "border-slate-500/40 bg-slate-500/15 text-slate-300",
                          label: a.severity,
                          icon: Info,
                        } as const);
                      const Icon = style.icon;
                      return (
                        <li
                          key={a.severity}
                          className="glass-card flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon className="size-4 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              {style.label}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${style.chip}`}
                            >
                              {a.severity}
                            </Badge>
                          </div>
                          <div className="flex items-baseline gap-3 text-right">
                            <span className="text-lg font-bold tabular-nums">
                              {a.count}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {a.unread} unread
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Fishing spots table */}
            <Card className="glass-card animate-fade-up">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="size-4 text-purple-400" />
                  Curated Fishing Spots
                </CardTitle>
                <CardDescription>
                  Harbour &amp; offshore spots from the project seed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.fishingSpots.length === 0 ? (
                  <EmptyState
                    title="No spots curated"
                    description="Run the seed to populate the curated harbour list."
                    icon={MapPin}
                    className="py-8"
                  />
                ) : (
                  <div className="scroll-ocean max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Region</TableHead>
                          <TableHead>Depth</TableHead>
                          <TableHead>Bottom</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.fishingSpots.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">
                              {s.name}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {s.region || "—"}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums text-muted-foreground">
                              {s.depthM != null ? `${s.depthM} m` : "—"}
                            </TableCell>
                            <TableCell>
                              {s.bottomType ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  {s.bottomType}
                                </Badge>
                              ) : (
                                <Unavailable />
                              )}
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

          {/* ── Recent sea conditions mini-strip ─────────────────────────── */}
          <section className="mt-6">
            <Card className="glass-card animate-fade-up">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Waves className="size-4 text-sky-400" />
                  Recent Sea-Condition Snapshots
                </CardTitle>
                <CardDescription>
                  Last 10 stored environmental records (no personal info).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.recentSeaConditions.length === 0 ? (
                  <EmptyState
                    title="No sea-condition records"
                    description="Records accumulate as fishermen query live conditions."
                    icon={Database}
                    className="py-6"
                  />
                ) : (
                  <div className="scroll-ocean max-h-72 overflow-y-auto">
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
                        {data.recentSeaConditions.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">
                              {r.locationLabel || "—"}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums text-muted-foreground">
                              {r.latitude.toFixed(3)},{" "}
                              {r.longitude.toFixed(3)}
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
                              {new Date(r.recordedAt).toLocaleString()}
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
        </>
      ) : null}
    </div>
  );
}

export default ResearcherFishingDataView;
