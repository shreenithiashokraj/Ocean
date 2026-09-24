import { NextResponse } from "next/server";
import { marineGuard } from "@/lib/marine/route-helpers";
import { DATASETS } from "@/lib/marine/exports/datasets";

export const runtime = "nodejs";

/**
 * GET /api/marine/exports/datasets
 * Lists the exportable datasets (single source of truth for the UI picker).
 */
export async function GET() {
  const guard = await marineGuard("exports");
  if (!guard.ok) return guard.response;
  return NextResponse.json({ datasets: DATASETS });
}
