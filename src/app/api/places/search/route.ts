import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { forwardGeocode } from "@/lib/weather";

/**
 * GET /api/places/search?q=<query>
 *
 * Forward-geocodes a place name using Open-Meteo's geocoding API and returns
 * up to 6 candidate matches for the location-search dropdown in the
 * Sea Conditions view.
 *
 * Returns `{ results: [{ name, lat, lng, country?, region? }] }`.
 * Authenticated users only (all roles).
 */
export const runtime = "nodejs";

const MAX_QUERY_LENGTH = 100;

export async function GET(req: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized — sign in to search places." },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (!q) {
    return NextResponse.json({ results: [] });
  }
  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { error: `Query too long (max ${MAX_QUERY_LENGTH} characters).` },
      { status: 400 }
    );
  }

  const results = await forwardGeocode(q);
  return NextResponse.json({ results });
}
