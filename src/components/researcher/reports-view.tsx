"use client";

/**
 * Researcher Reports — Fisherman Module (Task F5).
 *
 * Lists the caller's saved research reports via
 * `/api/researcher/reports` (GET). Each report is a glass-card with the
 * title, description, datasetKey badge, created/updated time, a "View JSON"
 * dialog (pretty-prints filtersJson + summaryJson), and an AlertDialog delete
 * confirmation that calls `/api/researcher/reports/:id` (DELETE).
 *
 * All data comes from the DB. No PII is rendered — reports reference only
 * the dataset key + filters + summary snapshot saved at creation time.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Code2,
  FileText,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/states";

// ── Types ────────────────────────────────────────────────────────────────────

interface SavedReport {
  id: string;
  title: string;
  description: string | null;
  datasetKey: string;
  filtersJson: string | null;
  summaryJson: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ReportsResponse {
  reports: SavedReport[];
}

// ── Dataset-key → display name (matches the dataset registry) ──────────────

const DATASET_LABEL: Record<string, string> = {
  "sea-conditions": "Marine & Weather Observations",
  "fish-analyses": "Fish Species Predictions",
  "fishing-spots": "Fishing Spot Registry",
  alerts: "Weather Alert Log",
};

const DATASET_ACCENT: Record<string, string> = {
  "sea-conditions": "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  "fish-analyses": "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  "fishing-spots": "border-amber-500/40 bg-amber-500/10 text-amber-300",
  alerts: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function prettyJson(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ResearcherReportsView() {
  const [reports, setReports] = useState<SavedReport[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // View-JSON dialog
  const [viewing, setViewing] = useState<SavedReport | null>(null);

  // Delete confirmation
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.listResearcherReports();
      setReports((r as unknown as ReportsResponse).reports ?? []);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Failed to load reports.";
      setError(msg);
      toast.error("Failed to load research reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(true);
    try {
      await api.deleteResearcherReport(id);
      setReports((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
      toast.success("Report deleted.");
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Failed to delete report.";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }, []);

  const sorted = useMemo(() => {
    if (!reports) return [];
    return [...reports].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [reports]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="glass-card animate-fade-up rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Research Reports
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Saved snapshots of your research queries.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="self-start"
            aria-label="Refresh reports"
          >
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            Refresh
          </Button>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      {error ? (
        <div className="mt-4">
          <ErrorState message={error} onRetry={() => void load()} />
        </div>
      ) : loading && !reports ? (
        <div className="mt-6">
          <LoadingState label="Loading reports…" />
        </div>
      ) : !reports || reports.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No saved reports yet"
            description="Create one from a dataset's detail page by clicking 'Save as report'."
            icon={FileText}
            className="py-12"
          />
        </div>
      ) : (
        <section
          className="mt-4 grid gap-4 sm:grid-cols-2"
          aria-label="Saved research reports"
        >
          {sorted.map((r) => (
            <Card key={r.id} className="glass-card animate-fade-up flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 text-cyan-400">
                    <FileText className="size-5" />
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      DATASET_ACCENT[r.datasetKey] ??
                      "border-border/40 bg-muted/20 text-muted-foreground"
                    }`}
                  >
                    {DATASET_LABEL[r.datasetKey] ?? r.datasetKey}
                  </Badge>
                </div>
                <CardTitle className="mt-2 text-base leading-snug">
                  {r.title}
                </CardTitle>
                <CardDescription className="text-xs">
                  Created {fmtDateTime(r.createdAt)}
                  {r.updatedAt !== r.createdAt && (
                    <span className="text-muted-foreground/70">
                      {"  ·  Updated "}
                      {fmtDateTime(r.updatedAt)}
                    </span>
                  )}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {r.description || "No description provided."}
                </p>

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewing(r)}
                    aria-label={`View JSON for ${r.title}`}
                  >
                    <Code2 className="mr-1 size-4" />
                    View JSON
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                        aria-label={`Delete report ${r.title}`}
                        disabled={deleting}
                      >
                        <Trash2 className="mr-1 size-4" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete report?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete &ldquo;{r.title}&rdquo;.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-rose-600 text-rose-50 hover:bg-rose-700"
                          disabled={deleting}
                          onClick={(e) => {
                            e.preventDefault();
                            void handleDelete(r.id);
                          }}
                        >
                          {deleting ? "Deleting…" : "Delete"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {/* ── View-JSON dialog ──────────────────────────────────────────────────── */}
      <Dialog
        open={!!viewing}
        onOpenChange={(o) => {
          if (!o) setViewing(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Report JSON</DialogTitle>
            <DialogDescription>
              Raw filters and summary snapshot stored for &ldquo;{viewing?.title}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                Filters
              </div>
              <pre className="scroll-ocean max-h-60 overflow-auto rounded-lg border border-border/40 bg-muted/30 p-3 text-[11px] leading-relaxed">
                <code>
                  {prettyJson(viewing?.filtersJson ?? null, "No filters saved.")}
                </code>
              </pre>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                Summary
              </div>
              <pre className="scroll-ocean max-h-60 overflow-auto rounded-lg border border-border/40 bg-muted/30 p-3 text-[11px] leading-relaxed">
                <code>
                  {prettyJson(viewing?.summaryJson ?? null, "No summary saved.")}
                </code>
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ResearcherReportsView;
