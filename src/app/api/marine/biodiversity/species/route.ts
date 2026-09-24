import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { marineGuard, auditRequest } from "@/lib/marine/route-helpers";
import { parseDwc } from "@/lib/marine/biodiversity/observations";

export const runtime = "nodejs";

/**
 * GET /api/marine/biodiversity/species
 *
 * Species catalogue built ONLY from real stored occurrences. Each entry
 * carries its Darwin Core terms (paper Table II), the honest taxonRank
 * (species-level only when the source actually stored a species-level ID),
 * observation counts and the provenance origin tables.
 *
 * Query params:
 *   ?search=   case-insensitive match on scientificName
 *   ?origin=   filter by provenance (fishing-spot | fish-analysis | …)
 *   ?page=&pageSize=
 */
export async function GET(req: Request) {
  const guard = await marineGuard("biodiversity");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const origin = url.searchParams.get("origin")?.trim() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(Math.max(1, Number(url.searchParams.get("pageSize") ?? "25")), 100);

  const where = {
    ...(search ? { scientificName: { contains: search } } : {}),
    ...(origin ? { originTable: origin } : {}),
  };

  const [rows, total, distinct] = await Promise.all([
    db.marineSpeciesObservation.findMany({
      where,
      orderBy: [{ scientificName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.marineSpeciesObservation.count({ where }),
    db.marineSpeciesObservation.groupBy({
      by: ["scientificName"],
      _count: { _all: true },
      _sum: { count: true },
    }),
  ]);

  auditRequest({
    userId: guard.session.userId,
    action: "read",
    resource: "marine.biodiversity.species",
    endpoint: "/api/marine/biodiversity/species",
    status: 200,
  });

  return NextResponse.json({
    species: rows.map((r) => ({
      id: r.id,
      scientificName: r.scientificName,
      taxonRank: r.taxonRank,
      // Darwin Core terms per paper Table II (only what the record truly stores)
      dwc: parseDwc(r.dwc),
      latitude: r.latitude,
      longitude: r.longitude,
      occurredAt: r.occurredAt,
      count: r.count,
      originTable: r.originTable,
      originId: r.originId,
      hasCoordinates: r.latitude != null && r.longitude != null,
    })),
    total,
    page,
    pageSize,
    summary: {
      distinctSpecies: distinct.length,
      totalObservations: distinct.reduce((sum, d) => sum + (d._sum.count ?? 0), 0),
    },
  });
}
