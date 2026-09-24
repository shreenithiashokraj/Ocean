/**
 * Marine Platform · Feature 4 — export service (real data only).
 *
 * Builds CSV/JSON exports from EXISTING tables. Every response carries
 * provenance metadata (paper §VI). No sensitive fields (user ids, images,
 * free-text notes) are ever included.
 */
import { db } from "@/lib/db";
import { parseDwc } from "@/lib/marine/biodiversity/observations";
import { collectDataset, datasetMeta } from "./datasets";

/** RFC 4180-safe CSV cell. */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(csvCell).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(",")).join("\r\n");
  return `${header}\r\n${body}\r\n`;
}

export interface ExportParams {
  dataset: string;
  format: "csv" | "json";
  species?: string;
  origin?: string;
  from?: string | null;
  to?: string | null;
  limit: number;
}

export interface ExportResult {
  content: string;
  contentType: string;
  filename: string;
  recordCount: number;
  sources: string[];
}

export { datasetMeta };

export async function buildExport(p: ExportParams): Promise<ExportResult> {
  const meta = datasetMeta(p.dataset);
  if (!meta) throw new Error(`Unknown dataset: ${p.dataset}`);

  const dateRange =
    p.from || p.to
      ? {
          occurredAt: {
            ...(p.from ? { gte: new Date(p.from) } : {}),
            ...(p.to ? { lte: new Date(`${p.to}T23:59:59.999Z`) } : {}),
          },
        }
      : {};

  const { rows, columns, sources } = await collectDataset(p.dataset, {
    species: p.species,
    origin: p.origin,
    dateRange,
    limit: p.limit,
  });

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `${p.dataset}-${dateStamp}.${p.format}`;
  const provenance = {
    dataset: p.dataset,
    format: p.format,
    sourceTables: sources,
    standardization: "Darwin Core terms where applicable (paper Table II mapping)",
    recordCount: rows.length,
    filters: { species: p.species ?? null, origin: p.origin ?? null, from: p.from ?? null, to: p.to ?? null, limit: p.limit },
    exportedAt: new Date().toISOString(),
    generator: "Marine Platform exports service",
  };

  if (p.format === "json") {
    return {
      content: JSON.stringify({ provenance, records: rows }, null, 2),
      contentType: "application/json; charset=utf-8",
      filename,
      recordCount: rows.length,
      sources,
    };
  }
  return {
    content: toCsv(rows, columns),
    contentType: "text/csv; charset=utf-8",
    filename,
    recordCount: rows.length,
    sources,
  };
}
