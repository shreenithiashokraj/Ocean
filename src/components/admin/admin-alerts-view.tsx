"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Radio, RefreshCw, ShieldAlert, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AdminAlert {
  id: string;
  title: string;
  type: string;
  severity: string;
  location: string | null;
  isRead: boolean;
  createdAt: string;
}

const SEVERITIES = ["ALL", "LOW", "MODERATE", "HIGH", "CRITICAL"] as const;

const SEVERITY_CHIP: Record<string, string> = {
  LOW: "border-slate-500/40 bg-slate-500/15 text-slate-300",
  MODERATE: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  HIGH: "border-orange-500/40 bg-orange-500/15 text-orange-300",
  CRITICAL: "border-rose-500/40 bg-rose-500/15 text-rose-300",
};

const TYPE_CHIP: Record<string, string> = {
  WIND: "border-cyan-500/40 bg-cyan-500/15 text-cyan-300",
  WAVE: "border-blue-500/40 bg-blue-500/15 text-blue-300",
  RAIN: "border-sky-500/40 bg-sky-500/15 text-sky-300",
  STORM: "border-rose-500/40 bg-rose-500/15 text-rose-300",
  VISIBILITY: "border-slate-500/40 bg-slate-500/15 text-slate-300",
  SEA_STATE: "border-purple-500/40 bg-purple-500/15 text-purple-300",
  TEMPERATURE: "border-amber-500/40 bg-amber-500/15 text-amber-300",
};

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

async function fetchAdminAlerts(): Promise<AdminAlert[]> {
  // No admin-specific alerts list endpoint exists; the admin can see ALL
  // alerts via the public `/api/alerts` route (which returns own + broadcast).
  // For a fuller cross-user view, we hit `/api/alerts` directly here; admins
  // see broadcast + their own — same shape as the fisherman's list.
  const r = await fetch("/api/alerts", { credentials: "include" });
  const body = await r.json();
  if (!r.ok) {
    throw new ApiError(
      (body && body.error) || `Request failed (${r.status})`,
      r.status,
      body
    );
  }
  return (body.alerts ?? []) as AdminAlert[];
}

export function AdminAlertsView() {
  const [alerts, setAlerts] = useState<AdminAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchAdminAlerts();
      setAlerts(list);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load alerts";
      setError(msg);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const list = alerts ?? [];
    if (severity === "ALL") return list;
    return list.filter((a) => a.severity === severity);
  }, [alerts, severity]);

  const stats = useMemo(() => {
    const list = alerts ?? [];
    return {
      total: list.length,
      critical: list.filter((a) => a.severity === "CRITICAL").length,
      unread: list.filter((a) => !a.isRead).length,
    };
  }, [alerts]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alerts (Admin)</h1>
          <p className="text-sm text-muted-foreground">
            Every alert the engine has emitted — broadcast and per-user.
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
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
          <p className="text-[10px] uppercase text-muted-foreground">Critical</p>
          <p className="text-xl font-semibold tabular-nums text-rose-300">{stats.critical}</p>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <p className="text-[10px] uppercase text-muted-foreground">Unread</p>
          <p className="text-xl font-semibold tabular-nums text-amber-300">{stats.unread}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Filter by severity</span>
        <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
          <SelectTrigger size="sm" className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITIES.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "ALL" ? "All severities" : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="glass-card mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="size-4 text-primary" />
            All Alerts
          </CardTitle>
          <CardDescription>
            Use the Safety &amp; Alerts module to run the engine; this view is
            read-only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : loading && !alerts ? (
            <LoadingState label="Loading alerts…" />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No alerts to show"
              description="Run the alert engine to populate this list."
              icon={ShieldAlert}
            />
          ) : (
            <div className="scroll-ocean max-h-[32rem] overflow-y-auto overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] uppercase">Title</TableHead>
                    <TableHead className="text-[11px] uppercase">Type</TableHead>
                    <TableHead className="text-[11px] uppercase">Severity</TableHead>
                    <TableHead className="text-[11px] uppercase">Location</TableHead>
                    <TableHead className="text-[11px] uppercase">User</TableHead>
                    <TableHead className="text-[11px] uppercase">Read</TableHead>
                    <TableHead className="text-[11px] uppercase">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="max-w-[260px]">
                        <p className="truncate text-sm font-medium">{a.title}</p>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] uppercase", TYPE_CHIP[a.type] ?? "")}
                        >
                          {a.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] uppercase", SEVERITY_CHIP[a.severity] ?? "")}
                        >
                          {a.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[160px] text-xs text-muted-foreground">
                        {a.location ?? (
                          <span className="inline-flex items-center gap-1 text-cyan-300">
                            <Radio className="size-3" />
                            broadcast
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="size-3" />
                          {a.location ? "scoped" : "all"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            a.isRead
                              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                              : "border-amber-500/40 bg-amber-500/15 text-amber-300"
                          )}
                        >
                          {a.isRead ? "read" : "unread"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmtTime(a.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminAlertsView;
