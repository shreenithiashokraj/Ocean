"use client";

/**
 * Marine Platform · Researcher module — Species & Biodiversity.
 *
 * Searches, filters and paginates REAL standardized species observations
 * (MarineSpeciesObservation), shows Shannon diversity per spatial cell
 * (paper Eq. 4) with honest per-cell states, and maps geolocated cells on the
 * shared Leaflet component. All data from /api/marine/biodiversity/*.
 */
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Fish, RefreshCw, Search, Info } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";

const LeafletMap = dynamic(
  () => import("@/components/location/leaflet-map").then((m) => m.LeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[300px] w-full items-center justify-center rounded-xl bg-muted/30 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 size-4 animate-spin" />
        Loading map…
      </div>
    ),
  }
);

interface SpeciesRow {
  id: string;
  scientificName: string | null;
  taxonRank: string | null;
  dwc: Record<string, string>;
  latitude: number | null;
  longitude: number | null;
  occurredAt: string | null;
  count: number;
  originTable: string;
  hasCoordinates: boolean;
}

interface SpeciesResponse {
  species: SpeciesRow[];
  total: number;
  summary: { distinctSpecies: number; totalObservations: number };
}

interface CellDiversity {
  cellKey: string | null;
  label: string | null;
  status: "computed" | "single-species" | "no-observations";
  shannonH?: number;
  speciesCount: number;
  individualCount: number;
}

interface DiversityResponse {
  cellSizeDeg: number;
  minSpeciesForShannon: number;
  global: CellDiversity;
  cells: CellDiversity[];
  summary: { totalCells: number; computedCells: number; singleSpeciesCells: number; note: string };
}

function cellCenter(cellKey: string): { lat: number; lng: number } | null {
  const [a, b] = cellKey.split(":").map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { lat: a + 0.5, lng: b + 0.5 };
}

function shannonColor(h: number): string {
  const t = Math.min(1, Math.max(0, h / 2.2));
  const r = Math.round(248 - t * 200);
  const g = Math.round(113 - t * 60);
  const b = Math.round(113 + t * 60);
  return `rgb(${r},${g},${b})`;
}

export function SpeciesBiodiversityView() {
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState("");
  const [page, setPage] = useState(1);
  const [species, setSpecies] = useState<SpeciesResponse | null>(null);
  const [diversity, setDiversity] = useState<DiversityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SpeciesRow | null>(null);

  const loadSpecies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search.trim()) qs.set("search", search.trim());
      if (origin) qs.set("origin", origin);
      const res = await fetch(`/api/marine/biodiversity/species?${qs}`, { credentials: "include" });
      if (!res.ok) throw new ApiError((await res.json()).error ?? "Failed to load species", res.status);
      setSpecies(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load species");
    } finally {
      setLoading(false);
    }
  }, [search, origin, page]);

  const loadDiversity = useCallback(async () => {
    try {
      const res = await fetch("/api/marine/biodiversity/diversity", { credentials: "include" });
      if (!res.ok) throw new ApiError((await res.json()).error ?? "Failed to load diversity", res.status);
      setDiversity(await res.json());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load diversity metrics");
    }
  }, []);

  useEffect(() => {
    void loadSpecies();
  }, [loadSpecies]);

  useEffect(() => {
    void loadDiversity();
  }, [loadDiversity]);

  async function resync() {
    try {
      const res = await fetch("/api/marine/biodiversity/sync", { method: "POST", credentials: "include" });
      if (!res.ok) throw new ApiError((await res.json()).error ?? "Sync failed", res.status);
      toast.success("Species observations re-synced from source tables");
      await Promise.all([loadSpecies(), loadDiversity()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    }
  }

  const totalPages = species ? Math.max(1, Math.ceil(species.total / 20)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Fish className="size-6 text-primary" /> Species & Biodiversity
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Standardized species occurrences with Darwin Core metadata and Shannon diversity
          (H = −Σ pᵢ ln pᵢ) computed from real stored records.
        </p>
      </div>
      {/* Summary stats */}
      {species && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Distinct species</p>
            <p className="mt-1 text-2xl font-bold text-primary">{species.summary.distinctSpecies}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total observations</p>
            <p className="mt-1 text-2xl font-bold text-primary">{species.summary.totalObservations}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Cells with Shannon computed</p>
            <p className="mt-1 text-2xl font-bold text-primary">
              {diversity ? `${diversity.summary.computedCells} / ${diversity.summary.totalCells}` : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Search + filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-6">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search scientific name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8"
            />
          </div>
          <select
            value={origin}
            onChange={(e) => {
              setOrigin(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">All sources</option>
            <option value="fishing-spot">Fishing spots</option>
            <option value="fish-analysis">AI fish analyses</option>
            <option value="catch-record">Catch records</option>
            <option value="dataset-record">Research datasets</option>
          </select>
          <Button variant="outline" size="sm" onClick={resync}>
            <RefreshCw className="size-4" /> Re-sync sources
          </Button>
        </CardContent>
      </Card>
      {loading ? (
        <LoadingState label="Loading species observations…" />
      ) : error ? (
        <ErrorState message={error} onRetry={loadSpecies} />
      ) : !species || species.species.length === 0 ? (
        <EmptyState
          title="No species observations yet"
          description="Click “Re-sync sources” to materialize species from fishing spots, AI analyses, catch records and research datasets."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Species catalogue</CardTitle>
              <CardDescription>{species.total} occurrence records</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">Scientific name</th>
                      <th className="py-2 pr-3">Rank</th>
                      <th className="py-2 pr-3">Source</th>
                      <th className="py-2 pr-3">Count</th>
                      <th className="py-2">Geo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {species.species.map((s) => (
                      <tr
                        key={s.id}
                        onClick={() => setSelected(s)}
                        className={`cursor-pointer border-b border-border/30 transition hover:bg-muted/40 ${selected?.id === s.id ? "bg-muted/40" : ""}`}
                      >
                        <td className="py-2 pr-3 font-medium italic">{s.scientificName ?? "—"}</td>
                        <td className="py-2 pr-3">
                          <Badge variant="outline" className="text-[10px]">{s.taxonRank ?? "—"}</Badge>
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{s.originTable}</td>
                        <td className="py-2 pr-3">{s.count}</td>
                        <td className="py-2">{s.hasCoordinates ? "✓" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>Page {page} / {totalPages}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Species detail + spatial diversity */}
          <div className="space-y-4 lg:col-span-2">
            {selected ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base italic">{selected.scientificName}</CardTitle>
                  <CardDescription>Darwin Core record (paper Table II mapping)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {Object.entries(selected.dwc).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 border-b border-border/30 pb-1">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
                      <span className="text-right">{v}</span>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">coordinates</span>
                    <span className="text-right">
                      {selected.hasCoordinates ? `${selected.latitude?.toFixed(4)}, ${selected.longitude?.toFixed(4)}` : "not recorded for this source"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  Select a species row to view its Darwin Core details.
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Spatial diversity</CardTitle>
                <CardDescription>
                  Cell size {diversity?.cellSizeDeg}° · min {diversity?.minSpeciesForShannon} species for Shannon
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {diversity && diversity.global.status === "computed" && (
                  <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
                    Global Shannon H = <span className="font-bold">{diversity.global.shannonH?.toFixed(4)}</span>{" "}
                    across {diversity.global.speciesCount} species.
                  </div>
                )}
                {diversity && diversity.cells.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No geolocated observations yet — the spatial layer needs records with coordinates.
                  </p>
                )}
                {diversity?.cells.map((c) => (
                  <div key={c.cellKey} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2 text-sm">
                    <span className="font-mono text-xs">{c.label ?? c.cellKey}</span>
                    {c.status === "computed" ? (
                      <Badge variant="outline" className="text-cyan-300">H = {c.shannonH?.toFixed(3)} · {c.speciesCount} sp.</Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-300">
                        {c.status === "single-species" ? "1 species only — H not computable" : "no observations"}
                      </Badge>
                    )}
                  </div>
                ))}
                {diversity?.cells.some((c) => c.status === "single-species") && (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Info className="mt-0.5 size-3 shrink-0" />
                    “Single-species” cells hold observations but fewer distinct species than Shannon requires —
                    distinct from cells with no data at all.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      {/* Map layer */}
      {diversity && diversity.cells.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Biodiversity map</CardTitle>
            <CardDescription>Cell colour: red (low H) → cyan (high H)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[380px] overflow-hidden rounded-xl">
              <LeafletMap
                markers={diversity.cells
                  .filter((c) => c.cellKey)
                  .map((c) => {
                    const center = cellCenter(c.cellKey!);
                    if (!center) return null;
                    return {
                      lat: center.lat,
                      lng: center.lng,
                      title: c.label ?? c.cellKey!,
                      color: c.status === "computed" ? shannonColor(c.shannonH ?? 0) : "#f59e0b",
                      popup:
                        c.status === "computed"
                          ? `H = ${c.shannonH?.toFixed(4)} · ${c.speciesCount} species · ${c.individualCount} individuals`
                          : c.status === "single-species"
                            ? `${c.speciesCount} species only — insufficient for Shannon`
                            : "no observations",
                    };
                  })
                  .filter((m): m is NonNullable<typeof m> => m !== null)}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}