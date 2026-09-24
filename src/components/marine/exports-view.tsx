"use client";

/**
 * Marine Platform · Researcher module — Exports.
 *
 * Dataset picker + filters + preview + real CSV/JSON download from
 * /api/marine/exports. Provenance shown from the preview response; the file
 * embeds it (JSON) or is a clean RFC-4180 CSV. No fake rows — empty datasets
 * say so.
 */
import { useCallback, useEffect, useState } from "react";
import { FileDown, FileJson, FileSpreadsheet, Loader2, Table2 } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/common/states";

interface DatasetOption {
  key: string;
  label: string;
  sources: string[];
}

interface PreviewResponse {
  provenance: {
    dataset: string;
    sourceTables: string[];
    standardization: string;
    recordCount: number;
    filters: Record<string, unknown>;
    exportedAt: string;
  };
  previewRows: Record<string, unknown>[];
  recordCount: number;
  filename: string;
  error?: string;
}

export function ExportsView() {
  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [dataset, setDataset] = useState("");
  const [species, setSpecies] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<"csv" | "json" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/marine/exports/datasets", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new ApiError((await r.json()).error ?? "Failed to load datasets", r.status);
        return r.json();
      })
      .then((d: { datasets: DatasetOption[] }) => {
        setDatasets(d.datasets);
        if (d.datasets.length) setDataset(d.datasets[0].key);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load datasets"));
  }, []);

  const doPreview = useCallback(async () => {
    if (!dataset) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/marine/exports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dataset, species: species || undefined, from: from || undefined, to: to || undefined }),
      });
      const data = (await res.json()) as PreviewResponse;
      if (!res.ok) throw new ApiError(data.error ?? "Preview failed", res.status);
      setPreview(data);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }, [dataset, species, from, to]);

  function download(format: "csv" | "json") {
    if (!dataset) return;
    setDownloading(format);
    try {
      const qs = new URLSearchParams({ dataset, format });
      if (species.trim()) qs.set("species", species.trim());
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const a = document.createElement("a");
      a.href = `/api/marine/exports?${qs}`;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(`${format.toUpperCase()} export started`);
    } finally {
      setDownloading(null);
    }
  }

  const columns = preview?.previewRows.length ? Object.keys(preview.previewRows[0]) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <FileDown className="size-6 text-primary" /> Exports
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Export real project data as CSV or JSON. Every file embeds provenance metadata
          (source tables, standardization method, filters, timestamp).
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configure export</CardTitle>
          <CardDescription>Filters apply to both preview and downloaded file.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={dataset}
              onChange={(e) => {
                setDataset(e.target.value);
                setPreview(null);
              }}
              className="h-9 min-w-[240px] rounded-md border border-border bg-background px-2 text-sm"
            >
              {datasets.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
            <Input placeholder="Species filter (optional)" value={species}
              onChange={(e) => setSpecies(e.target.value)} className="w-52" />
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            <Button size="sm" onClick={() => void doPreview()} disabled={!dataset || busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Table2 className="size-4" />}
              Preview
            </Button>
          </div>
          {preview && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => download("csv")} disabled={downloading !== null}>
                {downloading === "csv" ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
                Export CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => download("json")} disabled={downloading !== null}>
                {downloading === "json" ? <Loader2 className="size-4 animate-spin" /> : <FileJson className="size-4" />}
                Export JSON
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {error && <ErrorState message={error} onRetry={doPreview} />}

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview — {preview.filename}</CardTitle>
            <CardDescription>
              {preview.recordCount} records · sources: {preview.provenance.sourceTables.join(", ")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {preview.recordCount === 0 ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                No records match these filters in the database — the export would be empty.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        {columns.slice(0, 7).map((c) => (
                          <th key={c} className="py-2 pr-3">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.previewRows.map((r, i) => (
                        <tr key={i} className="border-b border-border/30">
                          {columns.slice(0, 7).map((c) => (
                            <td key={c} className="py-1.5 pr-3 text-xs">
                              {typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c] ?? "—")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[9px]">provenance</Badge>
                  {preview.provenance.standardization} · exported {new Date(preview.provenance.exportedAt).toLocaleString()}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}