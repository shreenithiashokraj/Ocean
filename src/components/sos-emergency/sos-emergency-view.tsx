"use client";

/**
 * SOS & Emergency — Fisherman Module.
 *
 * DEMO SAFETY: this page records a distress event in the project's own
 * database (SQLite, user-owned rows) and raises an in-app notification. It
 * does NOT dispatch to a real coast guard or any external emergency service —
 * that is stated on-screen so a demo can never be mistaken for a real rescue
 * dispatch.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  LifeBuoy,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  Send,
  ShieldAlert,
  User,
  XCircle,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { SosEvent } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/states";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

type SosPhase = "ready" | "sending" | "sent" | "failed";

interface GpsFix {
  lat: number;
  lng: number;
  accuracy: number | null;
  at: Date;
}

interface GpsState {
  status: "idle" | "locating" | "ok" | "unavailable";
  fix: GpsFix | null;
  reason: string | null;
}

const INITIAL_GPS: GpsState = { status: "idle", fix: null, reason: null };

const STATUS_META: Record<string, { label: string; chip: string }> = {
  ACTIVE: {
    label: "Active",
    chip: "border-rose-500/40 bg-rose-500/15 text-rose-300",
  },
  RESOLVED: {
    label: "Resolved",
    chip: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  },
  CANCELLED: {
    label: "Cancelled",
    chip: "border-muted-foreground/30 bg-muted/20 text-muted-foreground",
  },
};

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Main view ──────────────────────────────────────────────────────────────

export function SosEmergencyView() {
  const user = useAppStore((s) => s.user);
  const isAdmin = user?.role === "ADMIN";

  const [events, setEvents] = useState<SosEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [gps, setGps] = useState<GpsState>(INITIAL_GPS);
  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phase, setPhase] = useState<SosPhase>("ready");
  const [phaseDetail, setPhaseDetail] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<SosEvent | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Emergency contact (existing profile data)
  const [profile, setProfile] = useState<{
    phone: string | null;
    vesselName: string | null;
  }>({ phone: null, vesselName: null });

  // ── Load history ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.listSosEvents();
      setEvents(r.events ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load emergency history");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const r = (await api.getProfile()) as {
        profile: Record<string, unknown>;
      };
      setProfile({
        phone: typeof r.profile.phone === "string" ? r.profile.phone : null,
        vesselName:
          typeof r.profile.vesselName === "string" ? r.profile.vesselName : null,
      });
    } catch {
      /* contact card simply shows "not set" */
    }
  }, []);

  // ── GPS ──────────────────────────────────────────────────────────────────
  // Never blocks sending: denial/unavailability is captured as state and the
  // event is still recorded with gpsAvailable=false.
  const locate = useCallback((opts?: { silent?: boolean }) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGps({
        status: "unavailable",
        fix: null,
        reason: "Geolocation is not supported by this browser.",
      });
      if (!opts?.silent) toast.error("Location unavailable");
      return;
    }
    setGps((g) => ({ ...g, status: "locating", reason: null }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          status: "ok",
          fix: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy:
              typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
            at: new Date(),
          },
          reason: null,
        });
        if (!opts?.silent) toast.success("GPS location captured");
      },
      (err) => {
        const reason =
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — you can still send the alert without GPS."
            : err.code === err.POSITION_UNAVAILABLE
              ? "Position unavailable — you can still send the alert without GPS."
              : err.code === err.TIMEOUT
                ? "Location request timed out — you can still send the alert without GPS."
                : "Could not determine your location.";
        setGps({ status: "unavailable", fix: null, reason });
        if (!opts?.silent) {
          toast.error("Location unavailable", { description: reason });
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }, []);

  // ── Mount: load data + silent GPS attempt ────────────────────────────────
  useEffect(() => {
    load();
    loadProfile();
    locate({ silent: true });
  }, [load, loadProfile, locate]);

  const phaseMeta: Record<SosPhase, { label: string; icon: typeof CheckCircle2; cls: string }> = {
    ready: { label: "Ready", icon: LifeBuoy, cls: "text-primary" },
    sending: { label: "Sending…", icon: Loader2, cls: "text-amber-300" },
    sent: { label: "SOS Alert Sent", icon: CheckCircle2, cls: "text-emerald-300" },
    failed: { label: "Send failed — try again", icon: XCircle, cls: "text-rose-300" },
  };
  const PhaseIcon = phaseMeta[phase].icon;

  // ── Send ─────────────────────────────────────────────────────────────────
  const confirmSend = useCallback(() => {
    setPhaseDetail(null);
    setConfirmOpen(true);
  }, []);

  const send = useCallback(async () => {
    setConfirmOpen(false);
    setPhase("sending");
    setPhaseDetail(null);
    try {
      const fix = gps.fix;
      const r = await api.createSosEvent({
        latitude: fix ? fix.lat : null,
        longitude: fix ? fix.lng : null,
        gpsAvailable: !!fix,
        accuracyM: fix?.accuracy ?? null,
        locationLabel: null,
        message: message.trim() || null,
      });
      setEvents((prev) => [r.event, ...(prev ?? [])]);
      setLastSent(r.event);
      setPhase("sent");
      setMessage("");
      toast.success("SOS alert sent", {
        description: fix
          ? "Recorded with your GPS position."
          : "Recorded with location unavailable.",
      });
    } catch (e) {
      setPhase("failed");
      const msg = e instanceof ApiError ? e.message : "Could not send the SOS alert";
      setPhaseDetail(msg);
      toast.error("SOS failed", { description: msg });
    }
  }, [gps.fix, message]);

  const resolveOne = useCallback(async (ev: SosEvent) => {
    setResolvingId(ev.id);
    try {
      const r = await api.updateSosStatus(ev.id, "RESOLVED");
      setEvents((prev) => (prev ?? []).map((e) => (e.id === ev.id ? r.event : e)));
      if (lastSent?.id === ev.id) setLastSent(r.event);
      toast.success("Event marked resolved");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not resolve the event");
    } finally {
      setResolvingId(null);
    }
  }, [lastSent?.id]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 pb-16 sm:p-6">
      {/* Header */}
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
          <LifeBuoy className="size-6 text-rose-400" />
          SOS &amp; Emergency
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One-tap distress signal. Sending records a timestamped emergency event in
          your account with your GPS position when available.
        </p>
      </header>

      {/* Demo-safety notice */}
      <div
        className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200"
        role="note"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />
        <p>
          Demo project workflow: alerts are stored in this app&apos;s database and
          shown in your notifications. They are{" "}
          <strong>not dispatched to a real coast guard</strong> or any external
          rescue service. In a real emergency, call your local emergency number.
        </p>
      </div>

      {/* Status + SOS button */}
      <Card className="glass-card overflow-hidden">
        <CardContent className="flex flex-col items-center gap-4 py-2 text-center">
          <div className={cn("flex items-center gap-2 text-sm font-semibold", phaseMeta[phase].cls)}>
            <PhaseIcon className={cn("size-5", phase === "sending" && "animate-spin")} />
            {phaseMeta[phase].label}
            {lastSent && phase === "sent" && (
              <span className="font-normal text-muted-foreground">
                · {fmtDateTime(lastSent.timestamp)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={confirmSend}
            disabled={phase === "sending"}
            aria-label="Send emergency alert"
            className="group flex size-44 flex-col items-center justify-center gap-1 rounded-full border-4 border-rose-500/60 bg-gradient-to-br from-rose-600/40 to-rose-900/40 shadow-[0_0_60px_-10px_rgba(244,63,94,0.6)] transition-all hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-500/50 disabled:cursor-wait disabled:opacity-70 sm:size-52"
          >
            <LifeBuoy className="size-10 text-rose-200" />
            <span className="text-3xl font-black tracking-tight text-white">SOS</span>
            <span className="px-6 text-[11px] font-semibold uppercase tracking-widest text-rose-100/90">
              Send emergency alert
            </span>
          </button>
          {phase === "failed" && phaseDetail && (
            <p className="text-sm text-rose-300">{phaseDetail}</p>
          )}
          {phase === "sent" && lastSent && (
            <div className="w-full max-w-md rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-left text-sm">
              <p className="font-semibold text-emerald-300">SOS Alert Sent</p>
              <p className="mt-1 text-muted-foreground">
                {fmtDateTime(lastSent.timestamp)} · {lastSent.locationText}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* GPS + message + contact */}
      <section className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="size-4 text-primary" />
              Your position
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {gps.status === "ok" && gps.fix ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                <p className="font-mono tabular-nums">
                  {gps.fix.lat.toFixed(5)}, {gps.fix.lng.toFixed(5)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {gps.fix.accuracy != null
                    ? `Accuracy ±${Math.round(gps.fix.accuracy)} m · `
                    : ""}
                  Captured {gps.fix.at.toLocaleTimeString()}
                </p>
              </div>
            ) : gps.status === "locating" ? (
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/30 p-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                Acquiring GPS position…
              </div>
            ) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <p className="font-semibold text-amber-200">Location unavailable</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {gps.reason ?? "GPS has not been captured yet."} The alert will
                  still be recorded and clearly marked as having no GPS.
                </p>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => locate()}
              disabled={gps.status === "locating"}
            >
              <RefreshCw className={cn("size-3.5", gps.status === "locating" && "animate-spin")} />
              {gps.fix ? "Refresh GPS" : "Capture GPS"}
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="size-4 text-primary" />
              Emergency information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Fisherman</dt>
                <dd className="font-medium">{user?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Contact</dt>
                <dd className="font-medium">{user?.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Phone</dt>
                <dd className="font-medium">{profile.phone || "Not set in profile"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Vessel</dt>
                <dd className="font-medium">{profile.vesselName || "—"}</dd>
              </div>
            </dl>
            <div className="space-y-1.5">
              <Label htmlFor="sos-message">Optional emergency message</Label>
              <Textarea
                id="sos-message"
                rows={2}
                placeholder="e.g. Engine failure, taking on water, 2 crew…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={1000}
              />
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Phone className="mt-0.5 size-3.5 shrink-0" />
              Update your phone and vessel details in Profile &amp; Settings so
              responders see them here.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ── Emergency history ───────────────────────────────────────────── */}
      <section aria-label="Emergency history">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
          <ShieldAlert className="size-4 text-primary" />
          Emergency history
          {events && events.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {events.length}
            </Badge>
          )}
        </h2>
        {loading ? (
          <LoadingState label="Loading emergency history…" />
        ) : error ? (
          <ErrorState
            title="History unavailable"
            message={error}
            onRetry={() => { setLoading(true); load(); }}
          />
        ) : !events || events.length === 0 ? (
          <EmptyState
            title="No emergency events yet"
            description="Sent SOS alerts will be listed here with their time, location and status."
            icon={LifeBuoy}
          />
        ) : (
          <ul className="space-y-3">
            {events.map((ev) => {
              const meta = STATUS_META[ev.status] ?? STATUS_META.ACTIVE;
              const active = ev.status === "ACTIVE";
              return (
                <li key={ev.id}>
                  <article className="glass-card rounded-xl border border-border/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {fmtDateTime(ev.timestamp)}
                        </p>
                        <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                          <MapPin className="mt-0.5 size-3.5 shrink-0" />
                          <span>{ev.locationText}</span>
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("text-[10px]", meta.chip)}>
                        {meta.label}
                      </Badge>
                    </div>
                    {ev.message && (
                      <p className="mt-2 rounded-md bg-card/40 px-2.5 py-1.5 text-sm text-muted-foreground">
                        “{ev.message}”
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span>By {ev.fishermanName ?? "—"}</span>
                      {ev.contactPhone && <span>Phone: {ev.contactPhone}</span>}
                      {ev.accuracyM != null && (
                        <span>GPS ±{Math.round(ev.accuracyM)} m</span>
                      )}
                      {ev.resolvedAt && (
                        <span>Resolved {fmtDateTime(ev.resolvedAt)}</span>
                      )}
                    </div>
                    {active && isAdmin && (
                      <div className="mt-3 border-t border-border/50 pt-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={resolvingId === ev.id}
                          onClick={() => void resolveOne(ev)}
                        >
                          {resolvingId === ev.id && (
                            <Loader2 className="size-3.5 animate-spin" />
                          )}
                          Mark resolved (responder)
                        </Button>
                      </div>
                    )}
                    {active && !isAdmin && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Resolution is handled by the admin/response team.
                      </p>
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Confirmation ────────────────────────────────────────────────── */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send emergency alert?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to send an emergency alert? This records a
              timestamped distress event in your account
              {gps.fix
                ? ` with your GPS position (${gps.fix.lat.toFixed(5)}, ${gps.fix.lng.toFixed(5)}).`
                : " with location unavailable."}{" "}
              Demo record only — it is not sent to a real coast guard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={phase === "sending"}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-600/90"
              onClick={() => void send()}
            >
              <Send className="size-4" />
              Send SOS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default SosEmergencyView;
