"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Database,
  Gauge,
  Image as ImageIcon,
  Loader2,
  Palette,
  RefreshCw,
  Save,
  Server,
  Settings as SettingsIcon,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Shared types ─────────────────────────────────────────────────────────
interface AdminSetting {
  id: string;
  key: string;
  value: string;
  category: string;
  updatedAt: string;
}
interface AdminThreshold {
  id: string;
  metric: string;
  caution: number;
  high: number;
  critical: number;
  unit: string;
  updatedAt: string;
}

// ── Reference env vars per API provider category ─────────────────────────
// Surface the names only — NEVER secret values. UI is non-secret.
const ENV_VARS_BY_SETTING: Record<string, { name: string; description: string }> = {
  weatherProvider: {
    name: "OPEN_METEO_WEATHER_URL",
    description: "Open-Meteo weather forecast endpoint (free, no key required).",
  },
  marineProvider: {
    name: "OPEN_METEO_MARINE_URL",
    description: "Open-Meteo marine forecast endpoint (free, no key required).",
  },
  fishAnalysisProvider: {
    name: "z-ai-web-dev-sdk",
    description: "Bundled AI vision SDK — no API key needed in sandbox.",
  },
  mapProvider: {
    name: "—",
    description: "OpenStreetMap tiles — free, no key required.",
  },
};

const EXTRA_ENV_VARS = [
  { name: "FISH_MARKET_API_URL", description: "Optional fish market price API base URL (blank = disabled)." },
  { name: "FISH_MARKET_API_KEY", description: "Optional fish market API secret key (blank = disabled)." },
  { name: "JWT_SECRET", description: "JWT signing secret for session cookies." },
  { name: "DATABASE_URL", description: "SQLite database file path (Prisma)." },
];

function fmtUpdated(iso: string): string {
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

// ── Component ────────────────────────────────────────────────────────────
export function AdminSettingsView() {
  const [settings, setSettings] = useState<AdminSetting[] | null>(null);
  const [thresholds, setThresholds] = useState<AdminThreshold[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savingMetric, setSavingMetric] = useState<string | null>(null);

  // Per-row pending edits keyed by setting key.
  const [pendingSettings, setPendingSettings] = useState<
    Record<string, { value: string } | undefined>
  >({});
  // Per-row pending threshold edits keyed by metric.
  const [pendingThresholds, setPendingThresholds] = useState<
    Record<
      string,
      { caution: string; high: string; critical: string; unit: string } | undefined
    >
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, t] = await Promise.all([api.getSettings(), api.getThresholds()]);
      setSettings(s.settings as AdminSetting[]);
      setThresholds(t.thresholds as AdminThreshold[]);
      setPendingSettings({});
      setPendingThresholds({});
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load settings";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const list = settings ?? [];
    return {
      general: list.filter((s) => s.category === "general"),
      api: list.filter((s) => s.category === "api"),
      branding: list.filter((s) => s.category === "branding"),
    };
  }, [settings]);

  function setPendingSettingValue(key: string, value: string) {
    setPendingSettings((p) => {
      const cur = p[key] ?? { value: "" };
      return { ...p, [key]: { ...cur, value } };
    });
  }

  function getSettingValue(s: AdminSetting): string {
    return pendingSettings[s.key]?.value ?? s.value;
  }

  function isSettingDirty(s: AdminSetting): boolean {
    const pend = pendingSettings[s.key];
    if (!pend) return false;
    return pend.value !== s.value;
  }

  async function saveSetting(s: AdminSetting) {
    const pend = pendingSettings[s.key];
    if (!pend) return;
    setSavingKey(s.key);
    try {
      await api.upsertSetting({ key: s.key, value: pend.value, category: s.category });
      // Apply locally.
      setSettings((list) =>
        (list ?? []).map((x) => (x.key === s.key ? { ...x, value: pend.value } : x))
      );
      setPendingSettings((p) => {
        const next = { ...p };
        delete next[s.key];
        return next;
      });
      toast.success(`Saved "${s.key}"`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to save setting";
      toast.error(msg);
    } finally {
      setSavingKey(null);
    }
  }

  function setPendingThreshold(
    metric: string,
    field: "caution" | "high" | "critical" | "unit",
    value: string
  ) {
    setPendingThresholds((p) => {
      const cur = p[metric] ?? { caution: "", high: "", critical: "", unit: "" };
      return { ...p, [metric]: { ...cur, [field]: value } };
    });
  }

  function getThresholdVal(t: AdminThreshold, field: "caution" | "high" | "critical" | "unit"): string {
    return pendingThresholds[t.metric]?.[field] ?? String(t[field]);
  }

  function isThresholdDirty(t: AdminThreshold): boolean {
    const pend = pendingThresholds[t.metric];
    if (!pend) return false;
    return (
      pend.caution !== String(t.caution) ||
      pend.high !== String(t.high) ||
      pend.critical !== String(t.critical) ||
      pend.unit !== t.unit
    );
  }

  async function saveThreshold(t: AdminThreshold) {
    const pend = pendingThresholds[t.metric];
    if (!pend) return;
    const caution = Number(pend.caution);
    const high = Number(pend.high);
    const critical = Number(pend.critical);
    if (!Number.isFinite(caution) || !Number.isFinite(high) || !Number.isFinite(critical)) {
      toast.error("All threshold values must be finite numbers.");
      return;
    }
    if (!pend.unit.trim()) {
      toast.error("Unit is required.");
      return;
    }
    setSavingMetric(t.metric);
    try {
      await api.upsertThreshold({
        metric: t.metric,
        caution,
        high,
        critical,
        unit: pend.unit.trim().slice(0, 20),
      });
      setThresholds((list) =>
        (list ?? []).map((x) =>
          x.metric === t.metric
            ? { ...x, caution, high, critical, unit: pend.unit.trim().slice(0, 20) }
            : x
        )
      );
      setPendingThresholds((p) => {
        const next = { ...p };
        delete next[t.metric];
        return next;
      });
      toast.success(`Saved threshold "${t.metric}"`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to save threshold";
      toast.error(msg);
    } finally {
      setSavingMetric(null);
    }
  }

  // Render a single editable setting row.
  function SettingRow({ s }: { s: AdminSetting }) {
    const dirty = isSettingDirty(s);
    const saving = savingKey === s.key;
    return (
      <li
        className="grid grid-cols-1 gap-2 rounded-lg border border-border/50 bg-card/40 px-3 py-2 sm:grid-cols-[180px_1fr_auto] sm:items-center"
      >
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-medium text-foreground">{s.key}</p>
          <p className="text-[10px] text-muted-foreground">updated {fmtUpdated(s.updatedAt)}</p>
        </div>
        <Input
          value={getSettingValue(s)}
          onChange={(e) => setPendingSettingValue(s.key, e.target.value)}
          className="h-8 font-mono text-xs"
          aria-label={`Value for ${s.key}`}
        />
        <Button
          size="sm"
          variant={dirty ? "default" : "outline"}
          disabled={!dirty || saving}
          onClick={() => void saveSetting(s)}
          className="sm:w-[88px]"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : dirty ? <Save className="size-3.5" /> : <Check className="size-3.5" />}
          Save
        </Button>
      </li>
    );
  }

  function SettingList({ list }: { list: AdminSetting[] }) {
    if (list.length === 0) {
      return (
        <EmptyState
          title="No settings in this category"
          description="Settings appear here once they are added via the API or seed."
          icon={Database}
        />
      );
    }
    return (
      <ul className="space-y-2">
        {list.map((s) => (
          <SettingRow key={s.id} s={s} />
        ))}
      </ul>
    );
  }

  // Render API providers tab — combines editable non-secret provider name +
  // a list of relevant server env vars (names only).
  function ApiProviderRow({ s }: { s: AdminSetting }) {
    const env = ENV_VARS_BY_SETTING[s.key];
    const dirty = isSettingDirty(s);
    const saving = savingKey === s.key;
    return (
      <li className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-center">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs font-medium text-foreground">{s.key}</p>
            {env && (
              <p className="truncate text-[10px] text-cyan-300">{env.name}</p>
            )}
          </div>
          <Input
            value={getSettingValue(s)}
            onChange={(e) => setPendingSettingValue(s.key, e.target.value)}
            className="h-8 font-mono text-xs"
            aria-label={`Value for ${s.key}`}
          />
          <Button
            size="sm"
            variant={dirty ? "default" : "outline"}
            disabled={!dirty || saving}
            onClick={() => void saveSetting(s)}
            className="sm:w-[88px]"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : dirty ? <Save className="size-3.5" /> : <Check className="size-3.5" />}
            Save
          </Button>
        </div>
        {env && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">{env.description}</p>
        )}
      </li>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings &amp; API</h1>
          <p className="text-sm text-muted-foreground">
            Manage non-secret system settings and alert thresholds.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </header>

      {/* Prominent info card about secrets — required by spec */}
      <aside
        role="note"
        className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">Secrets are not managed here.</p>
          <p className="mt-1 text-[12px] text-amber-200/90">
            API keys for weather, marine, market and AI providers are configured
            via server environment variables (see <code className="rounded bg-amber-500/10 px-1 py-0.5 text-[11px]">.env.example</code>).
            This UI manages non-secret settings and thresholds only.
          </p>
        </div>
      </aside>

      {error ? (
        <div className="mt-4">
          <ErrorState message={error} onRetry={() => void load()} />
        </div>
      ) : loading && (!settings || !thresholds) ? (
        <div className="mt-6">
          <LoadingState label="Loading settings…" />
        </div>
      ) : (
        <Tabs defaultValue="general" className="mt-4">
          <TabsList className="w-full max-w-2xl overflow-x-auto">
            <TabsTrigger value="general">
              <SettingsIcon className="size-3.5" />
              General
            </TabsTrigger>
            <TabsTrigger value="api">
              <Server className="size-3.5" />
              API Providers
            </TabsTrigger>
            <TabsTrigger value="thresholds">
              <Sliders className="size-3.5" />
              Alert Thresholds
            </TabsTrigger>
            <TabsTrigger value="branding">
              <Palette className="size-3.5" />
              Branding
            </TabsTrigger>
          </TabsList>

          {/* General tab */}
          <TabsContent value="general" className="mt-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <SettingsIcon className="size-4 text-primary" />
                  General Settings
                </CardTitle>
                <CardDescription>
                  Application-wide preferences (refresh interval, demo fallback, notifications).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SettingList list={grouped.general} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Providers tab */}
          <TabsContent value="api" className="mt-4 space-y-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Server className="size-4 text-primary" />
                  API Provider Configuration
                </CardTitle>
                <CardDescription>
                  Provider name (non-secret). The actual endpoint / key lives in
                  server env vars listed below.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {grouped.api.length === 0 ? (
                  <EmptyState
                    title="No API settings"
                    description="Seed the database or add a provider via the API."
                    icon={Server}
                  />
                ) : (
                  <ul className="space-y-2">
                    {grouped.api.map((s) => (
                      <ApiProviderRow key={s.id} s={s} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Env var reference card — NAMES ONLY */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="size-4 text-primary" />
                  Server Environment Variables (read-only)
                </CardTitle>
                <CardDescription>
                  The names of every env var this app consults. Never paste a
                  secret into this UI.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {EXTRA_ENV_VARS.map((e) => (
                    <li
                      key={e.name}
                      className="rounded-lg border border-border/50 bg-card/40 px-3 py-2"
                    >
                      <p className="font-mono text-[11px] font-medium text-cyan-300">{e.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{e.description}</p>
                    </li>
                  ))}
                  {Object.values(ENV_VARS_BY_SETTING).map((e) => (
                    <li
                      key={e.name}
                      className="rounded-lg border border-border/50 bg-card/40 px-3 py-2"
                    >
                      <p className="font-mono text-[11px] font-medium text-cyan-300">{e.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{e.description}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Alert Thresholds tab */}
          <TabsContent value="thresholds" className="mt-4 space-y-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sliders className="size-4 text-primary" />
                  Alert Thresholds
                </CardTitle>
                <CardDescription>
                  Thresholds drive the alert engine — exceeding any value
                  raises an alert at the matching severity.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!thresholds || thresholds.length === 0 ? (
                  <EmptyState
                    title="No thresholds configured"
                    description="Seed the database or add a threshold via the API."
                    icon={Gauge}
                  />
                ) : (
                  <ul className="space-y-2">
                    {thresholds.map((t) => {
                      const dirty = isThresholdDirty(t);
                      const saving = savingMetric === t.metric;
                      return (
                        <li
                          key={t.id}
                          className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5"
                        >
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[160px_1fr_1fr_1fr_80px_auto] sm:items-end">
                            <div>
                              <Label className="text-[10px] uppercase text-muted-foreground">
                                Metric
                              </Label>
                              <p className="truncate font-mono text-xs font-medium text-foreground">
                                {t.metric}
                              </p>
                            </div>
                            <div>
                              <Label htmlFor={`thr-caution-${t.metric}`} className="text-[10px] uppercase text-muted-foreground">
                                Caution
                              </Label>
                              <Input
                                id={`thr-caution-${t.metric}`}
                                value={getThresholdVal(t, "caution")}
                                onChange={(e) => setPendingThreshold(t.metric, "caution", e.target.value)}
                                className="h-8 font-mono text-xs"
                                inputMode="decimal"
                              />
                            </div>
                            <div>
                              <Label htmlFor={`thr-high-${t.metric}`} className="text-[10px] uppercase text-muted-foreground">
                                High
                              </Label>
                              <Input
                                id={`thr-high-${t.metric}`}
                                value={getThresholdVal(t, "high")}
                                onChange={(e) => setPendingThreshold(t.metric, "high", e.target.value)}
                                className="h-8 font-mono text-xs"
                                inputMode="decimal"
                              />
                            </div>
                            <div>
                              <Label htmlFor={`thr-critical-${t.metric}`} className="text-[10px] uppercase text-muted-foreground">
                                Critical
                              </Label>
                              <Input
                                id={`thr-critical-${t.metric}`}
                                value={getThresholdVal(t, "critical")}
                                onChange={(e) => setPendingThreshold(t.metric, "critical", e.target.value)}
                                className="h-8 font-mono text-xs"
                                inputMode="decimal"
                              />
                            </div>
                            <div>
                              <Label htmlFor={`thr-unit-${t.metric}`} className="text-[10px] uppercase text-muted-foreground">
                                Unit
                              </Label>
                              <Input
                                id={`thr-unit-${t.metric}`}
                                value={getThresholdVal(t, "unit")}
                                onChange={(e) => setPendingThreshold(t.metric, "unit", e.target.value)}
                                className="h-8 font-mono text-xs"
                              />
                            </div>
                            <Button
                              size="sm"
                              variant={dirty ? "default" : "outline"}
                              disabled={!dirty || saving}
                              onClick={() => void saveThreshold(t)}
                              className="sm:w-[88px]"
                            >
                              {saving ? <Loader2 className="size-4 animate-spin" /> : dirty ? <Save className="size-3.5" /> : <Check className="size-3.5" />}
                              Save
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <aside
              role="note"
              className="flex items-start gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 text-sm text-cyan-200"
            >
              <Gauge className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">How the alert engine uses these</p>
                <p className="mt-1 text-[12px] text-cyan-200/90">
                  Each metric maps to a Sea-Condition reading. When a reading
                  crosses caution → high → critical, the alert engine
                  (<code className="rounded bg-cyan-500/10 px-1 py-0.5 text-[11px]">POST /api/alerts/run</code>)
                  raises a matching-severity alert and notifies affected users.
                  Some metrics (visibility, pressure) use inverse semantics
                  (lower = worse) — see the alert engine docs for details.
                </p>
              </div>
            </aside>
          </TabsContent>

          {/* Branding tab */}
          <TabsContent value="branding" className="mt-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Palette className="size-4 text-primary" />
                  Branding
                </CardTitle>
                <CardDescription>
                  Application name and other display strings.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SettingList list={grouped.branding} />
                {grouped.branding.length === 0 && (
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <ImageIcon className="size-3.5" />
                    Logo and theme colors are not configurable from this UI yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Footer reference */}
      <p className="mt-4 text-[11px] text-muted-foreground">
        <Badge variant="outline" className="mr-2 text-[10px]">
          tip
        </Badge>
        Setting updates take effect immediately and persist to the database.
      </p>
    </div>
  );
}

export default AdminSettingsView;
