"use client";

/**
 * Researcher Data Explorer — Fisherman Module (Task F5).
 *
 * Lists the 4 REAL datasets backed by stored DB observations
 * (sea-condition snapshots, AI fish-analysis predictions, fishing spots,
 * weather alerts). No PII is ever shown — the fish-analyses dataset strips
 * owner identity on the server, and the other datasets are environmental /
 * public-record.
 *
 * On "Explore dataset" the user navigates to the dataset-details view
 * (Zustand store carries the selected key).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Database,
  Filter,
  Layers,
  Map as MapIcon,
  RefreshCw,
  Search,
  ShieldAlert,
  Waves,
} from "lucide-react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/lib/store";
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

// ── Component ─────────────────────────────────────────────────────────────────

export function ResearcherDataExplorerView() {
  const setView = useAppStore((s) => s.setView);
  const setSelectedDatasetKey = useAppStore((s) => s.setSelectedDatasetKey);

  const [raw, setRaw] = useState<DatasetSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [dataType, setDataType] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      setError(msg);
      toast.error("Failed to load research datasets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Client-side filter (the registry is small — 4 datasets).
  const filtered = useMemo(() => {
    if (!raw) return [];
    const s = search.trim().toLowerCase();
    return raw.filter((d) => {
      if (s && !d.name.toLowerCase().includes(s) && !d.description.toLowerCase().includes(s))
        return false;
      if (dataType !== "all" && d.dataType !== dataType) return false;
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      return true;
    });
  }, [raw, search, dataType, statusFilter]);

  function openDataset(key: string) {
    setSelectedDatasetKey(key);
    setView("researcher.dataset-details");
  }

  const dataTypeOptions = useMemo(() => {
    const set = new Set<string>();
    raw?.forEach((d) => set.add(d.dataType));
    return Array.from(set);
  }, [raw]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="glass-card animate-fade-up rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Research Data Explorer
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Real datasets backed by stored observations — no PII.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="self-start"
            aria-label="Refresh datasets"
          >
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            Refresh
          </Button>
        </div>
      </header>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <section
        className="glass-card mt-4 flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center"
        aria-label="Filter datasets"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by dataset name…"
            className="pl-9"
            aria-label="Search datasets by name"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <Select value={dataType} onValueChange={setDataType}>
            <SelectTrigger className="w-[180px]" aria-label="Filter by data type">
              <SelectValue placeholder="Data type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {dataTypeOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </section>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      {error ? (
        <div className="mt-4">
          <ErrorState message={error} onRetry={() => void load()} />
        </div>
      ) : loading && !raw ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : !raw || raw.length === 0 ? (
        <div className="mt-4">
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
        <div className="mt-4">
          <EmptyState
            title="No datasets match your filters"
            description="Try clearing the search or selecting a different data type."
            icon={Filter}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setDataType("all");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <section
          className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Dataset catalogue"
        >
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
        </section>
      )}

      {loading && raw ? (
        <div className="mt-4">
          <LoadingState label="Refreshing…" />
        </div>
      ) : null}
    </div>
  );
}

export default ResearcherDataExplorerView;
