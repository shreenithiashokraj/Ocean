"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCircle2,
  CheckCheck,
  Clock,
  Filter,
  Inbox,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { NotificationItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { StatCard } from "@/components/common/stat-card";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

// ── Type meta ───────────────────────────────────────────────────────────
type NotifType = "info" | "success" | "warning" | "alert";
type NotifSeverity = "LOW" | "MODERATE" | "HIGH" | "CRITICAL" | null;
type NotifCategory = "general" | "alert" | "system" | "analysis";

const TYPE_META: Record<
  NotifType,
  {
    icon: LucideIcon;
    label: string;
    /** text + bg classes — never color alone */
    chip: string;
    dot: string;
  }
> = {
  info: {
    icon: Info,
    label: "Info",
    chip: "border-sky-500/40 bg-sky-500/15 text-sky-300",
    dot: "bg-sky-400",
  },
  success: {
    icon: CheckCircle2,
    label: "Success",
    chip: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    dot: "bg-emerald-400",
  },
  warning: {
    icon: AlertTriangle,
    label: "Warning",
    chip: "border-amber-500/40 bg-amber-500/15 text-amber-300",
    dot: "bg-amber-400",
  },
  alert: {
    icon: ShieldAlert,
    label: "Alert",
    chip: "border-rose-500/40 bg-rose-500/15 text-rose-300",
    dot: "bg-rose-500",
  },
};

const CATEGORY_LABEL: Record<NotifCategory, string> = {
  general: "General",
  alert: "Alert",
  system: "System",
  analysis: "Analysis",
};

const SEVERITY_LABEL: Record<Exclude<NotifSeverity, null>, string> = {
  LOW: "Low",
  MODERATE: "Moderate",
  HIGH: "High",
  CRITICAL: "Critical",
};

// ── Component ───────────────────────────────────────────────────────────
export function NotificationsView() {
  const [notifications, setNotifications] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState<"all" | NotifCategory>("all");
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.listNotifications();
      setNotifications((r.notifications as NotificationItem[]) ?? []);
      if (loading) setLoading(false);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load notifications";
      setError(msg);
      setNotifications([]);
      setLoading(false);
    }
  }, [loading]);

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

  const filtered = useMemo(() => {
    const list = notifications ?? [];
    return list.filter((n) => {
      if (unreadOnly && n.isRead) return false;
      if (category !== "all" && n.category !== category) return false;
      return true;
    });
  }, [notifications, unreadOnly, category]);

  const stats = useMemo(() => {
    const list = notifications ?? [];
    return {
      total: list.length,
      unread: list.filter((n) => !n.isRead).length,
      alertCategory: list.filter((n) => n.category === "alert").length,
      critical: list.filter((n) => n.severity === "CRITICAL").length,
    };
  }, [notifications]);

  async function markAllRead() {
    if (!notifications || notifications.every((n) => n.isRead)) {
      toast.info("All notifications are already read");
      return;
    }
    setMarkingAll(true);
    try {
      const r = await api.readAllNotifications();
      setNotifications((prev) =>
        (prev ?? []).map((n) => ({ ...n, isRead: true })),
      );
      toast.success(
        `Marked ${r.updated} notification${r.updated === 1 ? "" : "s"} as read`,
      );
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to mark notifications";
      toast.error(msg);
    } finally {
      setMarkingAll(false);
    }
  }

  async function markOneRead(n: NotificationItem) {
    // optimistic
    setNotifications((prev) =>
      (prev ?? []).map((x) => (x.id === n.id ? { ...x, isRead: true } : x)),
    );
    try {
      await api.markNotificationRead(n.id);
    } catch (e) {
      // revert on failure
      setNotifications((prev) =>
        (prev ?? []).map((x) => (x.id === n.id ? { ...x, isRead: false } : x)),
      );
      const msg = e instanceof ApiError ? e.message : "Failed to mark notification";
      toast.error(msg);
    }
  }

  async function deleteOne(n: NotificationItem) {
    const prevAll = notifications ?? [];
    // optimistic remove
    setNotifications(prevAll.filter((x) => x.id !== n.id));
    try {
      await api.deleteNotification(n.id);
      toast.success("Notification deleted");
    } catch (e) {
      // rollback
      setNotifications(prevAll);
      const msg = e instanceof ApiError ? e.message : "Failed to delete notification";
      toast.error(msg);
    }
  }

  return (
    <div className="mx-auto max-w-4xl animate-fade-up px-4 py-6 sm:px-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Bell className="size-6 text-primary" aria-hidden />
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Stay on top of alerts, system updates and your latest activity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void load()}
            aria-label="Refresh notifications"
          >
            <RefreshCw className="size-4" aria-hidden />
            Refresh
          </Button>
          <Button onClick={markAllRead} disabled={markingAll} aria-busy={markingAll}>
            {markingAll ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <CheckCheck className="size-4" aria-hidden />
            )}
            Mark all read
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
              aria-label="Show unread notifications only"
            />
          </label>
        </div>
      </header>

      {/* ── Stats ──────────────────────────────────────────── */}
      <section
        className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
        aria-label="Notification statistics"
      >
        <StatCard
          label="Total"
          value={stats.total}
          icon={Bell}
          accent="cyan"
        />
        <StatCard
          label="Unread"
          value={stats.unread}
          icon={BellRing}
          accent="amber"
          sub={stats.unread === 0 ? "All caught up" : "Awaiting your attention"}
        />
        <StatCard
          label="Alert category"
          value={stats.alertCategory}
          icon={ShieldAlert}
          accent="red"
          sub="Marine alert notifications"
        />
        <StatCard
          label="Critical severity"
          value={stats.critical}
          icon={AlertTriangle}
          accent="red"
          sub="Highest-priority items"
        />
      </section>

      {/* ── Filter ──────────────────────────────────────────── */}
      <div className="mt-6 flex items-center gap-2">
        <Label
          htmlFor="notif-category-filter"
          className="flex items-center gap-2 text-xs font-medium text-muted-foreground"
        >
          <Filter className="size-3.5" aria-hidden />
          Filter by category
        </Label>
        <Select
          value={category}
          onValueChange={(v) => setCategory(v as typeof category)}
        >
          <SelectTrigger
            id="notif-category-filter"
            className="w-40"
            aria-label="Filter by category"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="general">General</SelectItem>
            <SelectItem value="alert">Alert</SelectItem>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="analysis">Analysis</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── List ───────────────────────────────────────────── */}
      <section className="mt-4" aria-label="Notifications">
        {notifications === null && loading ? (
          <LoadingState label="Loading notifications…" />
        ) : error ? (
          <ErrorState
            title="Couldn’t load notifications"
            message={error}
            onRetry={() => void load()}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={
              unreadOnly || category !== "all"
                ? "No matching notifications"
                : "No notifications"
            }
            description={
              unreadOnly || category !== "all"
                ? "Try changing your filters to see more."
                : "You’re all caught up. New alerts and updates will show up here."
            }
            icon={Inbox}
          />
        ) : (
          <ul
            className="scroll-ocean max-h-[28rem] space-y-2 overflow-y-auto pr-1"
            role="list"
          >
            {filtered.map((n) => {
              const type = (n.type as NotifType) ?? "info";
              const tm = TYPE_META[type] ?? TYPE_META.info;
              const Icon = tm.icon;
              const sev =
                n.severity &&
                n.severity !== "LOW" &&
                SEVERITY_LABEL[n.severity as Exclude<NotifSeverity, null>];
              return (
                <li key={n.id} className="contents">
                  <article
                    className={cn(
                      "glass-card relative flex flex-col gap-3 overflow-hidden rounded-xl p-4",
                      !n.isRead && "ring-1 ring-primary/30",
                    )}
                    aria-label={`${n.title}. ${tm.label}.${sev ? ` ${sev} severity.` : ""} ${n.isRead ? "Read." : "Unread."}`}
                  >
                    {/* severity type dot */}
                    <span
                      className={cn("absolute inset-y-0 left-0 w-1.5", tm.dot)}
                      aria-hidden
                    />

                    <div className="flex items-start gap-3 pl-2">
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                          tm.chip,
                        )}
                        aria-hidden
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold">
                            {n.title}
                          </p>
                          {!n.isRead && (
                            <span
                              className="mt-1 flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary"
                              aria-label="Unread"
                            >
                              <span
                                className="size-2 rounded-full bg-primary"
                                aria-hidden
                              />
                              New
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {n.message}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span
                            className={cn(
                              "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              tm.chip,
                            )}
                          >
                            {tm.label}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] font-medium"
                          >
                            {CATEGORY_LABEL[n.category as NotifCategory] ??
                              n.category}
                          </Badge>
                          {sev && (
                            <span
                              className={cn(
                                "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                tm.chip,
                              )}
                            >
                              {sev}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" aria-hidden />
                            {timeAgo(n.createdAt)}
                          </span>
                          {n.alertId && (
                            <ViewAlertButton alertId={n.alertId} />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Row actions */}
                    <div className="flex items-center justify-end gap-2 pl-2">
                      {!n.isRead && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void markOneRead(n)}
                          aria-label={`Mark "${n.title}" as read`}
                        >
                          <CheckCheck className="size-3.5" aria-hidden />
                          Mark read
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                            aria-label={`Delete notification "${n.title}"`}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete notification?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently remove “{n.title}” from
                              your notifications. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => void deleteOne(n)}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside
        className="mt-8 flex items-start gap-2 rounded-lg border border-border/60 bg-card/30 p-3 text-xs text-muted-foreground"
        role="note"
      >
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p>
          Notifications are generated by the Fisherman Module’s alert engine
          and activity feed. The list refreshes automatically every minute, or
          tap “Refresh” to update immediately.
        </p>
      </aside>
    </div>
  );
}

// ── Inline button: jump to related alert ───────────────────────────────
function ViewAlertButton({ alertId }: { alertId: string }) {
  return (
    <button
      type="button"
      onClick={() => useAppStore.setState({ view: "fisherman.safety-alerts" })}
      data-alert-id={alertId}
      className="ml-auto inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary transition-colors hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label="View the related safety alert"
    >
      <ShieldAlert className="size-3" aria-hidden />
      View related alert
    </button>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────
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
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export default NotificationsView;
