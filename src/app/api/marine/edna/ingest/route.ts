import { NextResponse } from "next/server";
import { marineGuard, auditRequest } from "@/lib/marine/route-helpers";
import { ingestAsv, EDNA_DWC_MAPPING } from "@/lib/marine/edna/store";

export const runtime = "nodejs";

/**
 * POST /api/marine/edna/ingest
 *
 * Real eDNA ASV/OTU ingestion endpoint (paper Table II field mapping — see
 * EDNA_DWC_MAPPING). Accepts a single ASV record per call; idempotent per
 * asvId. Accepts only genuinely provided fields — nothing is derived or
 * defaulted beyond documented nulls.
 *
 * Body: { asvId, scientificName?, taxonRank?, targetGene?, sequence?,
 *         latitude?, longitude?, eventDate?, source?, sampleMeta? }
 */
export async function POST(req: Request) {
  const guard = await marineGuard("edna");
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const asvId = typeof body.asvId === "string" ? body.asvId.trim() : "";
  if (!asvId) {
    return NextResponse.json({ error: "asvId is required" }, { status: 422 });
  }
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;

  const lat = num(body.latitude);
  const lng = num(body.longitude);
  if (lat !== null && (lat < -90 || lat > 90)) {
    return NextResponse.json({ error: "latitude must be within [-90, 90]" }, { status: 422 });
  }
  if (lng !== null && (lng < -180 || lng > 180)) {
    return NextResponse.json({ error: "longitude must be within [-180, 180]" }, { status: 422 });
  }
  let eventDate: string | null = null;
  if (typeof body.eventDate === "string" && body.eventDate.trim()) {
    const d = new Date(body.eventDate);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "eventDate is not a valid date" }, { status: 422 });
    }
    eventDate = d.toISOString();
  }

  try {
    const asv = await ingestAsv({
      asvId,
      scientificName: typeof body.scientificName === "string" ? body.scientificName.trim() : null,
      taxonRank: typeof body.taxonRank === "string" ? body.taxonRank.trim() : null,
      targetGene: typeof body.targetGene === "string" ? body.targetGene.trim() : null,
      sequence: typeof body.sequence === "string" ? body.sequence.trim() : null,
      latitude: lat,
      longitude: lng,
      eventDate,
      source: typeof body.source === "string" ? body.source.trim() : null,
      sampleMeta: body.sampleMeta && typeof body.sampleMeta === "object" ? (body.sampleMeta as Record<string, unknown>) : null,
    });
    auditRequest({
      userId: guard.session.userId,
      action: "write",
      resource: "marine.edna.ingest",
      resourceId: asv.id,
      endpoint: "/api/marine/edna/ingest",
      status: 200,
    });
    return NextResponse.json({
      ok: true,
      asv,
      dwcMapping: EDNA_DWC_MAPPING,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ingest failed" },
      { status: 500 }
    );
  }
}
