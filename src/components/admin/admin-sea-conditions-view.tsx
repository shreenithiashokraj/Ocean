"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Code2, MapPin, RefreshCw, User, Waves } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AdminSeaCondition {
  id: string;
  latitude: number;
  longitude: number;
  locationLabel: string | null;
  source: string;
  isDemo: boolean;
  recordedAt: string;
  createdAt: string;
  payload: string;
  user: { name: string; email: string } | null;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function prettyPayload(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw || "(empty payload)";
  }
}

export function AdminSeaConditionsView() {
  const [records, setRecords] = useState<AdminSeaCondition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminSeaCondition | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.getAdminSeaConditions();
      setRecords(r.records as AdminSeaCondition[]);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load records";
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
    return {
      total: list.length,
      demo: list.filter((r) => r.isDemo).length,
      live: list.filter((r) => !r.isDemo).length,
    };
  }, [records]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sea Conditions (Admin)</h1>
          <p className="text-sm text-muted-foreground">
            Every persisted sea-condition snapshot across all users.
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
          <p className="text-[10px] uppercase text-muted-foreground">Live</p>
          <p className="text-xl font-semibold tabular-nums text-emerald-300">{stats.live}</p>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <p className="text-[10px] uppercase text-muted-foreground">Demo</p>
          <p className="text-xl font-semibold tabular-nums text-amber-300">{stats.demo}</p>
        </div>
      </div>

      <Card className="glass-card mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Waves className="size-4 text-primary" />
            Condition Records
          </CardTitle>
          <CardDescription>
            Click any row to inspect the full JSON payload stored at capture time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : loading && !records ? (
            <LoadingState label="Loading records…" />
          ) : records && records.length === 0 ? (
            <EmptyState
              title="No sea-condition records yet"
              description="Records appear once any user fetches live or demo conditions."
              icon={Waves}
            />
          ) : records ? (
            <div className="scroll-ocean max-h-[32rem] overflow-y-auto overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] uppercase">Location</TableHead>
                    <TableHead className="text-[11px] uppercase">Coords</TableHead>
                    <TableHead className="text-[11px] uppercase">Source</TableHead>
                    <TableHead className="text-[11px] uppercase">Mode</TableHead>
                    <TableHead className="text-[11px] uppercase">User</TableHead>
                    <TableHead className="text-[11px] uppercase">Recorded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-accent/40"
                      onClick={() => setSelected(r)}
                    >
                      <TableCell className="max-w-[200px]">
                        <div className="flex items-center gap-2">
                          <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm font-medium">
                            {r.locationLabel ?? "Unnamed"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
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
                            className="border-amber-500/40 bg-amber-500/15 text-[10px] text-amber-300"
                          >
                            demo
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/40 bg-emerald-500/15 text-[10px] text-emerald-300"
                          >
                            live
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        {r.user ? (
                          <div className="flex items-center gap-1.5">
                            <User className="size-3 shrink-0 text-muted-foreground" />
                            <span className="truncate text-xs">{r.user.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">system</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmtTime(r.recordedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Full payload dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code2 className="size-4 text-primary" />
              Sea-Condition Payload
            </DialogTitle>
            <DialogDescription>
              {selected?.locationLabel ?? "Unnamed"} ·{" "}
              {selected ? `${selected.latitude.toFixed(4)}, ${selected.longitude.toFixed(4)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{selected.source}</Badge>
                {selected.isDemo ? (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/15 text-amber-300"
                  >
                    demo
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  >
                    live
                  </Badge>
                )}
                <Badge variant="outline">{fmtTime(selected.recordedAt)}</Badge>
              </div>
              <pre className="scroll-ocean max-h-80 overflow-auto rounded-lg border border-border/60 bg-card/40 p-3 text-[11px] leading-relaxed text-foreground/90">
                {prettyPayload(selected.payload)}
              </pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminSeaConditionsView;
