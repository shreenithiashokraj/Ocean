/* eslint-disable @typescript-eslint/no-require-imports */
// Seed script: creates demo accounts, default alert thresholds, system settings,
// and a curated set of real-world fishing spots (well-known harbors/ports).
// Run with: bun run db:seed

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const db = new PrismaClient();

async function main() {
  console.log("Seeding Fisherman Module…");

  const passwordHash = await bcrypt.hash("Fisher@123", 10);

  // ── Users ──────────────────────────────────────────────
  const admin = await db.user.upsert({
    where: { email: "admin@fisherman.dev" },
    update: {},
    create: {
      email: "admin@fisherman.dev",
      name: "Administrator",
      role: "ADMIN",
      passwordHash: await bcrypt.hash("Admin@123", 10),
      isActive: true,
      profile: { create: { country: "Global" } },
    },
  });

  const researcher = await db.user.upsert({
    where: { email: "researcher@fisherman.dev" },
    update: {},
    create: {
      email: "researcher@fisherman.dev",
      name: "Dr. Marina Reed",
      role: "RESEARCHER",
      passwordHash: await bcrypt.hash("Research@123", 10),
      isActive: true,
      profile: { create: { country: "India" } },
    },
  });

  const fisher = await db.user.upsert({
    where: { email: "fisher@fisherman.dev" },
    update: {},
    create: {
      email: "fisher@fisherman.dev",
      name: "Coastal Fisher",
      role: "FISHERMAN",
      passwordHash: passwordHash,
      isActive: true,
      profile: { create: { country: "India", vesselName: "Sea Star", licenseNumber: "FM-2024-0193" } },
    },
  });

  console.log("Users:", { admin: admin.email, researcher: researcher.email, fisher: fisher.email });

  // ── Default alert thresholds (configurable by admin later) ──
  const thresholds = [
    { metric: "windSpeedKmh", caution: 25, high: 40, critical: 60, unit: "km/h" },
    { metric: "windGustsKmh", caution: 35, high: 55, critical: 75, unit: "km/h" },
    { metric: "waveHeightM", caution: 1.5, high: 2.5, critical: 4, unit: "m" },
    { metric: "precipitationMm", caution: 5, high: 15, critical: 30, unit: "mm" },
    { metric: "visibilityM", caution: 5000, high: 2000, critical: 1000, unit: "m" },
    { metric: "pressureHpa", caution: 1005, high: 1000, critical: 990, unit: "hPa" },
  ];
  for (const t of thresholds) {
    await db.alertThreshold.upsert({
      where: { metric: t.metric },
      update: {},
      create: t,
    });
  }
  console.log(`Seeded ${thresholds.length} alert thresholds`);

  // ── System settings ───────────────────────────────────
  const settings = [
    { key: "appName", value: "Fisherman Module", category: "branding" },
    { key: "defaultRefreshMinutes", value: "15", category: "general" },
    { key: "weatherProvider", value: "open-meteo", category: "api" },
    { key: "marineProvider", value: "open-meteo", category: "api" },
    { key: "fishAnalysisProvider", value: "z-ai-vlm", category: "api" },
    { key: "mapProvider", value: "openstreetmap", category: "api" },
    { key: "enableNotifications", value: "true", category: "general" },
    { key: "showDemoDataWhenOffline", value: "true", category: "general" },
  ];
  for (const s of settings) {
    await db.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }
  console.log(`Seeded ${settings.length} system settings`);

  // ── Curated real-world fishing spots (well-known ports/harbors) ──
  // Sources: public harbor/port coordinates. No fabricated fish-population data.
  const spots = [
    { name: "Chennai Fishing Harbour", latitude: 13.0827, longitude: 80.2707, region: "Tamil Nadu, India", source: "OpenStreetMap", species: "", depthM: null, bottomType: "sand" },
    { name: "Kochi Marine Drive", latitude: 9.9655, longitude: 76.2424, region: "Kerala, India", source: "OpenStreetMap", species: "", depthM: null, bottomType: "mud" },
    { name: "Mumbai Sassoon Dock", latitude: 18.9388, longitude: 72.8354, region: "Maharashtra, India", source: "OpenStreetMap", species: "", depthM: null, bottomType: "mud" },
    { name: "Visakhapatnam Fishing Harbour", latitude: 17.6868, longitude: 83.2185, region: "Andhra Pradesh, India", source: "OpenStreetMap", species: "", depthM: null, bottomType: "sand" },
    { name: "Mangalore Old Port", latitude: 12.8703, longitude: 74.8341, region: "Karnataka, India", source: "OpenStreetMap", species: "", depthM: null, bottomType: "sand" },
  ];
  for (const s of spots) {
    const existing = await db.fishingSpot.findFirst({ where: { name: s.name, source: s.source } });
    if (!existing) await db.fishingSpot.create({ data: s });
  }
  console.log(`Seeded ${spots.length} fishing spots`);

  // ── A demo sea-condition record + a couple of notifications for the fisher ──
  await db.seaCondition.create({
    data: {
      userId: null,
      latitude: 13.0827,
      longitude: 80.2707,
      locationLabel: "Chennai, India (demo)",
      source: "open-meteo",
      isDemo: true,
      payload: JSON.stringify({
        weatherText: "Partly cloudy (demo)",
        airTemperature: 30,
        windSpeed: 14,
        windDirection: 90,
        waveHeight: 1.2,
        wavePeriod: 6,
        humidity: 72,
      }),
    },
  }).catch(() => {});

  await db.notification.create({
    data: {
      userId: fisher.id,
      title: "Welcome aboard",
      message: "Your Fisherman Module account is ready. Enable location to view live sea conditions.",
      type: "success",
    },
  }).catch(() => {});

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
