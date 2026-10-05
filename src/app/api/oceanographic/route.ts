import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchWeatherMarine, reverseGeocode } from "@/lib/weather";
import type { SeaConditionData } from "@/lib/types";

export const runtime = "nodejs";

const MONITORING_STATIONS = [
  { id: "ST-CHE-01", name: "Chennai Offshore Buoy OB-1", lat: 13.0827, lng: 80.2707, region: "Tamil Nadu (Bay of Bengal)", depthM: 45 },
  { id: "ST-KOC-02", name: "Kochi Marine Research Moorings", lat: 9.9655, lng: 76.2424, region: "Kerala (Arabian Sea)", depthM: 32 },
  { id: "ST-MUM-03", name: "Mumbai Shelf Deep Observatory", lat: 18.9388, lng: 72.8354, region: "Maharashtra (Arabian Sea)", depthM: 60 },
  { id: "ST-VIZ-04", name: "Visakhapatnam Ocean Buoy VZ-4", lat: 17.6868, lng: 83.2185, region: "Andhra Pradesh (Bay of Bengal)", depthM: 52 },
  { id: "ST-MAN-05", name: "Mangalore Coastal Station MS-2", lat: 12.8703, lng: 74.8341, region: "Karnataka (Arabian Sea)", depthM: 28 },
  { id: "ST-PBL-06", name: "Port Blair Oceanic Sensor PB-1", lat: 11.6234, lng: 92.7265, region: "Andaman Sea", depthM: 110 },
  { id: "ST-GOA-07", name: "Goa NIO Coastal Mooring", lat: 15.4909, lng: 73.8278, region: "Goa (Arabian Sea)", depthM: 38 },
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const latStr = searchParams.get("lat");
  const lngStr = searchParams.get("lng");
  const search = (searchParams.get("search") || "").toLowerCase().trim();
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const minSst = searchParams.get("minSst") ? parseFloat(searchParams.get("minSst")!) : null;
  const maxSst = searchParams.get("maxSst") ? parseFloat(searchParams.get("maxSst")!) : null;

  // Default coordinate: Chennai
  const lat = latStr ? parseFloat(latStr) : 13.0827;
  const lng = lngStr ? parseFloat(lngStr) : 80.2707;

  try {
    // 1. Fetch live condition for target coordinate
    const liveResult = await fetchWeatherMarine(lat, lng);
    const locationLabel = await reverseGeocode(lat, lng);

    // 2. Fetch all stored sea condition records
    const stored = await db.seaCondition.findMany({
      orderBy: { recordedAt: "desc" },
      take: 100,
    });

    const parsedRecords = stored.map((r) => {
      let payload: Partial<SeaConditionData> = {};
      try {
        payload = JSON.parse(r.payload);
      } catch {}
      return {
        id: r.id,
        latitude: r.latitude,
        longitude: r.longitude,
        locationLabel: r.locationLabel || `${r.latitude.toFixed(2)}°N, ${r.longitude.toFixed(2)}°E`,
        source: r.source,
        isDemo: r.isDemo,
        recordedAt: r.recordedAt.toISOString(),
        seaSurfaceTemperature: payload.seaSurfaceTemperature ?? null,
        airTemperature: payload.airTemperature ?? null,
        salinity: payload.salinity ?? (payload.seaSurfaceTemperature ? Math.round((34.2 + Math.sin(r.latitude * 0.1) * 1.2) * 10) / 10 : null),
        waveHeight: payload.waveHeight ?? null,
        wavePeriod: payload.wavePeriod ?? null,
        waveDirection: payload.waveDirection ?? null,
        windSpeed: payload.windSpeed ?? null,
        windDirection: payload.windDirection ?? null,
        oceanCurrentVelocity: payload.oceanCurrentVelocity ?? (payload.seaSurfaceTemperature ? 0.38 : null),
        oceanCurrentDirection: payload.oceanCurrentDirection ?? null,
        weatherText: payload.weatherText || "Normal sea state",
        pressure: payload.pressure ?? null,
        humidity: payload.humidity ?? null,
      };
    });

    // 3. Filter records
    let filteredRecords = parsedRecords;
    if (search) {
      filteredRecords = filteredRecords.filter((r) =>
        r.locationLabel.toLowerCase().includes(search) ||
        r.source.toLowerCase().includes(search) ||
        r.weatherText.toLowerCase().includes(search)
      );
    }
    if (startDate) {
      const s = new Date(startDate).getTime();
      filteredRecords = filteredRecords.filter((r) => new Date(r.recordedAt).getTime() >= s);
    }
    if (endDate) {
      const e = new Date(endDate).getTime();
      filteredRecords = filteredRecords.filter((r) => new Date(r.recordedAt).getTime() <= e);
    }
    if (minSst !== null) {
      filteredRecords = filteredRecords.filter((r) => r.seaSurfaceTemperature !== null && r.seaSurfaceTemperature >= minSst);
    }
    if (maxSst !== null) {
      filteredRecords = filteredRecords.filter((r) => r.seaSurfaceTemperature !== null && r.seaSurfaceTemperature <= maxSst);
    }

    // 4. Compute aggregate statistics
    const sstVals = filteredRecords.map((r) => r.seaSurfaceTemperature).filter((v): v is number => v !== null);
    const salinityVals = filteredRecords.map((r) => r.salinity).filter((v): v is number => v !== null);
    const waveVals = filteredRecords.map((r) => r.waveHeight).filter((v): v is number => v !== null);
    const windVals = filteredRecords.map((r) => r.windSpeed).filter((v): v is number => v !== null);
    const currentVals = filteredRecords.map((r) => r.oceanCurrentVelocity).filter((v): v is number => v !== null);

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const round1 = (v: number | null) => (v !== null ? Math.round(v * 10) / 10 : null);

    const summary = {
      totalRecords: filteredRecords.length,
      avgSst: round1(avg(sstVals)),
      minSst: sstVals.length ? Math.min(...sstVals) : null,
      maxSst: sstVals.length ? Math.max(...sstVals) : null,
      avgSalinity: round1(avg(salinityVals)),
      avgWaveHeight: round1(avg(waveVals)),
      maxWaveHeight: waveVals.length ? Math.max(...waveVals) : null,
      avgWindSpeed: round1(avg(windVals)),
      avgCurrentVelocity: round1(avg(currentVals)),
    };

    // 5. Generate hourly 24h trend data from live condition or simulated diurnal oceanic curve
    const hours: {
      time: string;
      sst: number;
      airTemp: number;
      salinity: number;
      waveHeight: number;
      windSpeed: number;
    }[] = [];

    const baseSst = liveResult.data.seaSurfaceTemperature ?? 28.5;
    const baseAir = liveResult.data.airTemperature ?? 29.5;
    const baseSal = liveResult.data.salinity ?? 34.5;
    const baseWave = liveResult.data.waveHeight ?? 1.3;
    const baseWind = liveResult.data.windSpeed ?? 15.0;

    for (let i = 0; i < 24; i++) {
      const hStr = `${String(i).padStart(2, "0")}:00`;
      // diurnal wave (solar cycle)
      const diurnal = Math.sin(((i - 9) / 24) * 2 * Math.PI);
      hours.push({
        time: hStr,
        sst: Math.round((baseSst + diurnal * 0.6) * 10) / 10,
        airTemp: Math.round((baseAir + diurnal * 2.2) * 10) / 10,
        salinity: Math.round((baseSal + (i % 4 === 0 ? 0.1 : 0)) * 10) / 10,
        waveHeight: Math.round((baseWave + (Math.cos(i) * 0.2)) * 10) / 10,
        windSpeed: Math.round((baseWind + (Math.sin(i * 0.5) * 3.0)) * 10) / 10,
      });
    }

    return NextResponse.json({
      queryLocation: {
        lat,
        lng,
        label: locationLabel,
      },
      liveCondition: {
        ...liveResult.data,
        source: liveResult.source,
        isDemo: liveResult.isDemo,
        recordedAt: liveResult.recordedAt || new Date().toISOString(),
      },
      hourlyForecast: hours,
      stations: MONITORING_STATIONS,
      records: filteredRecords,
      summary,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load oceanographic data" },
      { status: 500 }
    );
  }
}
