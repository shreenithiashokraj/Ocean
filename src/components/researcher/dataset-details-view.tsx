"use client";

/**
 * Researcher Dataset Details — Fisherman Module (Task F5).
 *
 * Reads `selectedDatasetKey` from the Zustand store, fetches the paginated
 * records from `/api/researcher/datasets/:key?page=&pageSize=&search=`,
 * renders a chart suited to the dataset (built from the CURRENT page's records),
 * a paginated data table with debounced search, and a "Save as report" dialog
 * that POSTs to `/api/researcher/reports`.
 *
 * No PII is rendered — the fish-analyses dataset is stripped of owner
 * identity on the server, the other datasets are environmental / public.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Database,
  Info,
  Save,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/states";
import { StatCard } from "@/components/common/stat-card";

// ── Types (mirror API contract in src/lib/api.ts) ────────────────────────────

interface DatasetField {
  key: string;
  label: string;
  type: string;
  options?: string[];
}

interface DatasetMeta {
  key: string;
  name: string;
  description: string;
  dataType: string;
  source: string;
  status: string;
  fields: DatasetField[];
}

interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface DatasetDetailsResponse {
  dataset: DatasetMeta;
  records: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  recordCount: number;
  coverage: Bounds | null;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtBounds(b: Bounds): string {
  const f = (n: number) => n.toFixed(2);
  return `N ${f(b.maxLat)} · S ${f(b.minLat)} · E ${f(b.maxLng)} · W ${f(b.minLng)}`;
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "—";
    if (v > 1000) return v.toLocaleString();
    return String(v);
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") {
    // ISO timestamp?
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDateTime(v);
    return v;
  }
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function pct(n: unknown): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

// ── Chart bucket builders (current page's records) ──────────────────────────

const CONFIDENCE_BUCKETS = [
  { bucket: "<0.50", min: 0, max: 0.5 },
  { bucket: "0.50–0.70", min: 0.5, max: 0.7 },
  { bucket: "0.70–0.85", min: 0.7, max: 0.85 },
  { bucket: ">0.85", min: 0.85, max: 1.01 },
];

function buildFishConfidenceBuckets(records: Record<string, unknown>[]) {
  const counts = CONFIDENCE_BUCKETS.map((b) => ({ bucket: b.bucket, count: 0 }));
  for (const r of records) {
    const c = typeof r.confidence === "number" ? r.confidence : NaN;
    if (!Number.isFinite(c)) continue;
    const idx = CONFIDENCE_BUCKETS.findIndex((b) => c >= b.min && c < b.max);
    if (idx >= 0) counts[idx].count++;
  }
  return counts;
}

function buildCountByField(
  records: Record<string, unknown>[],
  field: string
): { bucket: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of records) {
    const raw = r[field];
    const key =
      raw === null || raw === undefined || raw === ""
        ? "Unknown"
        : String(raw);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([bucket, count]) => ({ bucket, count }));
}

// ── Per-dataset chart config ─────────────────────────────────────────────────

const CHART_CONFIG: ChartConfig = {
  count: { label: "Records", color: "#22d3ee" },
};

const CHART_COLORS: Record<string, string> = {
  "sea-conditions": "#22d3ee",
  "fish-analyses": "#34d399",
  "fishing-spots": "#f59e0b",
  alerts: "#fb7185",
};

// ── Per-dataset column descriptors ───────────────────────────────────────────

interface ColumnDef {
  key: string;
  label: string;
  fmt?: (v: unknown) => string;
  className?: string;
}

function columnsFor(key: string): ColumnDef[] {
  switch (key) {
    case "sea-conditions":
      return [
        { key: "locationLabel", label: "Location" },
        {
          key: "lat",
          label: "Lat",
          fmt: (v) => (typeof v === "number" ? v.toFixed(3) : fmtCell(v)),
          className: "tabular-nums text-muted-foreground",
        },
        {
          key: "lng",
          label: "Lng",
          fmt: (v) => (typeof v === "number" ? v.toFixed(3) : fmtCell(v)),
          className: "tabular-nums text-muted-foreground",
        },
        { key: "source", label: "Source" },
        { key: "isDemo", label: "Demo", fmt: (v) => (v ? "Demo" : "Live") },
        { key: "recordedAt", label: "Recorded", fmt: (v) => fmtDateTime(v as string) },
      ];
    case "fish-analyses":
      return [
        { key: "species", label: "Species" },
        { key: "confidence", label: "Conf.", fmt: (v) => pct(v) },
        { key: "sizeRange", label: "Size" },
        { key: "weightRange", label: "Weight" },
        { key: "createdAt", label: "Created", fmt: (v) => fmtDateTime(v as string) },
      ];
    case "fishing-spots":
      return [
        { key: "name", label: "Name" },
        { key: "region", label: "Region" },
        { key: "bottomType", label: "Bottom" },
        {
          key: "depthM",
          label: "Depth (m)",
          fmt: (v) => (typeof v === "number" ? v.toFixed(1) : "—"),
          className: "tabular-nums",
        },
        { key: "source", label: "Source" },
      ];
    case "alerts":
      return [
        { key: "title", label: "Title" },
        { key: "severity", label: "Severity" },
        { key: "type", label: "Type" },
        { key: "status", label: "Status" },
        { key: "location", label: "Location" },
        { key: "createdAt", label: "Created", fmt: (v) => fmtDateTime(v as string) },
      ];
    default:
      return [];
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

export function ResearcherDatasetDetailsView() {
  const selectedKey = useAppStore((s) => s.selectedDatasetKey);
  const setView = useAppStore((s) => s.setView);

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<DatasetDetailsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Save-as-report dialog state
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Debounced search (~300ms)
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (!selectedKey) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.getResearcherDataset(selectedKey, {
        page,
        pageSize: PAGE_SIZE,
        search: search || undefined,
      });
      setData(r as unknown as DatasetDetailsResponse);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Failed to load dataset.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedKey, page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  // When the dataset changes, reset everything.
  useEffect(() => {
    setPage(1);
    setSearchInput("");
    setSearch("");
    setData(null);
  }, [selectedKey]);

  // Prefill save-dialog title with the dataset name when the dataset changes.
  useEffect(() => {
    if (data) {
      setSaveTitle(`${data.dataset.name} — snapshot`);
      setSaveDesc("");
    }
  }, [data?.dataset.key]);

  // ── Chart data derived from the CURRENT page's records ─────────────────────
  // Computed BEFORE the early return so the hooks order is stable across renders.
  const chartData = useMemo<{ bucket: string; count: number }[]>(() => {
    if (!data || !selectedKey) return [];
    switch (selectedKey) {
      case "fish-analyses":
        return buildFishConfidenceBuckets(data.records);
      case "sea-conditions":
        return buildCountByField(data.records, "source");
      case "alerts":
        return buildCountByField(data.records, "severity");
      case "fishing-spots":
        return buildCountByField(data.records, "bottomType");
      default:
        return [];
    }
  }, [data, selectedKey]);

  const chartTitle = useMemo(() => {
    switch (selectedKey) {
      case "fish-analyses":
        return "Confidence distribution (this page)";
      case "sea-conditions":
        return "Records by source (this page)";
      case "alerts":
        return "Records by severity (this page)";
      case "fishing-spots":
        return "Records by bottom type (this page)";
      default:
        return "Distribution (this page)";
    }
  }, [selectedKey]);

  // ── No dataset key? Show "go back" empty state (AFTER all hooks) ────────
  if (!selectedKey) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          title="No dataset selected"
          description="Pick a dataset from the explorer to view its records."
          icon={Database}
          action={
            <Button size="sm" onClick={() => setView("researcher.data-explorer")}>
              <ArrowLeft className="mr-1 size-4" />
              Back to explorer
            </Button>
          }
        />
      </div>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  // ── Save-as-report ─────────────────────────────────────────────────────────
  async function handleSave() {
    if (!data) return;
    const title = saveTitle.trim();
    if (title.length < 2) {
      toast.error("Title must be at least 2 characters.");
      return;
    }
    setSaving(true);
    try {
      await api.createResearcherReport({
        title,
        description: saveDesc.trim() || undefined,
        datasetKey: selectedKey!,
        filters: { search, page, pageSize: PAGE_SIZE },
        summary: {
          recordCount: data.recordCount,
          total: data.total,
          coverage: data.coverage,
        },
      });
      toast.success("Report saved.");
      setSaveOpen(false);
      setView("researcher.reports");
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Failed to save report.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const columns = columnsFor(selectedKey);
  const accentColor = CHART_COLORS[selectedKey] ?? "#22d3ee";
  const chartCfg: ChartConfig = {
    count: { label: "Records", color: accentColor },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* ── Back button ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setView("researcher.data-explorer")}
          className="glass-card"
          aria-label="Back to data explorer"
        >
          <ArrowLeft className="mr-1 size-4" />
          Back to explorer
        </Button>
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorState message={error} onRetry={() => void load()} />
        </div>
      ) : loading && !data ? (
        <div className="mt-6">
          <LoadingState label="Loading dataset…" />
        </div>
      ) : data ? (
        <>
          {/* ── Dataset header ──────────────────────────────────────────────── */}
          <header className="glass-card animate-fade-up mt-4 rounded-2xl p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    {data.dataset.name}
                  </h1>
                  {data.dataset.dataType === "Oceanographic" ? (
                    <Badge
                      variant="outline"
                      className="border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                    >
                      {data.dataset.dataType}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    >
                      {data.dataset.dataType}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  >
                    {data.dataset.status}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.dataset.description}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">Source:</span>{" "}
                  {data.dataset.source}
                  {data.coverage && (
                    <>
                      {"  ·  "}
                      <span className="font-medium text-foreground/80">Coverage:</span>{" "}
                      <span className="font-mono">{fmtBounds(data.coverage)}</span>
                    </>
                  )}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setSaveOpen(true)}
                className="shrink-0"
                aria-label="Save current view as a report"
              >
                <Save className="mr-1 size-4" />
                Save as report
              </Button>
            </div>
          </header>

          {/* ── StatCards row ─────────────────────────────────────────────────── */}
          <section
            className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3"
            aria-label="Dataset summary"
          >
            <StatCard
              label="Total records"
              value={data.recordCount.toLocaleString()}
              icon={Database}
              accent="cyan"
              sub="Across all pages"
            />
            <StatCard
              label="Matching search"
              value={data.total.toLocaleString()}
              icon={Search}
              accent="green"
              sub={search ? `Query: "${search}"` : "No search filter"}
            />
            <StatCard
              label="Coverage"
              value={data.coverage ? "Available" : "None"}
              icon={Info}
              accent="amber"
              sub={data.coverage ? fmtBounds(data.coverage) : "No geographic bounds"}
            />
          </section>

          {/* ── Chart (current page) ────────────────────────────────────────── */}
          <Card className="glass-card animate-fade-up mt-4">
            <CardHeader>
              <CardTitle className="text-base">{chartTitle}</CardTitle>
              <CardDescription>
                Aggregated from the records on the current page only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <EmptyState
                  title="No records to chart"
                  description="Once records are loaded, a distribution chart appears here."
                  icon={Database}
                  className="py-6"
                />
              ) : (
                <ChartContainer
                  config={chartCfg}
                  className="aspect-square max-h-[280px] sm:aspect-[4/3]"
                >
                  <BarChart
                    data={chartData}
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
                      fill={`var(--color-count)`}
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* ── Search + table ───────────────────────────────────────────────── */}
          <Card className="glass-card animate-fade-up mt-4">
            <CardHeader>
              <CardTitle className="text-base">Records</CardTitle>
              <CardDescription>
                Page {data.page} of {totalPages} · {data.total.toLocaleString()} matching
                records.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search records…"
                    className="pl-9"
                    aria-label="Search records"
                  />
                </div>
                {searchInput && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchInput("")}
                  >
                    Clear
                  </Button>
                )}
              </div>

              {loading ? (
                <LoadingState label="Loading records…" />
              ) : data.records.length === 0 ? (
                <EmptyState
                  title="No records found"
                  description={
                    selectedKey === "sea-conditions"
                      ? "No sea-condition observations yet. Fishermen must log sea conditions for data to appear."
                      : selectedKey === "fish-analyses"
                        ? "No fish-analysis predictions yet. Fishermen must run the AI fish-analysis module for data to appear."
                        : selectedKey === "alerts"
                          ? "No weather alerts yet. The alert engine creates alerts when thresholds are breached."
                          : "No fishing spots are registered yet."
                  }
                  icon={Database}
                  className="py-6"
                />
              ) : (
                <div className="scroll-ocean overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {columns.map((c) => (
                          <TableHead key={c.key} className="text-[11px] uppercase">
                            {c.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.records.map((r, idx) => {
                        const id =
                          typeof r.id === "string"
                            ? r.id
                            : `row-${data.page}-${idx}`;
                        return (
                          <TableRow key={id}>
                            {columns.map((c) => (
                              <TableCell
                                key={c.key}
                                className={`whitespace-nowrap text-xs ${c.className ?? ""}`}
                              >
                                {c.fmt ? c.fmt(r[c.key]) : fmtCell(r[c.key])}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* ── Pagination ──────────────────────────────────────────────── */}
              <div className="mt-3 flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                >
                  <ChevronLeft className="mr-1 size-4" />
                  Prev
                </Button>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Page</span>
                  <Input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={page}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n) && n >= 1 && n <= totalPages) {
                        setPage(n);
                      }
                    }}
                    className="h-8 w-16 text-center tabular-nums"
                    aria-label="Page number"
                  />
                  <span>of {totalPages}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                >
                  Next
                  <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* ── Save-as-report dialog ──────────────────────────────────────────────── */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as research report</DialogTitle>
            <DialogDescription>
              Captures the current filters + summary as a snapshot you can revisit
              later from the Reports view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label
                htmlFor="report-title"
                className="text-xs font-medium text-muted-foreground"
              >
                Title
              </label>
              <Input
                id="report-title"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder="e.g. Sea-condition snapshot Q1"
                className="mt-1"
              />
            </div>
            <div>
              <label
                htmlFor="report-desc"
                className="text-xs font-medium text-muted-foreground"
              >
                Description (optional)
              </label>
              <Input
                id="report-desc"
                value={saveDesc}
                onChange={(e) => setSaveDesc(e.target.value)}
                placeholder="Short note about what's interesting in this snapshot"
                className="mt-1"
              />
            </div>
            <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              <div>
                Dataset:{" "}
                <span className="font-mono">{selectedKey}</span>
              </div>
              <div>
                Filters: page {page}, search "{search || "(none)"}"
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving…" : "Save report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ResearcherDatasetDetailsView;
