import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

const ALLOWED_TEMP_UNITS = ["celsius", "fahrenheit"];
const ALLOWED_WIND_UNITS = ["kmh", "ms", "knots"];
const ALLOWED_LANGS = ["en", "es", "fr", "ta", "hi", "bn"];

/** GET /api/profile — current user's profile + preferences. */
export async function GET() {
  const session = await requireUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.userProfile.upsert({
    where: { userId: session.sub },
    update: {},
    create: { userId: session.sub },
  });

  return NextResponse.json({
    profile: {
      name: session.name,
      email: session.email,
      role: session.role,
      phone: profile.phone,
      country: profile.country,
      vesselName: profile.vesselName,
      licenseNumber: profile.licenseNumber,
      avatarUrl: profile.avatarUrl,
      preferredLocationName: profile.preferredLocationName,
      preferredLat: profile.preferredLat,
      preferredLng: profile.preferredLng,
      language: profile.language,
      temperatureUnit: profile.temperatureUnit,
      windUnit: profile.windUnit,
      notifAlerts: profile.notifAlerts,
      notifSummary: profile.notifSummary,
    },
  });
}

/**
 * PATCH /api/profile — update current user's profile + preferences.
 * Backend enforces ownership (only session.sub's own row). Validated.
 */
export async function PATCH(req: Request) {
  const session = await requireUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // allow name update too (it lives on User, not UserProfile)
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (name !== undefined && name.length < 2) {
    return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 422 });
  }

  const data: Record<string, unknown> = {};
  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.slice(0, max) : undefined;
  const phone = str(body.phone, 40);
  if (phone !== undefined) data.phone = phone || null;
  const country = str(body.country, 80);
  if (country !== undefined) data.country = country || null;
  const vesselName = str(body.vesselName, 120);
  if (vesselName !== undefined) data.vesselName = vesselName || null;
  const licenseNumber = str(body.licenseNumber, 80);
  if (licenseNumber !== undefined) data.licenseNumber = licenseNumber || null;
  const preferredLocationName = str(body.preferredLocationName, 120);
  if (preferredLocationName !== undefined) data.preferredLocationName = preferredLocationName || null;

  // numeric prefs
  if (body.preferredLat != null) {
    const lat = Number(body.preferredLat);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return NextResponse.json({ error: "Invalid preferred latitude" }, { status: 422 });
    }
    data.preferredLat = lat;
  }
  if (body.preferredLng != null) {
    const lng = Number(body.preferredLng);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return NextResponse.json({ error: "Invalid preferred longitude" }, { status: 422 });
    }
    data.preferredLng = lng;
  }
  // enums
  if (body.temperatureUnit != null) {
    const u = String(body.temperatureUnit);
    if (!ALLOWED_TEMP_UNITS.includes(u)) {
      return NextResponse.json({ error: "Invalid temperature unit" }, { status: 422 });
    }
    data.temperatureUnit = u;
  }
  if (body.windUnit != null) {
    const u = String(body.windUnit);
    if (!ALLOWED_WIND_UNITS.includes(u)) {
      return NextResponse.json({ error: "Invalid wind unit" }, { status: 422 });
    }
    data.windUnit = u;
  }
  if (body.language != null) {
    const u = String(body.language);
    if (!ALLOWED_LANGS.includes(u)) {
      return NextResponse.json({ error: "Invalid language" }, { status: 422 });
    }
    data.language = u;
  }
  // booleans
  if (body.notifAlerts != null) data.notifAlerts = Boolean(body.notifAlerts);
  if (body.notifSummary != null) data.notifSummary = Boolean(body.notifSummary);

  // persist profile (owned by session.sub)
  const profile = await db.userProfile.upsert({
    where: { userId: session.sub },
    update: data,
    create: { userId: session.sub, ...data },
  });

  // name lives on User
  if (name !== undefined && name !== session.name) {
    await db.user.update({ where: { id: session.sub }, data: { name } });
  }

  return NextResponse.json({
    ok: true,
    profile: {
      name: name ?? session.name,
      email: session.email,
      role: session.role,
      phone: profile.phone,
      country: profile.country,
      vesselName: profile.vesselName,
      licenseNumber: profile.licenseNumber,
      preferredLocationName: profile.preferredLocationName,
      preferredLat: profile.preferredLat,
      preferredLng: profile.preferredLng,
      language: profile.language,
      temperatureUnit: profile.temperatureUnit,
      windUnit: profile.windUnit,
      notifAlerts: profile.notifAlerts,
      notifSummary: profile.notifSummary,
    },
  });
}
