"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Anchor,
  Bell,
  Database,
  Fish,
  MapPin,
  RefreshCw,
  ScrollText,
  Server,
  ShieldAlert,
  Users,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { StatCard } from "@/components/common/stat-card";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Shared types (loose — admin payloads are JSON-shaped at the wire) ─────
interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}
interface AdminApiLog {
  id: string;
  service: string;
  endpoint: string;
  method: string;
  status: number;
  durationMs: number | null;
  message: string | null;
  userEmail: string | null;
  createdAt: string;
}
interface AdminSetting {
  id: string;
  key: string;
  value: string;
  category: string;
  updatedAt: string;
}
interface AdminAlert {
  id: string;
  title: string;
  type: string;
  severity: string;
  location: string | null;
  isRead: boolean;
  createdAt: string;
}
interface AdminSeaCondition {
  id: string;
  isDemo: boolean;
  createdAt: string;
}
interface AdminFishAnalysis {
  id: string;
  hasImage: boolean;
  createdAt: string;
}
interface AdminSavedLocation {
  id: string;
  userId: string;
}
interface AdminFishingSpot {
  id: string;
}
interface AdminLocationsPayload {
  saved: AdminSavedLocation[];
  spots: AdminFishingSpot[];
}

// ── Severity styling (mirrors the safety-alerts view) ────────────────────
const SEVERITY_CHIP: Record<string, string> = {
  LOW: "border-slate-500/40 bg-slate-500/15 text-slate-300",
  MODERATE: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  HIGH: "border-orange-500/40 bg-orange-500/15 text-orange-300",
  CRITICAL: "border-rose-500/40 bg-rose-500/15 text-rose-300",
};

// ── Time helpers ─────────────────────────────────────────────────────────
function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  } catch {
    return "—";
  }
}

function fmtTime(iso: string | null): string {
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

interface DashData {
  users: AdminUser[];
  logs: AdminApiLog[];
  settings: AdminSetting[];
  alerts: AdminAlert[];
  seaConditions: AdminSeaCondition[];
  fishAnalyses: AdminFishAnalysis[];
  locations: AdminLocationsPayload | null;
}

// ── Component ────────────────────────────────────────────────────────────
export function AdminDashboardView() {
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Promise.all — every fetch in parallel. Each failing endpoint
      // degrades individually via `safeCatch` so a single 500 doesn't
      // break the whole dashboard.
      const safeCatch = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
        try {
          return await p;
        } catch (e) {
          // surface a soft toast but keep the dashboard rendering
          const msg = e instanceof ApiError ? e.message : "Failed to load";
          toast.error(`Admin dashboard: ${msg}`);
          return fallback;
        }
      };

      const [usersR, logsR, settingsR, alertsR, seaR, fishR, locR] = await Promise.all([
        safeCatch(api.listUsers(), { users: [] as AdminUser[] }),
        safeCatch(api.getApiLogs(), { logs: [] as AdminApiLog[] }),
        safeCatch(api.getSettings(), { settings: [] as AdminSetting[] }),
        safeCatch(
          (async () => {
            const r = await fetch("/api/alerts", { credentials: "include" });
            const body = await r.json();
            if (!r.ok) throw new Error((body && body.error) || `Failed (${r.status})`);
            return { alerts: (body.alerts ?? []) as AdminAlert[] };
          })(),
          { alerts: [] as AdminAlert[] }
        ),
        safeCatch(api.getAdminSeaConditions(), { records: [] as AdminSeaCondition[] }),
        safeCatch(api.getAdminFishAnalyses(), { records: [] as AdminFishAnalysis[] }),
        safeCatch(api.getAdminLocations(), null),
      ]);

      setData({
        users: (usersR.users ?? []) as AdminUser[],
        logs: (logsR.logs ?? []) as AdminApiLog[],
        settings: (settingsR.settings ?? []) as AdminSetting[],
        alerts: (alertsR.alerts ?? []) as AdminAlert[],
        seaConditions: (seaR.records ?? []) as AdminSeaCondition[],
        fishAnalyses: (fishR.records ?? []) as AdminFishAnalysis[],
        locations:
          locR && (locR as any).records
            ? (((locR as any).records) as AdminLocationsPayload)
            : null,
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load dashboard";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const u = data?.users ?? [];
    const a = data?.alerts ?? [];
    const loc = data?.locations;
    return {
      totalUsers: u.length,
      fishermen: u.filter((x) => x.role === "FISHERMAN").length,
      researchers: u.filter((x) => x.role === "RESEARCHER").length,
      admins: u.filter((x) => x.role === "ADMIN").length,
      totalAlerts: a.length,
      criticalAlerts: a.filter((x) => x.severity === "CRITICAL").length,
      totalFishAnalyses: data?.fishAnalyses.length ?? 0,
      totalSeaConditions: data?.seaConditions.length ?? 0,
      totalApiLogs: data?.logs.length ?? 0,
      totalSavedLocations: loc?.saved.length ?? 0,
      totalFishingSpots: loc?.spots.length ?? 0,
    };
  }, [data]);

  // API provider config — surfaced from settings (non-secret only).
  const apiProviders = useMemo(() => {
    const list = data?.settings ?? [];
    return list.filter((s) => s.category === "api");
  }, [data]);

  const recentLogs = useMemo(() => (data?.logs ?? []).slice(0, 10), [data]);
  const recentAlerts = useMemo(() => (data?.alerts ?? []).slice(0, 5), [data]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            System overview, user activity, and operational health.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </header>

      {error && (
        <div className="mt-4">
          <ErrorState message={error} onRetry={() => void load()} />
        </div>
      )}

      {loading && !data ? (
        <div className="mt-6">
          <LoadingState label="Loading dashboard…" />
        </div>
      ) : data ? (
        <div className="mt-6 space-y-6">
          {/* StatCards row — responsive grid */}
          <section
            aria-label="System metrics"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            <StatCard
              label="Total Users"
              value={stats.totalUsers}
              icon={Users}
              accent="cyan"
              sub={`${stats.admins} admin · ${stats.researchers} researchers`}
            />
            <StatCard
              label="Fishermen"
              value={stats.fishermen}
              icon={Anchor}
              accent="green"
              sub="active field users"
            />
            <StatCard
              label="Researchers"
              value={stats.researchers}
              icon={Activity}
              accent="purple"
              sub="data team"
            />
            <StatCard
              label="Total Alerts"
              value={stats.totalAlerts}
              icon={Bell}
              accent="amber"
              sub={`${stats.criticalAlerts} critical`}
            />
            <StatCard
              label="Critical Alerts"
              value={stats.criticalAlerts}
              icon={ShieldAlert}
              accent="red"
              sub="needs triage"
            />
            <StatCard
              label="Fish Analyses"
              value={stats.totalFishAnalyses}
              icon={Fish}
              accent="cyan"
              sub="VLM records"
            />
            <StatCard
              label="Sea-Condition Records"
              value={stats.totalSeaConditions}
              icon={Waves}
              accent="blue"
              sub="snapshots stored"
            />
            <StatCard
              label="Saved Locations"
              value={stats.totalSavedLocations}
              icon={MapPin}
              accent="green"
              sub="all users"
            />
            <StatCard
              label="Fishing Spots"
              value={stats.totalFishingSpots}
              icon={Anchor}
              accent="amber"
              sub="curated catalog"
            />
            <StatCard
              label="API Logs (100)"
              value={stats.totalApiLogs}
              icon={ScrollText}
              accent="purple"
              sub="recent calls"
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* System health card */}
            <Card className="glass-card lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Server className="size-4 text-primary" />
                  System Health
                </CardTitle>
                <CardDescription>
                  Configured providers (non-secret settings).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {apiProviders.length === 0 ? (
                  <EmptyState
                    title="No provider settings"
                    description="System settings of category 'api' will appear here."
                    icon={Database}
                    className="py-6"
                  />
                ) : (
                  <ul className="space-y-2.5">
                    {apiProviders.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-card/40 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-foreground">
                            {p.key}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {p.value || "—"}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          online
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 text-[11px] text-muted-foreground">
                  API keys are managed via server environment variables
                  (see <code className="rounded bg-muted px-1 py-0.5 text-[10px]">.env.example</code>).
                </p>
              </CardContent>
            </Card>

            {/* Recent API logs */}
            <Card className="glass-card lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ScrollText className="size-4 text-primary" />
                  Recent API Logs
                </CardTitle>
                <CardDescription>Last 10 external API calls.</CardDescription>
              </CardHeader>
              <CardContent>
                {recentLogs.length === 0 ? (
                  <EmptyState
                    title="No API calls yet"
                    description="Logs appear once external providers are called."
                    icon={ScrollText}
                    className="py-6"
                  />
                ) : (
                  <div className="scroll-ocean max-h-96 overflow-y-auto overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[11px] uppercase">Service</TableHead>
                          <TableHead className="text-[11px] uppercase">Endpoint</TableHead>
                          <TableHead className="text-[11px] uppercase">Status</TableHead>
                          <TableHead className="text-[11px] uppercase">User</TableHead>
                          <TableHead className="text-[11px] uppercase">When</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentLogs.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="font-mono text-xs">{l.service}</TableCell>
                            <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">
                              {l.method} {l.endpoint}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px]",
                                  l.status >= 200 && l.status < 300
                                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                    : l.status >= 400
                                    ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                                    : "border-amber-500/40 bg-amber-500/15 text-amber-300"
                                )}
                              >
                                {l.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[140px] truncate text-xs text-muted-foreground">
                              {l.userEmail ?? "system"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {timeAgo(l.createdAt)}
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

          {/* Recent alerts mini-list */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="size-4 text-primary" />
                Recent Alerts
              </CardTitle>
              <CardDescription>Newest 5 alerts across all users + broadcasts.</CardDescription>
            </CardHeader>
            <CardContent>
              {recentAlerts.length === 0 ? (
                <EmptyState
                  title="No alerts yet"
                  description="Run the alert engine from the Safety & Alerts module."
                  icon={ShieldAlert}
                  className="py-6"
                />
              ) : (
                <ul className="scroll-ocean max-h-80 space-y-2 overflow-y-auto">
                  {recentAlerts.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-card/40 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{a.title}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {a.location ?? "broadcast"} · {fmtTime(a.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {!a.isRead && (
                          <span className="size-1.5 rounded-full bg-primary" aria-label="unread" />
                        )}
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] uppercase", SEVERITY_CHIP[a.severity])}
                        >
                          {a.severity}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {a.type}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <aside
            role="note"
            className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200"
          >
            <AlertTriangle className="mr-2 inline size-4 align-text-bottom" />
            Admin actions affect every user. Demote / deactivate accounts with
            care; revoked sessions cannot be re-issued from this UI.
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export default AdminDashboardView;
