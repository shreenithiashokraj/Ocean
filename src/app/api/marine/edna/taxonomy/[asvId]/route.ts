import { NextResponse } from "next/server";
import { marineGuard, auditRequest } from "@/lib/marine/route-helpers";
import { assignTaxonomyWithFallback } from "@/lib/marine/edna/store";

export const runtime = "nodejs";

/**
 * POST /api/marine/edna/taxonomy/[asvId]
 *
 * Runs the Villon-style fallback assignment for one ASV against the reference
 * data that ACTUALLY exists (stored observed species labels). Returns the
 * honest lineage: species → genus → unresolved, with confidence present only
 * when a real similarity basis exists (never fabricated).
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ asvId: string }> }
) {
  const guard = await marineGuard("edna");
  if (!guard.ok) return guard.response;

  const { asvId } = await ctx.params;
  const result = await assignTaxonomyWithFallback(decodeURIComponent(asvId));
  if (!result) {
    return NextResponse.json({ error: "ASV not found" }, { status: 404 });
  }

  auditRequest({
    userId: guard.session.userId,
    action: "write",
    resource: "marine.edna.taxonomy",
    resourceId: result.asv.id,
    endpoint: "/api/marine/edna/taxonomy",
    status: 200,
  });

  return NextResponse.json({
    asv: result.asv,
    fallback: result.fallback,
    referenceCount: result.referenceCount,
    note:
      result.referenceCount === 0
        ? "No reference observations exist in this deployment — fallback cannot resolve beyond what was submitted."
        : `Fallback evaluated against ${result.referenceCount} distinct stored species labels.`,
  });
}
