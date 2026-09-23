"use client";

/**
 * Catch Logging — Fisherman Module.
 *
 * Lets the fisherman record daily catches (incl. bycatch), stores them via
 * the project's own /api/catches backend (SQLite, user-owned rows), and shows
 * history with summary cards + filters. Same dark OceanInsight UI language as
 * the other modules (glass-card, StatCard, sonner toasts).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  Camera,
  ClipboardList,
  Fish,
  History,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Scale,
  Shrimp,
  Trash2,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { CatchRecord, CatchRecordInput } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { StatCard } from "@/components/common/stat-card";

// ── Helpers ────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Format a YYYY-MM-DD calendar date without timezone drift. */
function fmtDateLong(yyyyMmDd: string): string {
  try {
    return new Date(`${yyyyMmDd}T00:00:00Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return yyyyMmDd;
  }
}

function fmtQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/\.?0+$/, "").slice(0, 8) || String(q);
}

/** Downscale an image file to a small data URL (max 800px, JPEG). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the photo"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode the photo"));
      img.onload = () => {
        try {
          const max = 800;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(typeof reader.result === "string" ? reader.result : "");
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        } catch (e) {
          reject(e instanceof Error ? e : new Error("Could not process the photo"));
        }
      };
      img.src = typeof reader.result === "string" ? reader.result : "";
    };
    reader.readAsDataURL(file);
  });
}

// ── Form state ─────────────────────────────────────────────────────────────

interface CatchForm {
  date: string;
  time: string;
  species: string;
  quantity: string;
  unit: string;
  averageSize: string;
  averageSizeUnit: string;
  estimatedWeight: string;
  bycatch: boolean;
  bycatchSpecies: string;
  location: string;
  notes: string;
  photoDataUrl: string | null;
}

function emptyForm(): CatchForm {
  return {
    date: todayStr(),
    time: "",
    species: "",
    quantity: "",
    unit: "kg",
    averageSize: "",
    averageSizeUnit: "cm",
    estimatedWeight: "",
    bycatch: false,
    bycatchSpecies: "",
    location: "",
    notes: "",
    photoDataUrl: null,
  };
}

function formFromRecord(r: CatchRecord): CatchForm {
  return {
    date: r.date,
    time: r.time ?? "",
    species: r.species,
    quantity: String(r.quantity),
    unit: r.unit,
    averageSize: r.averageSize != null ? String(r.averageSize) : "",
    averageSizeUnit: r.averageSizeUnit || "cm",
    estimatedWeight: r.estimatedWeight != null ? String(r.estimatedWeight) : "",
    bycatch: r.bycatch,
    bycatchSpecies: r.bycatchSpecies ?? "",
    location: r.location,
    notes: r.notes ?? "",
    photoDataUrl: r.photoDataUrl,
  };
}

function weightOf(r: CatchRecord): number {
  if (r.estimatedWeight != null && Number.isFinite(r.estimatedWeight)) {
    return r.estimatedWeight;
  }
  if (r.unit === "kg") return r.quantity;
  return 0;
}

// ── Main view ──────────────────────────────────────────────────────────────

export function CatchLoggingView() {
  const [catches, setCatches] = useState<CatchRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fSpecies, setFSpecies] = useState("");
  const [fLocation, setFLocation] = useState("");

  // Form
  const [form, setForm] = useState<CatchForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Dialogs
  const [details, setDetails] = useState<CatchRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CatchRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Load ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.listCatches({
        from: fFrom || undefined,
        to: fTo || undefined,
        species: fSpecies.trim() || undefined,
        location: fLocation.trim() || undefined,
      });
      setCatches(r.catches ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load catch history");
    } finally {
      setLoading(false);
    }
  }, [fFrom, fTo, fSpecies, fLocation]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Summary ──────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const list = catches ?? [];
    const today = todayStr();
    const todayQty = list
      .filter((c) => c.date === today)
      .reduce((s, c) => s + (Number.isFinite(c.quantity) ? c.quantity : 0), 0);
    const totalWeight = list.reduce((s, c) => s + weightOf(c), 0);
    const species = new Set(list.map((c) => c.species.trim().toLowerCase()));
    const bycatchCount = list.filter((c) => c.bycatch).length;
    return {
      todayQty,
      totalWeight,
      speciesCount: species.size,
      bycatchCount,
      totalRecords: list.length,
    };
  }, [catches]);

  const set = <K extends keyof CatchForm>(key: K, value: CatchForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const resetForm = useCallback(() => {
    setForm(emptyForm());
    setEditingId(null);
  }, []);



  // ── Photo ────────────────────────────────────────────────────────────────
  const onPhotoFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setPhotoBusy(true);
    try {
      const url = await fileToDataUrl(file);
      if (url.length > 2_000_000) {
        toast.error("Photo is too large even after resizing");
        return;
      }
      setForm((f) => ({ ...f, photoDataUrl: url }));
      toast.success("Photo attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not attach photo");
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!form.date) {
      toast.error("Pick a date for this catch");
      return;
    }
    if (form.species.trim().length < 2) {
      toast.error("Enter the fish/species name");
      return;
    }
    const qty = Number(form.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    if (form.location.trim().length < 2) {
      toast.error("Enter the fishing location");
      return;
    }
    const input: CatchRecordInput = {
      date: form.date,
      time: form.time.trim() || null,
      species: form.species.trim(),
      quantity: qty,
      unit: form.unit,
      averageSize: form.averageSize.trim() === "" ? null : Number(form.averageSize),
      averageSizeUnit: form.averageSizeUnit,
      estimatedWeight:
        form.estimatedWeight.trim() === "" ? null : Number(form.estimatedWeight),
      bycatch: form.bycatch,
      bycatchSpecies: form.bycatchSpecies.trim() || null,
      location: form.location.trim(),
      notes: form.notes.trim() || null,
      photoDataUrl: form.photoDataUrl,
    };
    setSaving(true);
    try {
      if (editingId) {
        const r = await api.updateCatch(editingId, input);
        setCatches((prev) =>
          (prev ?? []).map((c) => (c.id === editingId ? r.catch : c))
        );
        toast.success("Catch updated");
      } else {
        const r = await api.createCatch(input);
        setCatches((prev) => [r.catch, ...(prev ?? [])]);
        toast.success("Catch saved to your log");
      }
      resetForm();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save the catch");
    } finally {
      setSaving(false);
    }
  }, [form, editingId, resetForm]);

  const startEdit = useCallback((r: CatchRecord) => {
    setForm(formFromRecord(r));
    setEditingId(r.id);
    setDetails(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const deleteOne = useCallback(async (r: CatchRecord) => {
    setDeleting(true);
    try {
      await api.deleteCatch(r.id);
      setCatches((prev) => (prev ?? []).filter((c) => c.id !== r.id));
      toast.success("Catch record deleted");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete the record");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 pb-16 sm:p-6">
      {/* Header */}
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
          <ClipboardList className="size-6 text-primary" />
          Catch Logging
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track your daily catch &amp; bycatch. Records are stored in your account
          and persist across sessions.
        </p>
      </header>

      {/* Summary */}
      <section
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        aria-label="Catch summary"
      >
        <StatCard
          label="Today's Catch"
          value={loading ? "…" : fmtQty(summary.todayQty)}
          icon={Fish}
          accent="cyan"
          sub={`${todayStr()} · ${summary.totalRecords} record${summary.totalRecords === 1 ? "" : "s"} total`}
        />
        <StatCard
          label="Total Weight"
          value={loading ? "…" : summary.totalWeight.toFixed(1)}
          unit="kg"
          icon={Scale}
          accent="green"
          sub="Estimated + weighed catches"
        />
        <StatCard
          label="Species"
          value={loading ? "…" : summary.speciesCount}
          icon={Shrimp}
          accent="purple"
          sub="Distinct species logged"
        />
        <StatCard
          label="Bycatch"
          value={loading ? "…" : summary.bycatchCount}
          icon={History}
          accent="amber"
          sub="Records flagged as bycatch"
        />
      </section>

      {/* ── Add / edit form ─────────────────────────────────────────────── */}
      <Card className="glass-card animate-fade-up">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="size-4 text-primary" />
            {editingId ? "Edit catch record" : "Add a catch record"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="catch-date">Date *</Label>
              <Input
                id="catch-date"
                type="date"
                value={form.date}
                max={todayStr()}
                onChange={(e) => set("date", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="catch-time">Time</Label>
              <Input
                id="catch-time"
                type="time"
                value={form.time}
                onChange={(e) => set("time", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="catch-location">Fishing location *</Label>
              <Input
                id="catch-location"
                placeholder="e.g. Chennai Fishing Harbour"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="catch-species">Fish / species name *</Label>
              <Input
                id="catch-species"
                placeholder="e.g. Indian Mackerel"
                value={form.species}
                onChange={(e) => set("species", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="catch-qty">Quantity *</Label>
                <Input
                  id="catch-qty"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder="0"
                  value={form.quantity}
                  onChange={(e) => set("quantity", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="catch-unit">Unit</Label>
                <Select value={form.unit} onValueChange={(v) => set("unit", v)}>
                  <SelectTrigger id="catch-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="count">count</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="catch-size">Average size</Label>
                <Input
                  id="catch-size"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder="e.g. 32"
                  value={form.averageSize}
                  onChange={(e) => set("averageSize", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="catch-size-unit">Size unit</Label>
                <Select
                  value={form.averageSizeUnit}
                  onValueChange={(v) => set("averageSizeUnit", v)}
                >
                  <SelectTrigger id="catch-size-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cm">cm</SelectItem>
                    <SelectItem value="in">in</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="catch-weight">Estimated weight (kg)</Label>
              <Input
                id="catch-weight"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="Optional"
                value={form.estimatedWeight}
                onChange={(e) => set("estimatedWeight", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="catch-bycatch-species">Bycatch species</Label>
              <Input
                id="catch-bycatch-species"
                placeholder={form.bycatch ? "e.g. Olive Ridley Turtle" : "Only if applicable"}
                value={form.bycatchSpecies}
                onChange={(e) => set("bycatchSpecies", e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/30 px-3 py-2.5 sm:col-span-2 lg:col-span-1">
            <Switch
              id="catch-bycatch"
              checked={form.bycatch}
              onCheckedChange={(v) => set("bycatch", v)}
            />
            <div>
              <Label htmlFor="catch-bycatch" className="cursor-pointer">
                Bycatch
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Toggle on if this was incidental catch
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="catch-notes">Notes</Label>
            <Textarea
              id="catch-notes"
              rows={2}
              placeholder="Gear used, sea state, buyer…"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Optional photo</Label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void onPhotoFile(e.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={photoBusy}
                onClick={() => fileRef.current?.click()}
              >
                {photoBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Camera className="size-4" />
                )}
                {form.photoDataUrl ? "Replace photo" : "Attach photo"}
              </Button>
              {form.photoDataUrl && (
                <span className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.photoDataUrl}
                    alt="Catch preview"
                    className="size-10 rounded-md border border-border/60 object-cover"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => set("photoDataUrl", null)}
                  >
                    <X className="size-3.5" />
                    Remove
                  </Button>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editingId ? "Update Catch" : "Save Catch"}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={() => resetForm()}>
                Cancel
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => (editingId ? resetForm() : setForm(emptyForm()))}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <Card className="glass-card">
        <CardContent className="flex flex-wrap items-end gap-3 py-2">
          <div className="min-w-36 flex-1 space-y-1.5">
            <Label htmlFor="filter-from">From date</Label>
            <Input
              id="filter-from"
              type="date"
              value={fFrom}
              onChange={(e) => setFFrom(e.target.value)}
            />
          </div>
          <div className="min-w-36 flex-1 space-y-1.5">
            <Label htmlFor="filter-to">To date</Label>
            <Input
              id="filter-to"
              type="date"
              value={fTo}
              onChange={(e) => setFTo(e.target.value)}
            />
          </div>
          <div className="min-w-36 flex-1 space-y-1.5">
            <Label htmlFor="filter-species">Species</Label>
            <Input
              id="filter-species"
              placeholder="Filter by species"
              value={fSpecies}
              onChange={(e) => setFSpecies(e.target.value)}
            />
          </div>
          <div className="min-w-36 flex-1 space-y-1.5">
            <Label htmlFor="filter-location">Location</Label>
            <Input
              id="filter-location"
              placeholder="Filter by location"
              value={fLocation}
              onChange={(e) => setFLocation(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFFrom("");
              setFTo("");
              setFSpecies("");
              setFLocation("");
            }}
          >
            Clear filters
          </Button>
        </CardContent>
      </Card>

      {/* ── Catch history ───────────────────────────────────────────────── */}
      <section aria-label="Catch history">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
          <CalendarDays className="size-4 text-primary" />
          Catch history
          {catches && catches.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {catches.length}
            </Badge>
          )}
        </h2>
        {loading ? (
          <LoadingState label="Loading your catch log…" />
        ) : error ? (
          <ErrorState title="Catch log unavailable" message={error} onRetry={() => { setLoading(true); load(); }} />
        ) : !catches || catches.length === 0 ? (
          <EmptyState
            title="No catches logged yet"
            description="Add your first catch above — it will appear here."
            icon={Fish}
            action={
              <Button size="sm" variant="outline" onClick={() => void load()}>
                <RefreshCw className="size-3.5" />
                Refresh
              </Button>
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            {catches.map((c) => (
              <li key={c.id}>
                <article className="glass-card flex h-full flex-col gap-3 rounded-xl border border-border/60 p-4">
                  <div className="flex items-start gap-3">
                    {c.photoDataUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={c.photoDataUrl}
                        alt={`${c.species} catch photo`}
                        className="size-14 shrink-0 rounded-lg border border-border/60 object-cover"
                      />
                    ) : (
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/25 to-cyan-500/5 text-cyan-400">
                        <Fish className="size-6" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold tracking-tight">
                          {c.species}
                        </h3>
                        {c.bycatch && (
                          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300">
                            Bycatch
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {fmtDateLong(c.date)}
                        {c.time ? ` · ${c.time}` : ""}
                      </p>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    <div className="flex items-center gap-1.5">
                      <dt className="text-muted-foreground">Qty:</dt>
                      <dd className="font-medium tabular-nums">
                        {fmtQty(c.quantity)} {c.unit}
                      </dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <dt className="text-muted-foreground">Weight:</dt>
                      <dd className="font-medium tabular-nums">
                        {weightOf(c) > 0 ? `${weightOf(c).toFixed(1)} kg` : "—"}
                      </dd>
                    </div>
                    <div className="col-span-2 flex items-start gap-1.5">
                      <dt className="flex shrink-0 items-center gap-1 text-muted-foreground">
                        <MapPin className="size-3.5" />
                      </dt>
                      <dd className="truncate">{c.location}</dd>
                    </div>
                  </dl>
                  <div className="mt-auto flex flex-wrap gap-2 border-t border-border/50 pt-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => setDetails(c)}>
                      View details
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(c)}>
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                      onClick={() => setPendingDelete(c)}
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>


      {/* ── Detail dialog ───────────────────────────────────────────────── */}
      <Dialog open={details !== null} onOpenChange={(o) => { if (!o) setDetails(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{details?.species}</DialogTitle>
            <DialogDescription>
              {details ? `${fmtDateLong(details.date)}${details.time ? ` · ${details.time}` : ""}` : ""}
            </DialogDescription>
          </DialogHeader>
          {details && (
            <div className="space-y-3 text-sm">
              {details.photoDataUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={details.photoDataUrl}
                  alt={`${details.species} catch photo`}
                  className="max-h-56 w-full rounded-lg border border-border/60 object-cover"
                />
              )}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Quantity</dt>
                  <dd className="font-medium tabular-nums">{fmtQty(details.quantity)} {details.unit}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Weight</dt>
                  <dd className="font-medium tabular-nums">
                    {weightOf(details) > 0 ? `${weightOf(details).toFixed(1)} kg` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Avg size</dt>
                  <dd className="font-medium">
                    {details.averageSize != null ? `${details.averageSize} ${details.averageSizeUnit}` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Type</dt>
                  <dd className="font-medium">{details.bycatch ? "Bycatch" : "Target catch"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs uppercase text-muted-foreground">Location</dt>
                  <dd className="font-medium">{details.location}</dd>
                </div>
                {details.bycatchSpecies && (
                  <div className="col-span-2">
                    <dt className="text-xs uppercase text-muted-foreground">Bycatch species</dt>
                    <dd className="font-medium">{details.bycatchSpecies}</dd>
                  </div>
                )}
                {details.notes && (
                  <div className="col-span-2">
                    <dt className="text-xs uppercase text-muted-foreground">Notes</dt>
                    <dd className="whitespace-pre-wrap text-muted-foreground">{details.notes}</dd>
                  </div>
                )}
              </dl>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" size="sm" variant="outline" onClick={() => startEdit(details)}>
                  <Pencil className="size-3.5" />
                  Edit
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ─────────────────────────────────────────── */}
      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete catch record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove “{pendingDelete?.species}” caught on{" "}
              {pendingDelete ? fmtDateLong(pendingDelete.date) : ""}. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => pendingDelete && void deleteOne(pendingDelete)}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default CatchLoggingView;



