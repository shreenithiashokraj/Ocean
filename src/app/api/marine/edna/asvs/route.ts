import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { marineGuard, auditRequest } from "@/lib/marine/route-helpers";
import { ednaSummary } from "@/lib/marine/edna/store";

export const runtime = "nodejs";

/**
 * GET /api/marine/edna/asvs
 *
 * Paginated eDNA ASV listing with real-field filters only:
 *   ?search= (asvId or scientificName contains) &taxonRank= &targetGene=
 *   &species= &from=&to= (eventDate range) &hasCoords=1 &source= &page=&pageSize=
 * Summary stats are computed from the same stored rows — zeros are honest.
 */
export async function GET(req: Request) {
  const guard = await marineGuard("edna");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const taxonRank = url.searchParams.get("taxonRank")?.trim() ?? "";
  const targetGene = url.searchParams.get("targetGene")?.trim() ?? "";
  const species = url.searchParams.get("species")?.trim() ?? "";
  const source = url.searchParams.get("source")?.trim() ?? "";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const hasCoords = url.searchParams.get("hasCoords") === "1";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(Math.max(1, Number(url.searchParams.get("pageSize") ?? "25")), 100);

  const where = {
    ...(search
      ? {
          OR: [
            { asvId: { contains: search } },
            { scientificName: { contains: search } },
          ],
        }
      : {}),
    ...(taxonRank ? { taxonRank } : {}),
    ...(targetGene ? { targetGene } : {}),
    ...(species ? { scientificName: { contains: species } } : {}),
    ...(source ? { source: { contains: source } } : {}),
    ...(hasCoords ? { latitude: { not: null } } : {}),
    ...(from || to
      ? { eventDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } }
      : {}),
  };

  const [rows, total, summary] = await Promise.all([
    db.marineEdnaAsv.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.marineEdnaAsv.count({ where }),
    ednaSummary(),
  ]);

  auditRequest({
    userId: guard.session.userId,
    action: "read",
    resource: "marine.edna.asvs",
    endpoint: "/api/marine/edna/asvs",
    status: 200,
  });

  return NextResponse.json({
    asvs: rows,
    total,
    page,
    pageSize,
    summary,
  });
}
