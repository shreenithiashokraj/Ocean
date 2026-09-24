"use client";

/**
 * Marine Platform · Researcher module — eDNA & Taxonomy.
 *
 * Lists REAL ASV/OTU records from MarineEdnaAsv with the paper Table II
 * Darwin Core DNA-Derived-Data mapping, plus the Villon-style fallback
 * assignment per record. Species-ID honesty (paper §XIII) surfaced inline.
 */
import { useCallback, useEffect, useState } from "react";
import { Dna, RefreshCw, Search, Info } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";

interface AsvRow {
  id: string;
  asvId: string;
  scientificName: string | null;
  taxonRank: string | null;
  fallbackJson: string | null;
  confidence: number | null;
  targetGene: string | null;
  sequence: string | null;
  latitude: number | null;
  longitude: number | null;
  eventDate: string | null;
  source: string | null;
}

interface Summary {
  totalAsvs: number;
  taxonomicallyResolved: number;
  withCoordinates: number;
  byTargetGene: Record<string, number>;
  byTaxonRank: Record<string, number>;
  referenceDatabase: { connected: boolean; note: string };
}

interface FallbackEntry {
  rank: string;
  matched: string | null;
  similarity: number | null;
  basis: string;
}

export function EdnaTaxonomyView() {
  const [search, setSearch] = useState("");
  const [rank, setRank] = useState("");
  const [gene, setGene] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ asvs: AsvRow[]; total: number; summary: Summary } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AsvRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search.trim()) qs.set("search", search.trim());
      if (rank) qs.set("taxonRank", rank);
      if (gene) qs.set("targetGene", gene);
      const res = await fetch(`/api/marine/edna/asvs?${qs}`, { credentials: "include" });
      if (!res.ok) throw new ApiError((await res.json()).error ?? "Failed to load eDNA records", res.status);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load eDNA records");
    } finally {
      setLoading(false);
    }
  }, [search, rank, gene, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runFallback(asv: AsvRow) {
    try {
      const res = await fetch(`/api/marine/edna/taxonomy/${encodeURIComponent(asv.asvId)}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new ApiError((await res.json()).error ?? "Assignment failed", res.status);
      toast.success(`Taxonomy fallback evaluated for ${asv.asvId}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Assignment failed");
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1;
  const selectedFallback: FallbackEntry[] =
    selected?.fallbackJson ? (JSON.parse(selected.fallbackJson) as FallbackEntry[]) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Dna className="size-6 text-primary" /> eDNA & Taxonomy
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sequence-derived ASV/OTU records mapped to the Darwin Core DNA-Derived Data Extension
          (paper Table II): asv_id→occurrenceID, species_name→scientificName, marker_gene→target_gene.
        </p>
      </div>
      {/* Inline honesty caveat — surfaced, not buried (paper §XIII) */}
      {data && !data.summary.referenceDatabase.connected && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>{data.summary.referenceDatabase.note}</span>
        </div>
      )}

      {data && (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total ASVs</p>
            <p className="mt-1 text-2xl font-bold text-primary">{data.summary.totalAsvs}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Resolved to taxon</p>
            <p className="mt-1 text-2xl font-bold text-primary">{data.summary.taxonomicallyResolved}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">With coordinates</p>
            <p className="mt-1 text-2xl font-bold text-primary">{data.summary.withCoordinates}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Marker genes</p>
            <p className="mt-1 text-sm font-semibold text-primary">
              {Object.keys(data.summary.byTargetGene).length
                ? Object.entries(data.summary.byTargetGene).map(([g, n]) => `${g}: ${n}`).join(", ")
                : "none stored yet"}
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-6">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search ASV ID or species…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8"
            />
          </div>
          <select value={rank} onChange={(e) => { setRank(e.target.value); setPage(1); }}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="">All ranks</option>
            <option value="species">Species</option>
            <option value="genus">Genus</option>
            <option value="unresolved">Unresolved</option>
          </select>
          <Input placeholder="Marker gene (e.g. 12S)" value={gene}
            onChange={(e) => { setGene(e.target.value); setPage(1); }} className="w-44" />
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="size-4" /> Refresh
          </Button>
        </CardContent>
      </Card>
      {loading ? (
        <LoadingState label="Loading eDNA records…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data || data.asvs.length === 0 ? (
        <EmptyState
          title="No eDNA records stored"
          description="Records appear here once ingested through POST /api/marine/edna/ingest (paper Table II fields). Nothing is auto-generated — this deployment has no connected eDNA laboratory feed yet."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">ASV catalogue</CardTitle>
              <CardDescription>{data.total} records</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">occurrenceID</th>
                      <th className="py-2 pr-3">scientificName</th>
                      <th className="py-2 pr-3">Rank</th>
                      <th className="py-2 pr-3">target_gene</th>
                      <th className="py-2">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.asvs.map((a) => (
                      <tr key={a.id} onClick={() => setSelected(a)}
                        className={`cursor-pointer border-b border-border/30 transition hover:bg-muted/40 ${selected?.id === a.id ? "bg-muted/40" : ""}`}>
                        <td className="py-2 pr-3 font-mono text-xs">{a.asvId}</td>
                        <td className="py-2 pr-3 italic">{a.scientificName ?? "—"}</td>
                        <td className="py-2 pr-3">
                          <Badge variant="outline" className="text-[10px]">{a.taxonRank ?? "unresolved"}</Badge>
                        </td>
                        <td className="py-2 pr-3 text-xs">{a.targetGene ?? "—"}</td>
                        <td className="py-2 text-xs">
                          {a.confidence != null ? a.confidence.toFixed(2) : <span className="text-muted-foreground">n/a</span>}
                        </td>
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
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Sample details</CardTitle>
              <CardDescription>Taxonomy fallback lineage (Villon-style)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {selected ? (
                <>
                  <div className="flex justify-between"><span className="text-xs uppercase text-muted-foreground">ASV</span><span className="font-mono text-xs">{selected.asvId}</span></div>
                  {selected.scientificName && <div className="flex justify-between"><span className="text-xs uppercase text-muted-foreground">scientificName</span><span className="italic">{selected.scientificName}</span></div>}
                  {selected.targetGene && <div className="flex justify-between"><span className="text-xs uppercase text-muted-foreground">target_gene</span><span>{selected.targetGene}</span></div>}
                  {selected.latitude != null && selected.longitude != null && (
                    <div className="flex justify-between"><span className="text-xs uppercase text-muted-foreground">decimal coords</span><span>{selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}</span></div>
                  )}
                  {selected.eventDate && <div className="flex justify-between"><span className="text-xs uppercase text-muted-foreground">eventDate</span><span>{new Date(selected.eventDate).toLocaleDateString()}</span></div>}
                  {selected.source && <div className="flex justify-between"><span className="text-xs uppercase text-muted-foreground">source</span><span>{selected.source}</span></div>}
                  {selected.sequence && (
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">sequence</p>
                      <p className="mt-1 break-all rounded bg-muted/40 p-2 font-mono text-[10px]">{selected.sequence}</p>
                    </div>
                  )}
                  <div className="pt-2">
                    <p className="mb-1 text-xs uppercase text-muted-foreground">Fallback lineage</p>
                    {selectedFallback.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Not evaluated yet — run the fallback below.</p>
                    ) : (
                      selectedFallback.map((f, i) => (
                        <div key={i} className="mb-1 rounded-md border border-border/50 px-2 py-1.5 text-xs">
                          <Badge variant="outline" className="mr-2 text-[10px]">{f.rank}</Badge>
                          {f.matched ?? "no match"}
                          <p className="mt-1 text-muted-foreground">{f.basis}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => runFallback(selected)} className="w-full">
                    <Dna className="size-4" /> Run taxonomy fallback
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground">Select an ASV row to view its details.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}