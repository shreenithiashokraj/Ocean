"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Fish, ImageIcon, RefreshCw, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState, ErrorState, EmptyState, Unavailable } from "@/components/common/states";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AdminFishAnalysis {
  id: string;
  species: string | null;
  confidence: number | null;
  sizeRange: string | null;
  weightRange: string | null;
  notes: string | null;
  qualityWarning: string | null;
  pricePerKg: string | null;
  currency: string | null;
  market: string | null;
  createdAt: string;
  hasImage: boolean;
  user: { name: string; email: string } | null;
}

function fmtTime(iso: string): string {
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

function pct(c: number | null): number {
  if (c == null || !Number.isFinite(c)) return 0;
  // Stored as 0..1 — multiply to get a percentage.
  if (c <= 1) return Math.round(c * 100);
  // If somehow stored as 0..100 already, clamp.
  return Math.min(100, Math.max(0, Math.round(c)));
}

export function AdminFishAnalysesView() {
  const [records, setRecords] = useState<AdminFishAnalysis[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.getAdminFishAnalyses();
      setRecords(r.records as AdminFishAnalysis[]);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load analyses";
      setError(msg);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const list = records ?? [];
    const withSpecies = list.filter((r) => !!r.species);
    const avgConf =
      withSpecies.length === 0
        ? 0
        : withSpecies.reduce((s, r) => s + (r.confidence ?? 0), 0) / withSpecies.length;
    return {
      total: list.length,
      identified: withSpecies.length,
      avgConfidence: Math.round((avgConf <= 1 ? avgConf : avgConf / 100) * 100),
    };
  }, [records]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fish Analysis Records</h1>
          <p className="text-sm text-muted-foreground">
            Every VLM analysis run by every fisherman across the platform.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </header>

      <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-md">
        <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2">
          <p className="text-[10px] uppercase text-muted-foreground">Total</p>
          <p className="text-xl font-semibold tabular-nums">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
          <p className="text-[10px] uppercase text-muted-foreground">Identified</p>
          <p className="text-xl font-semibold tabular-nums text-emerald-300">{stats.identified}</p>
        </div>
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2">
          <p className="text-[10px] uppercase text-muted-foreground">Avg conf.</p>
          <p className="text-xl font-semibold tabular-nums text-cyan-300">{stats.avgConfidence}%</p>
        </div>
      </div>

      <Card className="glass-card mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Fish className="size-4 text-primary" />
            Analyses
          </CardTitle>
          <CardDescription>
            Images are stored privately per user and not surfaced in this list view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : loading && !records ? (
            <LoadingState label="Loading analyses…" />
          ) : records && records.length === 0 ? (
            <EmptyState
              title="No analyses yet"
              description="Analyses appear once any fisherman uploads an image."
              icon={Fish}
            />
          ) : records ? (
            <div className="scroll-ocean max-h-[32rem] overflow-y-auto overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] uppercase">Species</TableHead>
                    <TableHead className="text-[11px] uppercase">Confidence</TableHead>
                    <TableHead className="text-[11px] uppercase">Size</TableHead>
                    <TableHead className="text-[11px] uppercase">Weight</TableHead>
                    <TableHead className="text-[11px] uppercase">User</TableHead>
                    <TableHead className="text-[11px] uppercase">Image</TableHead>
                    <TableHead className="text-[11px] uppercase">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-[180px]">
                        {r.species ? (
                          <span className="truncate text-sm font-medium">{r.species}</span>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-rose-500/40 bg-rose-500/15 text-[10px] text-rose-300"
                          >
                            failed
                          </Badge>
                        )}
                        {r.qualityWarning && (
                          <p className="mt-0.5 truncate text-[10px] text-amber-300">
                            {r.qualityWarning}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.confidence != null ? (
                          <div className="flex w-28 items-center gap-2">
                            <Progress value={pct(r.confidence)} className="h-2" />
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {pct(r.confidence)}%
                            </span>
                          </div>
                        ) : (
                          <Unavailable />
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.sizeRange ?? <Unavailable />}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.weightRange ?? <Unavailable />}
                      </TableCell>
                      <TableCell className="max-w-[140px]">
                        {r.user ? (
                          <div className="flex items-center gap-1.5">
                            <User className="size-3 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="truncate text-xs">{r.user.name}</p>
                              <p className="truncate text-[10px] text-muted-foreground">
                                {r.user.email}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.hasImage ? (
                          <span className="inline-flex items-center gap-1 text-cyan-300">
                            <ImageIcon className="size-3.5" />
                            <span className="text-[10px]">stored</span>
                          </span>
                        ) : (
                          <Unavailable />
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmtTime(r.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminFishAnalysesView;
