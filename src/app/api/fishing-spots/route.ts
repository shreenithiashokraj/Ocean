import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/** Haversine distance in km between two lat/lng coordinates. */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // earth radius (km)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * GET /api/fishing-spots — list curated real-world harbor/port fishing spots.
 * These are real public coordinates (no fabricated fish-count data).
 * When `lat` and `lng` query params are provided, results are sorted by
 * nearest distance first and each spot includes `distanceKm`.
 *
 * Species field comes from the DB only (may be empty string). We do NOT
 * fabricate fish population/availability data — the client renders an
 * "unavailable" pill when species is empty.
 */
export async function GET(req: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const latParam = url.searchParams.get("lat");
  const lngParam = url.searchParams.get("lng");
  const hasRef =
    latParam !== null && lngParam !== null && latParam !== "" && lngParam !== "";
  const refLat = hasRef ? Number(latParam) : NaN;
  const refLng = hasRef ? Number(lngParam) : NaN;
  const refValid = hasRef && !Number.isNaN(refLat) && !Number.isNaN(refLng);

  const rows = await db.fishingSpot.findMany({
    orderBy: { createdAt: "asc" },
  });

  let spots = rows.map((r) => ({
    id: r.id,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    region: r.region ?? "",
    species: r.species ?? "",
    depthM: r.depthM,
    bottomType: r.bottomType ?? "",
    source: r.source,
    ...(refValid
      ? { distanceKm: haversineKm(refLat, refLng, r.latitude, r.longitude) }
      : {}),
  }));

  if (refValid) {
    spots = spots.sort(
      (a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0)
    );
  }

  return NextResponse.json({ spots });
}
