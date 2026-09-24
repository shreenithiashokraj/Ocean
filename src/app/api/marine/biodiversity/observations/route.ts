import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { marineGuard, auditRequest } from "@/lib/marine/route-helpers";
import { parseDwc } from "@/lib/marine/biodiversity/observations";

export const runtime = "nodejs";

/**
 * GET /api/marine/biodiversity/observations
 *
 * Paginated raw occurrence feed (row-level detail behind the catalogue).
 * Filters: ?species= ?origin= ?cell= ?hasCoords=1 ?from=&to=
 *
 * LIMITATION (documented, not hidden): embargo/sovereignty filtering is NOT
 * applied here yet — the MarineEmbargo table (Phase 1 bundle) has not been
 * pushed on this deployment and MarineSpeciesObservation deliberately carries
 * no embargo relation of its own. When the governance bundle ships for this
 * feature, a filter hook goes here.
 */
export async function GET(req: Request) {
  const guard = await marineGuard("biodiversity");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const species = url.searchParams.get("species")?.trim() ?? "";
  const origin = url.searchParams.get("origin")?.trim() ?? "";
  const cell = url.searchParams.get("cell")?.trim() ?? "";
  const hasCoords = url.searchParams.get("hasCoords") === "1";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(Math.max(1, Number(url.searchParams.get("pageSize") ?? "25")), 100);

  const where = {
    ...(species ? { scientificName: { contains: species } } : {}),
    ...(origin ? { originTable: origin } : {}),
    ...(cell ? { spatialCell: cell } : {}),
    ...(hasCoords ? { latitude: { not: null }, longitude: { not: null } } : {}),
    ...(from || to
      ? {
          occurredAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.marineSpeciesObservation.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.marineSpeciesObservation.count({ where }),
  ]);

  auditRequest({
    userId: guard.session.userId,
    action: "read",
    resource: "marine.biodiversity.observations",
    endpoint: "/api/marine/biodiversity/observations",
    status: 200,
  });

  return NextResponse.json({
    observations: rows.map((r) => ({
      id: r.id,
      scientificName: r.scientificName,
      taxonRank: r.taxonRank,
      dwc: parseDwc(r.dwc),
      latitude: r.latitude,
      longitude: r.longitude,
      occurredAt: r.occurredAt,
      spatialCell: r.spatialCell,
      count: r.count,
      originTable: r.originTable,
      originId: r.originId,
    })),
    total,
    page,
    pageSize,
  });
}
