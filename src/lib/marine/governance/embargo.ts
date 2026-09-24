/**
 * Marine Platform — data embargo & sovereignty service (governance feature F).
 *
 * Embargo/sovereignty flags apply to NEW marine records ONLY
 * (`MarineEmbargo` references `MarineRecord`). No existing table gains an
 * embargo concept and no existing read path is altered: consumers of marine
 * records call `visibleRecordFilter()` to obtain the Prisma `where` clause
 * that hides restricted records from users without `ADMIN` clearance.
 *
 * Semantics
 * ---------
 *  - "none"                    → visible to all marine users
 *  - "embargo"                 → hidden until `embargoUntil` (or forever if unset)
 *  - "sovereignty-restricted"  → hidden from non-admins; jurisdictions are
 *                                advisory metadata (see docs/MARINE_PLATFORM.md)
 */
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const EMBARGO_STATES = ["none", "embargo", "sovereignty-restricted"] as const;
export type EmbargoState = (typeof EMBARGO_STATES)[number];

/** Set (or replace) the embargo state of a marine record. */
export async function setEmbargo(input: {
  recordId: string;
  state: EmbargoState;
  reason?: string | null;
  jurisdictions?: string | null;
  embargoUntil?: Date | null;
  createdBy: string;
}) {
  if (!(EMBARGO_STATES as readonly string[]).includes(input.state)) {
    throw new Error(`Invalid embargo state: ${input.state}`);
  }
  const isRestricted = input.state !== "none";
  const row = await db.marineEmbargo.upsert({
    where: { recordId: input.recordId },
    create: {
      recordId: input.recordId,
      state: input.state,
      reason: input.reason ?? null,
      jurisdictions: input.jurisdictions ?? null,
      embargoUntil: input.embargoUntil ?? null,
      createdBy: input.createdBy,
    },
    update: {
      state: input.state,
      reason: input.reason ?? null,
      jurisdictions: input.jurisdictions ?? null,
      embargoUntil: input.embargoUntil ?? null,
    },
  });
  // Keep the fast-read mirror on MarineMetadata in sync (best-effort).
  await db.marineMetadata
    .updateMany({ where: { recordId: input.recordId }, data: { isEmbargoed: isRestricted } })
    .catch(() => undefined);
  await db.marineSearchIndex
    .updateMany({ where: { recordId: input.recordId }, data: { isEmbargoed: isRestricted } })
    .catch(() => undefined);
  return row;
}

/** True when a record's embargo window has fully elapsed. */
export function embargoExpired(embargo: { state: string; embargoUntil: Date | null }): boolean {
  if (embargo.state !== "embargo") return true;
  return embargo.embargoUntil !== null && embargo.embargoUntil.getTime() <= Date.now();
}

/**
 * Prisma `where` fragment restricting marine records to those the given role
 * may see. Admins bypass embargo restrictions (clearance role).
 */
export function visibleRecordFilter(role: string | undefined): Prisma.MarineRecordWhereInput {
  if (role === "ADMIN") return {};
  return {
    OR: [
      { embargo: { is: null } },
      { embargo: { state: "none" } },
      // embargo whose window already elapsed is treated as lifted
      { embargo: { state: "embargo", embargoUntil: { lte: new Date() } } },
    ],
  };
}
