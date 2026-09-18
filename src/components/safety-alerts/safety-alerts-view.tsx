"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Clock,
  CloudRain,
  Eye,
  Filter,
  Gauge,
  Info,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Waves,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { StatCard } from "@/components/common/stat-card";
import { api, ApiError } from "@/lib/api";
import type { AlertSeverity, AlertType, WeatherAlert } from "@/lib/types";
import { cn } from "@/lib/utils";

// ── Severity styling ────────────────────────────────────────────────────
// LOW=slate, MODERATE=amber, HIGH=orange, CRITICAL=red
const SEVERITY_STYLES: Record<
  AlertSeverity,
  { stripe: string; chip: string; label: string }
> = {
  LOW: {
    stripe: "bg-slate-400",
    chip:
      "border-slate-500/40 bg-slate-500/15 text-slate-300",
    label: "Low",
  },
  MODERATE: {
    stripe: "bg-amber-400",
    chip:
      "border-amber-500/40 bg-amber-500/15 text-amber-300",
    label: "Moderate",
  },
  HIGH: {
    stripe: "bg-orange-500",
    chip:
      "border-orange-500/40 bg-orange-500/15 text-orange-300",
    label: "High",
  },
  CRITICAL: {
    stripe: "bg-rose-500",
    chip:
      "border-rose-500/40 bg-rose-500/15 text-rose-300",
    label: "Critical",
  },
};

// ── Alert-type → icon/label ──────────────────────────────────────────────
const TYPE_META: Record<AlertType, { icon: LucideIcon; label: string }> = {
  WIND: { icon: Wind, label: "Wind" },
  WAVE: { icon: Waves, label: "Wave" },
  RAIN: { icon: CloudRain, label: "Rain" },
  STORM: { icon: Gauge, label: "Storm" },
  VISIBILITY: { icon: Eye, label: "Visibility" },
  SEA_STATE: { icon: ShieldAlert, label: "Sea State" },
  TEMPERATURE: { icon: AlertTriangle, label: "Temperature" },
};

// ── Time formatting helpers ──────────────────────────────────────────────
function formatTime(iso: string | null): string {
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

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    return `${days}d ago`;
  } catch {
    return "—";
  }
}

// ── Component ─────────────────────────────────────────────────────────────
export function SafetyAlertsView() {
  const [alerts, setAlerts] = useState<WeatherAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<WeatherAlert | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.listAlerts({ unreadOnly });
      setAlerts((r.alerts as WeatherAlert[]) ?? []);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load alerts";
      setError(msg);
      setAlerts([]);
    }
  }, [unreadOnly]);

  // initial + dependency-driven reload
  useEffect(() => {
    void load();
  }, [load]);

  // auto-refresh every 60s
  useEffect(() => {
    const t = setInterval(() => {
      void load();
    }, 60000);
    return () => clearInterval(t);
  }, [load]);

  const stats = useMemo(() => {
    const list = alerts ?? [];
    return {
      total: list.length,
      critical: list.filter((a) => a.severity === "CRITICAL").length,
      unread: list.filter((a) => !a.isRead).length,
      last: list[0]?.createdAt ?? null,
    };
  }, [alerts]);

  async function runEngine() {
    setRunning(true);
    try {
      const r = await api.runAlertEngine();
      toast.success(
        `Alert check complete — ${r.created} new alert${
          r.created === 1 ? "" : "s"
        }, ${r.checked} metric${r.checked === 1 ? "" : "s"} checked.`,
      );
      await load();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Alert check failed";
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  }

  async function openAlert(a: WeatherAlert) {
    setSelected(a);
    if (!a.isRead) {
      // optimistically mark read in UI; persist in background
      setAlerts((prev) =>
        (prev ?? []).map((x) => (x.id === a.id ? { ...x, isRead: true } : x)),
      );
      try {
        await api.markAlertRead(a.id);
      } catch {
        /* best-effort — revert handled by next refresh */
      }
    }
  }

  async function markAllRead() {
    if (!alerts) return;
    const unread = alerts.filter((a) => !a.isRead);
    if (unread.length === 0) {
      toast.info("All alerts are already read");
      return;
    }
    let ok = 0;
    for (const a of unread) {
      try {
        await api.markAlertRead(a.id);
        ok++;
      } catch {
        /* keep going */
      }
    }
    setAlerts((prev) => (prev ?? []).map((a) => ({ ...a, isRead: true })));
    toast.success(`Marked ${ok} alert${ok === 1 ? "" : "s"} as read`);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShieldAlert className="size-6 text-rose-400" aria-hidden />
            Safety &amp; Alert System
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live marine hazard alerts based on configured thresholds and current
            sea conditions for your area.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={runEngine} disabled={running} aria-busy={running}>
            <RefreshCw
              className={cn("size-4", running && "animate-spin")}
              aria-hidden
            />
            {running ? "Checking…" : "Run alert check now"}
          </Button>
          <label
            className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-3 py-1.5"
            aria-label="Toggle unread-only filter"
          >
            <Filter className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="text-xs">Unread only</span>
            <Switch
              checked={unreadOnly}
              onCheckedChange={setUnreadOnly}
              aria-label="Show unread alerts only"
            />
          </label>
          <Button variant="outline" onClick={markAllRead}>
            <CheckCheck className="size-4" aria-hidden />
            Mark all read
          </Button>
        </div>
      </header>

      {/* ── Stats ──────────────────────────────────────────── */}
      <section
        className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Alert statistics"
      >
        <StatCard
          label="Total alerts"
          value={stats.total}
          icon={Bell}
          accent="cyan"
        />
        <StatCard
          label="Critical"
          value={stats.critical}
          icon={AlertTriangle}
          accent="red"
        />
        <StatCard
          label="Unread"
          value={stats.unread}
          icon={Eye}
          accent="amber"
        />
        <StatCard
          label="Last alert"
          value={stats.last ? timeAgo(stats.last) : "—"}
          icon={Clock}
          accent="purple"
        />
      </section>

      {/* ── Alert list ────────────────────────────────────── */}
      <section className="mt-6" aria-label="Alerts">
        {alerts === null ? (
          <LoadingState label="Loading alerts…" />
        ) : error ? (
          <ErrorState
            title="Couldn’t load alerts"
            message={error}
            onRetry={() => void load()}
          />
        ) : alerts.length === 0 ? (
          <EmptyState
            title="No alerts"
            description={
              unreadOnly
                ? "You’re all caught up — no unread alerts right now."
                : "No active alerts for your area. Run a check to evaluate current conditions against thresholds."
            }
            icon={ShieldAlert}
            action={
              <Button size="sm" onClick={runEngine} disabled={running}>
                <RefreshCw
                  className={cn("size-4", running && "animate-spin")}
                  aria-hidden
                />
                Run alert check
              </Button>
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {alerts.map((a) => {
              const sev = SEVERITY_STYLES[a.severity] ?? SEVERITY_STYLES.LOW;
              const tm = TYPE_META[a.type] ?? TYPE_META.SEA_STATE;
              const Icon = tm.icon;
              return (
                <li key={a.id} className="contents">
                  <button
                    type="button"
                    onClick={() => openAlert(a)}
                    aria-label={`${a.title}. ${sev.label} severity. ${tm.label}. ${a.isRead ? "Read." : "Unread."} Click to view details.`}
                    className={cn(
                      "glass-card group relative flex h-full flex-col gap-3 overflow-hidden rounded-xl p-4 text-left transition-all hover:ring-1 hover:ring-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      !a.isRead && "ring-1 ring-primary/30",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute inset-y-0 left-0 w-1.5",
                        sev.stripe,
                      )}
                      aria-hidden
                    />
                    <div className="flex items-start justify-between gap-2 pl-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "flex size-8 items-center justify-center rounded-lg border",
                            sev.chip,
                          )}
                          aria-hidden
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {a.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {tm.label}
                          </p>
                        </div>
                      </div>
                      {!a.isRead && (
                        <span
                          className="mt-1 size-2 shrink-0 rounded-full bg-primary"
                          aria-label="Unread"
                        />
                      )}
                    </div>
                    <p className="line-clamp-2 pl-2 text-xs text-muted-foreground">
                      {a.description}
                    </p>
                    <div className="mt-auto flex flex-wrap items-center gap-2 pl-2">
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          sev.chip,
                        )}
                      >
                        {sev.label}
                      </span>
                      {a.location && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="size-3" aria-hidden />
                          <span className="max-w-[12rem] truncate">
                            {a.location}
                          </span>
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="size-3" aria-hidden />
                        {timeAgo(a.createdAt)}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Detail dialog ─────────────────────────────────── */}
      <Dialog
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      >
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg border",
                      SEVERITY_STYLES[selected.severity].chip,
                    )}
                    aria-hidden
                  >
                    {(() => {
                      const Icon = (
                        TYPE_META[selected.type] ?? TYPE_META.SEA_STATE
                      ).icon;
                      return <Icon className="size-5" />;
                    })()}
                  </span>
                  <div className="min-w-0">
                    <DialogTitle className="truncate">
                      {selected.title}
                    </DialogTitle>
                    <DialogDescription>
                      {(TYPE_META[selected.type] ?? TYPE_META.SEA_STATE).label}{" "}
                      · {SEVERITY_STYLES[selected.severity].label} severity
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <p>{selected.description}</p>
                <dl className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-card/40 p-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Location</dt>
                    <dd className="font-medium">
                      {selected.location ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Coordinates</dt>
                    <dd className="font-medium">
                      {selected.latitude != null &&
                      selected.longitude != null
                        ? `${selected.latitude.toFixed(3)}, ${selected.longitude.toFixed(3)}`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Start</dt>
                    <dd className="font-medium">
                      {formatTime(selected.startTime)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">End</dt>
                    <dd className="font-medium">
                      {formatTime(selected.endTime)}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Source</dt>
                    <dd className="font-medium">{selected.source}</dd>
                  </div>
                </dl>

                {selected.isRead ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCheck className="size-3.5" aria-hidden /> Marked as
                    read
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-primary">
                    <span
                      className="size-2 rounded-full bg-primary"
                      aria-hidden
                    />{" "}
                    Unread
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Safety disclaimer ──────────────────────────────── */}
      <aside
        className="mt-8 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200/90"
        role="note"
      >
        <Info
          className="mt-0.5 size-4 shrink-0 text-amber-400"
          aria-hidden
        />
        <p>
          Alerts are generated by the Fisherman Module alert engine based on
          configured thresholds and live marine data. Always follow official
          maritime authority warnings.
        </p>
      </aside>
    </div>
  );
}

export default SafetyAlertsView;
