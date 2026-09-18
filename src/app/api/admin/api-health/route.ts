import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/admin/api-health
 *
 * Computes a per-service health summary from the api_logs table. A service is:
 *   - "healthy"     if its most recent call in the last 24h succeeded (2xx)
 *   - "degraded"    if it has any 4xx/5xx in the last 24h but the most recent is 2xx,
 *                   OR the most recent failed but it's had success recently
 *   - "unavailable" if the most recent call failed, or no calls in 24h
 *
 * Never exposes secrets — only status codes, counts and timings.
 */
export async function GET() {
  const session = await requireRole("ADMIN");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = new Date(Date.now() - 24 * 3600 * 1000);

  // distinct services
  const services = await db.apiLog.findMany({
    where: { createdAt: { gte: since } },
    select: { service: true, status: true, durationMs: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  const byService = new Map<
    string,
    { total: number; errors: number; lastStatus: number | null; lastAt: Date | null; p95: number[] }
  >();
  for (const s of services) {
    const e = byService.get(s.service) ?? { total: 0, errors: 0, lastStatus: null, lastAt: null, p95: [] };
    e.total++;
    if (s.status >= 400) e.errors++;
    if (!e.lastAt || s.createdAt > e.lastAt) {
      e.lastAt = s.createdAt;
      e.lastStatus = s.status;
    }
    if (s.durationMs != null) e.p95.push(s.durationMs);
    byService.set(s.service, e);
  }

  const summary = Array.from(byService.entries()).map(([service, e]) => {
    const sorted = e.p95.sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : null;
    let health: "healthy" | "degraded" | "unavailable";
    if (e.lastStatus == null) {
      health = "unavailable";
    } else if (e.lastStatus < 400 && e.errors === 0) {
      health = "healthy";
    } else if (e.lastStatus < 400 && e.errors > 0) {
      health = "degraded";
    } else {
      health = "unavailable";
    }
    return {
      service,
      health,
      total: e.total,
      errors: e.errors,
      lastStatus: e.lastStatus,
      lastAt: e.lastAt ? e.lastAt.toISOString() : null,
      p95Ms: p95,
    };
  });

  const overall = summary.some((s) => s.health === "unavailable")
    ? "unavailable"
    : summary.some((s) => s.health === "degraded")
    ? "degraded"
    : "healthy";

  return NextResponse.json({ overall, services: summary });
}
