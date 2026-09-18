"use client";

/**
 * Researcher Dashboard — Fisherman Module.
 *
 * Home view for RESEARCHER (and ADMIN) accounts. Shows aggregate research
 * data only — no individual fisherman identities are exposed. The view
 * pulls two endpoints in parallel:
 *   - `api.researcherFishingData()` — species distribution (PieChart),
 *     confidence buckets (BarChart), monthly trend (LineChart),
 *     recentSeaConditions (mini-table), alert + spot stats.
 *   - `api.researcherSeaConditions()` — total stored sea-condition records
 *     (StatCard count).
 *
 * All charts are populated from real DB aggregates computed server-side.
 * Sticky footer is handled by the AppShell.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Database,
  Fish,
  Info,
  LineChart,
  PieChart as PieChartIcon,
  RefreshCw,
  ShieldAlert,
  Waves,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as RechartsLineChart,
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
  CardSkeleton,
  EmptyState,
  ErrorState,
  LoadingState,
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
  }[];
  alertSummary: { severity: string; count: number; unread: number }[];
  fishingSpots: unknown[];
  monthlyTrend: { month: string; analyses: number }[];
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

// ── Time formatting ───────────────────────────────────────────────────────

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

function pct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

// ── Component ─────────────────────────────────────────────────────────────

export function ResearcherDashboardView() {
  const [fishingData, setFishingData] = useState<ResearcherFishingData | null>(
    null
  );
  const [seaRecords, setSeaRecords] = useState<StoredRecord[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fishing, sea] = await Promise.all([
        api.researcherFishingData(),
        api.researcherSeaConditions(),
      ]);
      setFishingData(fishing as ResearcherFishingData);
      setSeaRecords(sea.records as unknown as StoredRecord[]);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load research data.";
      setError(msg);
      toast.error("Failed to load research dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── Derived stats ──────────────────────────────────────────────────────
  const totalAnalyses = fishingData?.totalAnalyses ?? 0;
  const distinctSpecies = fishingData?.speciesDistribution.length ?? 0;
  const totalSeaRecords = seaRecords?.length ?? 0;
  const totalAlerts =
    fishingData?.alertSummary.reduce((sum, a) => sum + a.count, 0) ?? 0;
  const unreadAlerts =
    fishingData?.alertSummary.reduce((sum, a) => sum + a.unread, 0) ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* ── Header banner ─────────────────────────────────────────────────── */}
      <header className="glass-card animate-fade-up rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Researcher Dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Aggregate marine &amp; fishing data for research purposes.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchData()}
            disabled={loading}
            className="self-start"
            aria-label="Refresh dashboard"
          >
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            Refresh
          </Button>
        </div>
        <aside
          role="note"
          className="mt-4 flex items-start gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-xs text-purple-200"
        >
          <Info className="size-4 shrink-0 text-purple-300" />
          <p>
            Data shown is aggregated for research purposes. Individual
            fisherman identities are not exposed.
          </p>
        </aside>
      </header>

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <section
        className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        aria-label="Key research metrics"
      >
        {loading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Total Analyses"
              value={totalAnalyses}
              icon={Activity}
              accent="cyan"
              sub="Across all fishermen"
            />
            <StatCard
              label="Distinct Species"
              value={distinctSpecies}
              icon={Fish}
              accent="green"
              sub="From VLM classifications"
            />
            <StatCard
              label="Sea-Condition Records"
              value={totalSeaRecords}
              icon={Waves}
              accent="blue"
              sub="Stored environmental snapshots"
            />
            <StatCard
              label="Active Alerts"
              value={totalAlerts}
              icon={ShieldAlert}
              accent="amber"
              sub={`${unreadAlerts} unread`}
            />
          </>
        )}
      </section>

      {/* ── Error / loading state for charts ─────────────────────────────── */}
      {error ? (
        <div className="mt-6">
          <ErrorState
            title="Failed to load dashboard"
            message={error}
            onRetry={() => void fetchData()}
          />
        </div>
      ) : loading ? (
        <div className="mt-6">
          <LoadingState label="Aggregating research data…" />
        </div>
      ) : fishingData ? (
        <>
          {/* ── Charts row ────────────────────────────────────────────────── */}
          <section className="mt-6 grid gap-4 lg:grid-cols-3">
            {/* Species distribution — PieChart */}
            <Card className="glass-card animate-fade-up">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PieChartIcon className="size-4 text-cyan-400" />
                  Species Distribution
                </CardTitle>
                <CardDescription>
                  Observations grouped by classified species.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {fishingData.speciesDistribution.length === 0 ? (
                  <EmptyState
                    title="No species data yet"
                    description="Fish analyses will appear here once recorded."
                    icon={Fish}
                    className="py-8"
                  />
                ) : (
                  <ChartContainer
                    config={SPECIES_CHART_CONFIG}
                    className="mx-auto aspect-square max-h-[260px]"
                  >
                    <PieChart>
                      <Pie
                        data={fishingData.speciesDistribution.map((s) => ({
                          name: s.species,
                          value: s.count,
                          fill:
                            SPECIES_COLORS[
                              fishingData.speciesDistribution.indexOf(s) %
                                SPECIES_COLORS.length
                            ],
                        }))}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {fishingData.speciesDistribution.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={SPECIES_COLORS[idx % SPECIES_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <ChartTooltip
                        content={<ChartTooltipContent nameKey="name" />}
                      />
                    </PieChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* Confidence distribution — BarChart */}
            <Card className="glass-card animate-fade-up">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="size-4 text-emerald-400" />
                  Confidence Distribution
                </CardTitle>
                <CardDescription>
                  VLM confidence buckets across all analyses.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={CONFIDENCE_CHART_CONFIG}
                  className="aspect-square max-h-[260px] sm:aspect-[4/3]"
                >
                  <BarChart
                    data={fishingData.confidenceBuckets}
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
                    <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="count"
                      fill="var(--color-count)"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Monthly trend — LineChart */}
            <Card className="glass-card animate-fade-up">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <LineChart className="size-4 text-cyan-400" />
                  Monthly Analysis Trend
                </CardTitle>
                <CardDescription>
                  Fish analyses per month (last 6 months).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={TREND_CHART_CONFIG}
                  className="aspect-square max-h-[260px] sm:aspect-[4/3]"
                >
                  <RechartsLineChart
                    data={fishingData.monthlyTrend}
                    margin={{ top: 10, right: 10, bottom: 0, left: -10 }}
                  >
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
                    <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="analyses"
                      stroke="var(--color-analyses)"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "var(--color-analyses)" }}
                      activeDot={{ r: 5 }}
                    />
                  </RechartsLineChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </section>

          {/* ── Recent sea conditions mini-table ──────────────────────────── */}
          <section className="mt-6">
            <Card className="glass-card animate-fade-up">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="size-4 text-sky-400" />
                  Recent Sea Conditions
                </CardTitle>
                <CardDescription>
                  Last 5 stored environmental snapshots (no personal info).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {fishingData.recentSeaConditions.length === 0 ? (
                  <EmptyState
                    title="No sea-condition records yet"
                    description="Records are persisted as fishermen query live conditions."
                    icon={Waves}
                    className="py-6"
                  />
                ) : (
                  <div className="scroll-ocean max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Location</TableHead>
                          <TableHead>Coords</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Demo</TableHead>
                          <TableHead>Recorded</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fishingData.recentSeaConditions.slice(0, 5).map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">
                              {r.locationLabel || "—"}
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
        </>
      ) : null}
    </div>
  );
}

export default ResearcherDashboardView;
