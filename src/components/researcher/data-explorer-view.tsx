"use client";

/**
 * Researcher → Unified Data Explorer.
 *
 * One search and one set of filters across the three domains described in the
 * OceanInsight paper — Oceanographic, Fisheries and Molecular Biodiversity /
 * eDNA — plus the dataset catalogue this view already provided.
 *
 * DATA: every record comes from the real `/api/researcher/explorer` endpoint,
 * which fans out over stored observations (sea conditions, AI fish-analysis
 * predictions, fishing spots, weather alerts). Nothing is hardcoded, no PII is
 * shown (the fish-analyses rows are stripped of owner identity on the server),
 * and the eDNA domain honestly reports that it has no connected source yet
 * instead of inventing records.
 *
 * The existing "Explore dataset" flow is preserved: selecting a catalogue card
 * still routes to the dataset-details view via the Zustand store.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Dna,
  ExternalLink,
  Filter,
  Layers,
  Map as MapIcon,
  RefreshCw,
  Search,
  ShieldAlert,
  Waves,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type ExplorerDomainInfo,
  type MarineRecordRow,
  type MarineRecordSearchResult,
} from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  CardSkeleton,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/states";


// ── Types (mirror the API contract in src/lib/api.ts) ────────────────────────

interface DatasetField {
  key: string;
  label: string;
  type: string;
  options?: string[];
}

interface DatasetSummary {
  key: string;
  name: string;
  description: string;
  dataType: string;
  source: string;
  status: string;
  fields: DatasetField[];
  recordCount: number;
  coverage: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } | null;
  lastUpdated: string | null;
}

interface DatasetsResponse {
  datasets: DatasetSummary[];
}

// ── Per-dataset accent icon ─────────────────────────────────────────────────

function iconFor(key: string) {
  switch (key) {
    case "sea-conditions":
      return Waves;
    case "fish-analyses":
      return Layers;
    case "fishing-spots":
      return MapIcon;
    case "alerts":
      return ShieldAlert;
    default:
      return Database;
  }
}

function accentFor(key: string): "cyan" | "green" | "amber" | "red" {
  switch (key) {
    case "sea-conditions":
      return "cyan";
    case "fish-analyses":
      return "green";
    case "fishing-spots":
      return "amber";
    case "alerts":
      return "red";
    default:
      return "cyan";
  }
}

function formatBounds(b: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}): string {
  const f = (n: number) => n.toFixed(2);
  return `N ${f(b.maxLat)} · S ${f(b.minLat)} · E ${f(b.maxLng)} · W ${f(b.minLng)}`;
}

function formatLastUpdated(iso: string | null): string {
  if (!iso) return "Never";
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

// ── Unified Data Explorer helpers ────────────────────────────────────────────

const PAGE_SIZE = 25;

/** Domains for the filter, in the order used by the project paper. */
const DOMAIN_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All Domains" },
  { value: "oceanographic", label: "Oceanographic" },
  { value: "fisheries", label: "Fisheries" },
  { value: "edna", label: "Molecular Biodiversity / eDNA" },
];

/** Registry data types that belong to each domain (used by the catalogue). */
const DOMAIN_DATA_TYPES: Record<string, string[] | null> = {
  all: null,
  oceanographic: ["Oceanographic"],
  fisheries: ["Fisheries"],
  edna: [],
};

function domainIcon(domainKey: string) {
  if (domainKey === "oceanographic") return Waves;
  if (domainKey === "fisheries") return Layers;
  if (domainKey === "edna") return Dna;
  return Database;
}

function domainBadgeClass(domainKey: string | null): string {
  switch (domainKey) {
    case "oceanographic":
      return "border-cyan-500/40 bg-cyan-500/10 text-cyan-300";
    case "fisheries":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "edna":
      return "border-purple-500/40 bg-purple-500/10 text-purple-300";
    default:
      return "border-border/60 bg-muted/20 text-muted-foreground";
  }
}

function statusBadgeClass(status: string): string {
  switch (status.toUpperCase()) {
    case "ACTIVE":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "ACKNOWLEDGED":
      return "border-cyan-500/40 bg-cyan-500/10 text-cyan-300";
    case "EXPIRED":
      return "border-amber-500/40 bg-amber-500/10 text-amber-300";
    case "RESOLVED":
      return "border-sky-500/40 bg-sky-500/10 text-sky-300";
    case "ARCHIVED":
      return "border-border/60 bg-muted/20 text-muted-foreground";
    default:
      return "border-border/60 bg-muted/20 text-foreground/80";
  }
}

function fmtCoord(lat: number | null, lng: number | null): string {
  if (typeof lat !== "number" || typeof lng !== "number") return "—";
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/** Compact date/time for the results table and the record-details panel. */
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

// ── Component ─────────────────────────────────────────────────────────────────

export function ResearcherDataExplorerView() {
  const setView = useAppStore((s) => s.setView);
  const setSelectedDatasetKey = useAppStore((s) => s.setSelectedDatasetKey);

  // ── Dataset catalogue (existing behaviour, preserved) ────────────────────
  const [raw, setRaw] = useState<DatasetSummary[] | null>(null);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);

  // ── Unified Data Explorer filters ────────────────────────────────────────
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("all");
  const [datasetKey, setDatasetKey] = useState("all");
  const [source, setSource] = useState("all");
  const [location, setLocation] = useState("");
  const [taxon, setTaxon] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  // ── Unified Data Explorer data ───────────────────────────────────────────
  const [result, setResult] = useState<MarineRecordSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MarineRecordRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // ── Catalogue load (unchanged existing endpoint) ──────────────────────────
  const load = useCallback(async () => {
    setCatalogueLoading(true);
    setCatalogueError(null);
    try {
      const r = await api.listResearcherDatasets();
      setRaw((r as unknown as DatasetsResponse).datasets);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Failed to load datasets.";
      setCatalogueError(msg);
      toast.error("Failed to load research datasets.");
    } finally {
      setCatalogueLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Debounced free-text search (~300ms) ──────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Every filter change returns to page 1 so paging stays consistent.
  const changeSearch = (value: string) => {
    setSearchInput(value);
    setPage(1);
  };
  const changeDomain = (value: string) => {
    setDomain(value);
    setDatasetKey("all");
    setPage(1);
  };
  const changeDataset = (value: string) => {
    setDatasetKey(value);
    setPage(1);
  };
  const changeSource = (value: string) => {
    setSource(value);
    setPage(1);
  };
  const changeLocation = (value: string) => {
    setLocation(value);
    setPage(1);
  };
  const changeTaxon = (value: string) => {
    setTaxon(value);
    setPage(1);
  };
  const changeFrom = (value: string) => {
    setFrom(value);
    setPage(1);
  };
  const changeTo = (value: string) => {
    setTo(value);
    setPage(1);
  };

  // ── Unified record search (real API, real database records) ──────────────
  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.searchMarineRecords({
        domain: domain === "all" ? undefined : domain,
        dataset: datasetKey === "all" ? undefined : datasetKey,
        search: search || undefined,
        source: source === "all" ? undefined : source,
        location: location.trim() || undefined,
        taxon: taxon.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setResult(r);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Failed to search marine records.";
      setError(msg);
      toast.error("Failed to search marine records.");
    } finally {
      setLoading(false);
    }
  }, [domain, datasetKey, search, source, location, taxon, from, to, page]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  // ── Derived values ───────────────────────────────────────────────────────
  const activeDomain = useMemo(
    () => result?.domains.find((d) => d.key === domain) ?? null,
    [result, domain]
  );

  const sourceOptions = result?.sources ?? [];

  const datasetOptions = useMemo(() => {
    if (!raw) return [];
    const allowed = activeDomain ? activeDomain.datasetKeys : raw.map((d) => d.key);
    return raw.filter((d) => allowed.includes(d.key));
  }, [raw, activeDomain]);

  const hasFilters =
    !!(search || location || taxon || from || to) ||
    domain !== "all" ||
    datasetKey !== "all" ||
    source !== "all";

  // Catalogue cards keep their existing filtering — now driven by the shared
  // search + domain controls (the domain maps onto registry data types).
  const filtered = useMemo(() => {
    if (!raw) return [];
    const s = search.trim().toLowerCase();
    const types = DOMAIN_DATA_TYPES[domain] ?? null;
    return raw.filter((d) => {
      if (s && !d.name.toLowerCase().includes(s) && !d.description.toLowerCase().includes(s))
        return false;
      if (types && !types.includes(d.dataType)) return false;
      return true;
    });
  }, [raw, search, domain]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  const emptyDescription = useMemo(() => {
    if (activeDomain && !activeDomain.hasSource) {
      return (
        activeDomain.note ??
        "This domain has no connected data source in this deployment yet."
      );
    }
    if (hasFilters) {
      return "No records match the current search and filters. Try widening the date range or clearing a filter.";
    }
    return "No marine records have been recorded for the selected datasets yet.";
  }, [activeDomain, hasFilters]);

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setDomain("all");
    setDatasetKey("all");
    setSource("all");
    setLocation("");
    setTaxon("");
    setFrom("");
    setTo("");
    setPage(1);
  }

  function openDataset(key: string) {
    setSelectedDatasetKey(key);
    setView("researcher.dataset-details");
  }

  function openRecord(record: MarineRecordRow) {
    setSelected(record);
    setDetailOpen(true);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="glass-card animate-fade-up rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Unified Data Explorer
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Explore standardized oceanographic, fisheries, and molecular biodiversity data.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadRecords()}
            disabled={loading}
            className="self-start"
            aria-label="Refresh marine records"
          >
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            Refresh
          </Button>
        </div>
      </header>

      {/* ── Search + domain filter ──────────────────────────────────────────── */}
      <section
        className="glass-card mt-4 rounded-xl p-4"
        aria-label="Search and filter marine records"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => changeSearch(e.target.value)}
            placeholder="Search species, location, dataset, taxon..."
            className="pl-9"
            aria-label="Search species, location, dataset, taxon"
          />
        </div>

        {/* Domain filter */}
        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filter by domain"
        >
          {DOMAIN_FILTERS.map((d) => {
            const Icon = domainIcon(d.value);
            const active = domain === d.value;
            const count =
              d.value === "all"
                ? (result?.domains ?? []).reduce((sum, x) => sum + x.recordCount, 0)
                : result?.domains.find((x) => x.key === d.value)?.recordCount;
            return (
              <Button
                key={d.value}
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => changeDomain(d.value)}
                aria-pressed={active}
                className="text-xs"
              >
                <Icon className="mr-1.5 size-3.5" />
                {d.label}
                {typeof count === "number" && (
                  <span className="ml-1.5 tabular-nums opacity-70">
                    ({count.toLocaleString()})
                  </span>
                )}
              </Button>
            );
          })}
        </div>
        {/* Practical filters — every one maps to a real stored column */}
        <div className="mt-3 flex items-center gap-2">
          <Filter className="size-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Refine results
          </span>
        </div>

        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div>
            <label
              htmlFor="explorer-dataset"
              className="text-xs font-medium text-muted-foreground"
            >
              Dataset type
            </label>
            <Select value={datasetKey} onValueChange={changeDataset}>
              <SelectTrigger
                id="explorer-dataset"
                className="mt-1 w-full"
                aria-label="Filter by dataset"
              >
                <SelectValue placeholder="All datasets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All datasets</SelectItem>
                {datasetOptions.map((d) => (
                  <SelectItem key={d.key} value={d.key}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label
              htmlFor="explorer-source"
              className="text-xs font-medium text-muted-foreground"
            >
              Data source
            </label>
            <Select value={source} onValueChange={changeSource}>
              <SelectTrigger
                id="explorer-source"
                className="mt-1 w-full"
                aria-label="Filter by data source"
              >
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sourceOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label
              htmlFor="explorer-location"
              className="text-xs font-medium text-muted-foreground"
            >
              Location
            </label>
            <Input
              id="explorer-location"
              value={location}
              onChange={(e) => changeLocation(e.target.value)}
              placeholder="e.g. Chennai"
              className="mt-1"
            />
          </div>

          <div>
            <label
              htmlFor="explorer-taxon"
              className="text-xs font-medium text-muted-foreground"
            >
              Species / taxon
            </label>
            <Input
              id="explorer-taxon"
              value={taxon}
              onChange={(e) => changeTaxon(e.target.value)}
              placeholder="e.g. Tuna"
              className="mt-1"
            />
          </div>

          <div>
            <label
              htmlFor="explorer-from"
              className="text-xs font-medium text-muted-foreground"
            >
              Collected from
            </label>
            <Input
              id="explorer-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => changeFrom(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <label
              htmlFor="explorer-to"
              className="text-xs font-medium text-muted-foreground"
            >
              Collected to
            </label>
            <Input
              id="explorer-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => changeTo(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Filters use stored columns only: datasets without a column (for example
            species on sea conditions) are excluded while that filter is active.
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={clearFilters}
            disabled={!hasFilters}
            aria-label="Clear all explorer filters"
          >
            <X className="mr-1 size-3.5" />
            Clear filters
          </Button>
        </div>
      </section>

      {/* ── Unified results ─────────────────────────────────────────────────── */}
      <Card className="glass-card animate-fade-up mt-4">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Marine records</CardTitle>
            <p className="text-xs text-muted-foreground">
              {result
                ? `${result.total.toLocaleString()} matching record${result.total === 1 ? "" : "s"} · page ${result.page} of ${totalPages}`
                : "Loading…"}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <ErrorState message={error} onRetry={() => void loadRecords()} />
          ) : loading && !result ? (
            <LoadingState label="Loading marine records…" />
          ) : !result || result.records.length === 0 ? (
            <EmptyState
              title="No marine records found."
              description={emptyDescription}
              icon={Database}
            />
          ) : (
            <>
              {result.truncated && (
                <p className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90">
                  One dataset holds more than 500 matching records — narrow the filters
                  for exhaustive coverage.
                </p>
              )}

              <div className="scroll-ocean overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px] uppercase">Dataset / Record</TableHead>
                      <TableHead className="text-[11px] uppercase">Domain</TableHead>
                      <TableHead className="text-[11px] uppercase">Species / Taxon</TableHead>
                      <TableHead className="text-[11px] uppercase">Location</TableHead>
                      <TableHead className="text-[11px] uppercase">Date</TableHead>
                      <TableHead className="text-[11px] uppercase">Source</TableHead>
                      <TableHead className="text-[11px] uppercase">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.records.map((r) => (
                      <TableRow
                        key={`${r.datasetKey}-${r.id}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => openRecord(r)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openRecord(r);
                          }
                        }}
                        className="cursor-pointer"
                        aria-label={`Open details for ${r.title}`}
                      >
                        <TableCell className="max-w-[220px] whitespace-normal text-xs">
                          <div className="font-medium text-foreground">{r.title}</div>
                          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {r.datasetName}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", domainBadgeClass(r.domainKey))}
                          >
                            {r.domainLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-foreground/90">
                          {r.taxon || "—"}
                        </TableCell>
                        <TableCell className="max-w-[200px] whitespace-normal text-xs text-muted-foreground">
                          {r.location || "—"}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">
                          {fmtDateTime(r.occurredAt)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.source}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", statusBadgeClass(r.status))}
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
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
                      if (Number.isFinite(n) && n >= 1 && n <= totalPages) setPage(n);
                    }}
                    className="h-8 w-16 text-center tabular-nums"
                    aria-label="Page number"
                  />
                  <span>of {totalPages}</span>
                  {loading && <span className="animate-pulse">· updating…</span>}
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
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Dataset catalogue (existing cards, preserved) ───────────────────── */}
      <section className="mt-6" aria-label="Dataset catalogue">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight">Dataset catalogue</h2>
          <p className="text-xs text-muted-foreground">
            {raw
              ? `${filtered.length} of ${raw.length} registered datasets shown`
              : "Registered research datasets"}
          </p>
        </div>

        {catalogueError ? (
          <div className="mt-3">
            <ErrorState message={catalogueError} onRetry={() => void load()} />
          </div>
        ) : catalogueLoading && !raw ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : !raw || raw.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No datasets available"
              description="The dataset registry could not be loaded."
              icon={Database}
              action={
                <Button size="sm" variant="outline" onClick={() => void load()}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No datasets match your filters"
              description="Clear the search or switch back to All Domains."
              icon={Filter}
              action={
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d) => {
            const Icon = iconFor(d.key);
            const accent = accentFor(d.key);
            const accents: Record<string, string> = {
              cyan: "from-cyan-500/20 to-cyan-500/5 text-cyan-400",
              green: "from-emerald-500/20 to-emerald-500/5 text-emerald-400",
              amber: "from-amber-500/20 to-amber-500/5 text-amber-400",
              red: "from-rose-500/20 to-rose-500/5 text-rose-400",
            };
            return (
              <Card key={d.key} className="glass-card animate-fade-up flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={`flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${accents[accent]}`}
                    >
                      <Icon className="size-5" />
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {d.dataType === "Oceanographic" ? (
                        <Badge
                          variant="outline"
                          className="border-cyan-500/40 bg-cyan-500/10 text-[10px] text-cyan-300"
                        >
                          {d.dataType}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300"
                        >
                          {d.dataType}
                        </Badge>
                      )}
                      {d.status === "active" ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300"
                        >
                          Active
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-muted-foreground/40 bg-muted/20 text-[10px] text-muted-foreground"
                        >
                          Archived
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CardTitle className="mt-2 text-base leading-snug">{d.name}</CardTitle>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-3">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {d.description}
                  </p>

                  <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Records
                      </span>
                      <span className="text-2xl font-bold tabular-nums">
                        {d.recordCount.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <dl className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex justify-between gap-2">
                      <dt>Source</dt>
                      <dd className="truncate text-right font-medium text-foreground/80">
                        {d.source}
                      </dd>
                    </div>
                    {d.coverage && (
                      <div className="flex flex-col gap-0.5">
                        <dt>Coverage</dt>
                        <dd className="font-mono text-[11px] text-foreground/80">
                          {formatBounds(d.coverage)}
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-2">
                      <dt>Last updated</dt>
                      <dd className="font-medium text-foreground/80">
                        {formatLastUpdated(d.lastUpdated)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-auto flex flex-wrap gap-1.5">
                    {d.fields.slice(0, 4).map((f) => (
                      <Badge
                        key={f.key}
                        variant="outline"
                        className="text-[10px] text-muted-foreground"
                      >
                        {f.label}
                      </Badge>
                    ))}
                  </div>

                  <Button
                    size="sm"
                    className="mt-1 w-full"
                    onClick={() => openDataset(d.key)}
                    aria-label={`Explore ${d.name} dataset`}
                  >
                    Explore dataset
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
        )}
      </section>

      {/* ── Record details ──────────────────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="scroll-ocean max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-left">{selected.title}</DialogTitle>
                <DialogDescription className="text-left">
                  {selected.datasetName} · {selected.domainLabel}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("text-[10px]", domainBadgeClass(selected.domainKey))}
                >
                  {selected.domainLabel}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn("text-[10px]", statusBadgeClass(selected.status))}
                >
                  {selected.status}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => openDataset(selected.datasetKey)}
                  aria-label={`Open ${selected.datasetName} dataset view`}
                >
                  <ExternalLink className="mr-1 size-3" />
                  Open dataset view
                </Button>
              </div>

              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {[
                  { label: "Record ID", value: selected.id, mono: true },
                  { label: "Domain", value: selected.domainLabel, mono: false },
                  { label: "Dataset", value: selected.datasetName, mono: false },
                  { label: "Species / taxon", value: selected.taxon || "—", mono: false },
                  { label: "Location", value: selected.location || "—", mono: false },
                  {
                    label: "Coordinates",
                    value: fmtCoord(selected.latitude, selected.longitude),
                    mono: true,
                  },
                  {
                    label: "Collection date",
                    value: fmtDateTime(selected.occurredAt),
                    mono: false,
                  },
                  { label: "Source / provenance", value: selected.source, mono: false },
                  { label: "Status", value: selected.status, mono: false },
                ].map((row) => (
                  <div key={row.label} className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {row.label}
                    </dt>
                    <dd
                      className={cn(
                        "break-words text-sm text-foreground/90",
                        row.mono && "font-mono text-xs"
                      )}
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>

              {selected.details.length > 0 && (
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Record metadata
                  </p>
                  <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                    {selected.details.map((d) => (
                      <div
                        key={d.label}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <dt className="text-xs text-muted-foreground">{d.label}</dt>
                        <dd className="break-words text-right text-xs font-medium text-foreground/90">
                          {d.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <DialogFooter>
                <Button size="sm" variant="outline" onClick={() => setDetailOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ResearcherDataExplorerView;
