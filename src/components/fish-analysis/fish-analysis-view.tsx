"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Fish,
  ImageUp,
  Loader2,
  Sparkles,
  Trash2,
  RefreshCw,
  ChevronDown,
  Ruler,
  Scale,
  Tag,
  Wallet,
  Info,
  X,
  Camera,
} from "lucide-react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import type { FishAnalysisResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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
import {
  LoadingState,
  CardSkeleton,
  ErrorState,
  EmptyState,
  Unavailable,
} from "@/components/common/states";

/** Max image upload size on the client (must match backend ~8 MB). */
const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** A history record returned by GET /api/fish-analysis. */
interface FishHistoryItem {
  id: string;
  imageDataUrl: string;
  species: string | null;
  confidence: number | null;
  alternatives: { species: string; confidence: number }[] | null;
  sizeRange: string | null;
  weightRange: string | null;
  characteristics: string[] | null;
  notes: string | null;
  qualityWarning: string | null;
  market: {
    pricePerKg: string | null;
    currency: string | null;
    market: string | null;
    priceDate: string | null;
    source: string | null;
  } | null;
  createdAt: string;
}

/** Percentage display for a 0..1 confidence. */
function pct(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return `${Math.round(v * 100)}%`;
}

/** Format an ISO date for compact display. */
function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Validate a File object on the client (mirrors the backend rules). */
function validateImageFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `Unsupported image type '${file.type || "unknown"}'. Allowed: JPEG, PNG, WebP.`;
  }
  if (file.size > MAX_BYTES) {
    return `Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ~8 MB.`;
  }
  return null;
}

/** Read a File as a data URL. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ""));
    fr.onerror = () => reject(new Error("Failed to read image file."));
    fr.readAsDataURL(file);
  });
}

// ─── Main view ──────────────────────────────────────────────────────────────

export function FishAnalysisView() {
  return <FishAnalysisInner />;
}

export default FishAnalysisView;

function FishAnalysisInner() {
  // Uploader state
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLLabelElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Result state
  const [result, setResult] = useState<FishAnalysisResult | null>(null);
  const [resultThumb, setResultThumb] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // History state
  const [history, setHistory] = useState<FishHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ─── Load history on mount ────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await api.listFishAnalyses();
      setHistory((res.analyses as FishHistoryItem[]) ?? []);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to load history.";
      setHistoryError(msg);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // ─── Image selection handlers ────────────────────────────────────────────
  const resetUploader = useCallback(() => {
    setPreview(null);
    setFileError(null);
    setUploadProgress(0);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setResult(null);
      setResultThumb(null);
      setAnalyzeError(null);
      const err = validateImageFile(file);
      if (err) {
        setFileError(err);
        setPreview(null);
        return;
      }
      setFileError(null);
      setIsUploading(true);
      setUploadProgress(0);
      try {
        const dataUrl = await readAsDataUrl(file);
        setPreview(dataUrl);
        // Simulate a quick upload-bar fill while reading (file is local; the
        // real "send" happens during analyze). Smooth UX feedback only.
        let p = 0;
        const tick = setInterval(() => {
          p = Math.min(100, p + 12 + Math.random() * 18);
          setUploadProgress(p);
          if (p >= 100) clearInterval(tick);
        }, 60);
      } catch (e) {
        setFileError(e instanceof Error ? e.message : "Could not read image.");
      } finally {
        setIsUploading(false);
      }
    },
    [],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  // ─── Analyze ──────────────────────────────────────────────────────────────
  const onAnalyze = useCallback(async () => {
    if (!preview) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    setResult(null);
    setResultThumb(preview);
    try {
      const res = await api.analyzeFish(preview);
      setResult(res.analysis);
      toast.success("AI analysis complete", {
        description: res.analysis.species
          ? `Predicted: ${res.analysis.species}`
          : "Could not identify species with confidence.",
      });
      // Refresh history so the new row appears.
      loadHistory();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "AI analysis failed.";
      setAnalyzeError(msg);
      toast.error("AI analysis failed", { description: msg });
    } finally {
      setAnalyzing(false);
    }
  }, [preview, loadHistory]);

  // ─── Delete ────────────────────────────────────────────────────────────────
  const onDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await api.deleteFishAnalysis(id);
        setHistory((h) => h.filter((x) => x.id !== id));
        if (expandedId === id) setExpandedId(null);
        toast.success("Analysis deleted");
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Failed to delete analysis.";
        toast.error("Delete failed", { description: msg });
      } finally {
        setDeletingId(null);
      }
    },
    [expandedId],
  );

  return (
    <section
      className="mx-auto max-w-6xl px-4 py-6 sm:px-6"
      aria-labelledby="fish-analysis-heading"
    >
      {/* Header */}
      <header className="mb-5 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/30 to-purple-500/5 text-purple-400">
            <Sparkles className="size-5" />
          </span>
          <h1
            id="fish-analysis-heading"
            className="text-2xl font-bold tracking-tight sm:text-3xl"
          >
            AI Fish Analysis
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Upload a photo of your catch and the vision AI will predict the species,
          size, and identifying characteristics. Results are saved to your history.
        </p>
      </header>

      {/* Prediction disclaimer */}
      <div
        role="note"
        className="mb-5 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200"
      >
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden />
        <p className="text-sm">
          <span className="font-semibold">AI prediction only.</span>{" "}
          This is an AI prediction. Verify species with a local expert before consumption or sale.
        </p>
      </div>

      {/* Uploader */}
      <Card className="glass-card mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageUp className="size-5 text-purple-400" aria-hidden /> Upload a fish photo
          </CardTitle>
          <CardDescription>
            JPEG, PNG, or WebP. Maximum size ~8&nbsp;MB. The photo is processed on the server by the vision AI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label
            ref={dragRef}
            htmlFor="fish-file-input"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
            className={cn(
              "group relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
              isDragOver
                ? "border-purple-400/70 bg-purple-500/10"
                : "border-border/60 hover:border-purple-400/50 hover:bg-purple-500/5",
            )}
          >
            {preview ? (
              <div className="relative flex w-full flex-col items-center gap-3">
                <img
                  src={preview}
                  alt="Selected fish photo preview"
                  className="max-h-64 w-auto max-w-full rounded-lg border border-border/60 object-contain shadow-md"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    resetUploader();
                  }}
                  className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground shadow hover:bg-background"
                  aria-label="Remove selected image"
                >
                  <X className="size-4" />
                </button>
                <p className="text-xs text-muted-foreground">
                  Click the image area to replace it, or press <span className="font-medium">Analyze Fish</span>.
                </p>
              </div>
            ) : (
              <>
                <span className="flex size-14 items-center justify-center rounded-full bg-purple-500/15 text-purple-300">
                  <Camera className="size-7" />
                </span>
                <div>
                  <p className="font-medium">
                    Drag &amp; drop a fish photo here
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    or click to browse files
                  </p>
                </div>
              </>
            )}
            <input
              id="fish-file-input"
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={onInputChange}
              aria-label="Choose a fish photo to upload"
            />
          </label>

          {/* Upload progress bar */}
          {(isUploading || uploadProgress > 0) && (
            <div className="space-y-1" aria-live="polite">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{isUploading ? "Preparing image…" : "Image ready"}</span>
                <span className="tabular-nums">{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={uploadProgress} aria-label="Image preparation progress" />
            </div>
          )}

          {/* File validation error */}
          {fileError && (
            <p role="alert" className="text-sm text-destructive">
              {fileError}
            </p>
          )}

          {/* Action row */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {preview ? "Ready to analyze." : "Select an image to begin."}
            </p>
            <Button
              type="button"
              size="lg"
              onClick={onAnalyze}
              disabled={!preview || analyzing}
              className="bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white hover:from-purple-500 hover:to-fuchsia-500"
            >
              {analyzing ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" aria-hidden /> Analyze Fish
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Analysis loading state */}
      {analyzing && (
        <Card className="glass-card mb-6 border-purple-500/20">
          <CardContent className="space-y-3 py-2">
            <LoadingState label="Analyzing image with AI…" className="py-6" />
            <div className="grid gap-2 sm:grid-cols-2">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analyze error */}
      {analyzeError && !analyzing && (
        <ErrorState
          title="AI analysis failed"
          message={analyzeError}
          onRetry={preview ? onAnalyze : undefined}
          className="mb-6"
        />
      )}

      {/* Result card */}
      {result && !analyzing && (
        <ResultCard analysis={result} thumbnail={resultThumb ?? preview} />
      )}

      {/* History */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Fish className="size-5 text-purple-400" aria-hidden /> Your Analysis History
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={loadHistory}
            disabled={historyLoading}
          >
            <RefreshCw className={cn("size-4", historyLoading && "animate-spin")} aria-hidden />
            Refresh
          </Button>
        </div>

        {historyLoading ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : historyError ? (
          <ErrorState
            title="Could not load history"
            message={historyError}
            onRetry={loadHistory}
          />
        ) : history.length === 0 ? (
          <EmptyState
            icon={Fish}
            title="No analyses yet"
            description="Upload a fish photo and run an analysis to see it here."
          />
        ) : (
          <ul className="space-y-3" aria-label="Fish analysis history list">
            {history.map((item) => (
              <HistoryRow
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                onToggle={() =>
                  setExpandedId((cur) => (cur === item.id ? null : item.id))
                }
                onDelete={() => onDelete(item.id)}
                deleting={deletingId === item.id}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─── Result card ─────────────────────────────────────────────────────────────

function ResultCard({
  analysis,
  thumbnail,
}: {
  analysis: FishAnalysisResult;
  thumbnail: string | null;
}) {
  const confidencePct =
    analysis.confidence != null && isFinite(analysis.confidence)
      ? Math.round(analysis.confidence * 100)
      : null;

  return (
    <Card className="glass-card animate-fade-up border-purple-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-purple-400" aria-hidden /> AI Prediction
        </CardTitle>
        <CardDescription>
          Results from the vision AI. Always verify before consumption or sale.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 md:grid-cols-[200px_1fr]">
          {/* Thumbnail */}
          <div className="mx-auto md:mx-0">
            {thumbnail ? (
              <img
                src={thumbnail}
                alt="Analyzed fish photo"
                className="max-h-56 w-full max-w-[200px] rounded-lg border border-border/60 object-cover shadow"
              />
            ) : (
              <div className="flex h-32 w-full max-w-[200px] items-center justify-center rounded-lg border border-dashed border-border/60 text-muted-foreground">
                <Fish className="size-8" />
              </div>
            )}
          </div>

          {/* Species + confidence */}
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Predicted species
              </p>
              <p className="text-2xl font-bold leading-tight">
                {analysis.species ?? "Unidentified"}
              </p>
            </div>

            <div className="space-y-1.5" aria-live="polite">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Confidence</span>
                <span className="font-semibold tabular-nums">
                  {confidencePct != null ? `${confidencePct}%` : "—"}
                </span>
              </div>
              <Progress value={confidencePct ?? 0} aria-label="Prediction confidence" />
            </div>

            {/* Alternatives */}
            {analysis.alternatives && analysis.alternatives.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Alternative possibilities
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.alternatives.map((a, i) => (
                    <Badge
                      key={`${a.species}-${i}`}
                      variant="secondary"
                      className="border-purple-500/20 bg-purple-500/10 text-purple-200"
                    >
                      {a.species}
                      <span className="ml-1 tabular-nums text-purple-300/80">
                        {pct(a.confidence)}
                      </span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Size + weight */}
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricBox
            icon={<Ruler className="size-4" />}
            label="Estimated size"
            value={analysis.sizeRange}
          />
          <MetricBox
            icon={<Scale className="size-4" />}
            label="Estimated weight"
            value={analysis.weightRange}
          />
        </div>

        {/* Characteristics */}
        {analysis.characteristics && analysis.characteristics.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Identifying characteristics
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {analysis.characteristics.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Notes */}
        {analysis.notes && (
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Identification notes
            </p>
            <p className="text-sm leading-relaxed">{analysis.notes}</p>
          </div>
        )}

        {/* Quality warning */}
        {analysis.qualityWarning && (
          <div
            role="note"
            className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
            <p className="text-sm">
              <span className="font-semibold">Image quality note:</span>{" "}
              {analysis.qualityWarning}
            </p>
          </div>
        )}

        {/* Market price */}
        <div className="rounded-lg border border-border/60 bg-card/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Wallet className="size-4 text-purple-400" aria-hidden /> Market price
          </div>
          {analysis.market?.pricePerKg ? (
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <PriceRow label="Price / kg" value={`${analysis.market.pricePerKg} ${analysis.market.currency ?? ""}`.trim()} />
              <PriceRow label="Market" value={analysis.market.market} />
              <PriceRow label="Date" value={analysis.market.priceDate ? fmtDate(analysis.market.priceDate) : null} />
              <PriceRow label="Source" value={analysis.market.source} />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <Tag className="size-4 text-muted-foreground" aria-hidden />
              <Unavailable />
              <span className="text-xs text-muted-foreground">
                — set <code className="rounded bg-muted/40 px-1">FISH_MARKET_API_URL</code> &amp;{" "}
                <code className="rounded bg-muted/40 px-1">FISH_MARKET_API_KEY</code> to enable.
              </span>
            </div>
          )}
        </div>

        {/* Footer disclaimer */}
        <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Predictions are produced by a vision-language model and may be incorrect.
            Treat species and size estimates as a rough guide, not a determination.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricBox({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="text-sm font-medium">
        {value ? value : <Unavailable />}
      </p>
    </div>
  );
}

function PriceRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value ?? "—"}</span>
    </div>
  );
}

// ─── History row ─────────────────────────────────────────────────────────────

function HistoryRow({
  item,
  expanded,
  onToggle,
  onDelete,
  deleting,
}: {
  item: FishHistoryItem;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const conf = item.confidence != null && isFinite(item.confidence)
    ? Math.round(item.confidence * 100)
    : null;

  return (
    <li className="glass-card overflow-hidden rounded-xl border border-border/60">
      <div className="flex items-center gap-3 p-3">
        {/* Thumbnail */}
        <img
          src={item.imageDataUrl}
          alt={`Analyzed fish photo — ${item.species ?? "unidentified"}`}
          className="size-14 shrink-0 rounded-lg border border-border/60 object-cover"
        />

        {/* Summary */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={`history-detail-${item.id}`}
          className="group flex min-w-0 flex-1 items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-md px-1"
        >
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {item.species ?? "Unidentified"}
            </p>
            <p className="text-xs text-muted-foreground">
              {fmtDate(item.createdAt)} ·{" "}
              {conf != null ? `${conf}% confidence` : "no confidence"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {item.qualityWarning && (
              <Badge variant="outline" className="border-amber-500/30 text-amber-300">
                <AlertTriangle className="mr-1 size-3" aria-hidden />
                Quality
              </Badge>
            )}
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                expanded && "rotate-180",
              )}
              aria-hidden
            />
          </div>
        </button>

        {/* Delete */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={deleting}
              aria-label="Delete analysis"
              className="text-muted-foreground hover:text-destructive"
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this analysis?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the analysis record for{" "}
                <span className="font-medium">{item.species ?? "this fish"}</span>. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div
          id={`history-detail-${item.id}`}
          className="border-t border-border/60 bg-card/30 p-4"
        >
          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <img
              src={item.imageDataUrl}
              alt={`Analyzed fish photo — ${item.species ?? "unidentified"}`}
              className="max-h-40 w-full max-w-[160px] rounded-lg border border-border/60 object-cover"
            />
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Species · Confidence
                </span>
                <p className="font-medium">
                  {item.species ?? "Unidentified"} ·{" "}
                  {conf != null ? `${conf}%` : "—"}
                </p>
              </div>

              {item.alternatives && item.alternatives.length > 0 && (
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Alternatives
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {item.alternatives.map((a, i) => (
                      <Badge key={i} variant="secondary">
                        {a.species} · {pct(a.confidence)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Size range
                  </span>
                  <p>{item.sizeRange ?? <Unavailable />}</p>
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Weight range
                  </span>
                  <p>{item.weightRange ?? <Unavailable />}</p>
                </div>
              </div>

              {item.characteristics && item.characteristics.length > 0 && (
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Characteristics
                  </span>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {item.characteristics.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {item.notes && (
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Notes
                  </span>
                  <p className="leading-relaxed">{item.notes}</p>
                </div>
              )}

              {item.qualityWarning && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
                  <p className="text-xs">{item.qualityWarning}</p>
                </div>
              )}

              {/* Market price */}
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Market price
                </span>
                {item.market?.pricePerKg ? (
                  <p className="font-medium">
                    {item.market.pricePerKg} {item.market.currency ?? ""} ·{" "}
                    <span className="text-muted-foreground">
                      {item.market.market ?? "—"}
                      {item.market.priceDate ? ` · ${fmtDate(item.market.priceDate)}` : ""}
                    </span>
                  </p>
                ) : (
                  <p>
                    <Unavailable />
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
