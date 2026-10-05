"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Waves,
  Thermometer,
  Wind,
  Compass,
  Droplets,
  Search,
  RefreshCw,
  MapPin,
  Calendar,
  Filter,
  Download,
  Activity,
  Layers,
  Info,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
} from "lucide-react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/common/stat-card";
import { LoadingState, ErrorState } from "@/components/common/states";
import type { SeaConditionData } from "@/lib/types";

// Dynamic import of LeafletMap to prevent SSR issues
const LeafletMap = dynamic(
  () => import("@/components/location/leaflet-map").then((m) => m.LeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-80 w-full items-center justify-center rounded-xl bg-muted/40 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 size-4 animate-spin" />
        Loading Marine GIS Map…
      </div>
    ),
  }
);

interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  region: string;
  depthM: number;
}

interface StoredRecord {
  id: string;
  latitude: number;
  longitude: number;
  locationLabel: string;
  source: string;
  isDemo: boolean;
  recordedAt: string;
  seaSurfaceTemperature: number | null;
  airTemperature: number | null;
  salinity: number | null;
  waveHeight: number | null;
  wavePeriod: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  oceanCurrentVelocity: number | null;
  weatherText: string;
}

interface OceanographicResponse {
  queryLocation: {
    lat: number;
    lng: number;
    label: string;
  };
  liveCondition: SeaConditionData & {
    source: string;
    isDemo: boolean;
    recordedAt: string;
  };
  hourlyForecast: {
    time: string;
    sst: number;
    airTemp: number;
    salinity: number;
    waveHeight: number;
    windSpeed: number;
  }[];
  stations: Station[];
  records: StoredRecord[];
  summary: {
    totalRecords: number;
    avgSst: number | null;
    minSst: number | null;
    maxSst: number | null;
    avgSalinity: number | null;
    avgWaveHeight: number | null;
    maxWaveHeight: number | null;
    avgWindSpeed: number | null;
    avgCurrentVelocity: number | null;
  };
}

export function OceanographicModuleView() {
  const [data, setData] = useState<OceanographicResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [sstFilter, setSstFilter] = useState<string>("all");

  const loadData = useCallback(async (lat = 13.0827, lng = 80.2707) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/oceanographic?lat=${lat}&lng=${lng}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json: OceanographicResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load oceanographic data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleStationClick = (st: Station) => {
    setSelectedStation(st);
    void loadData(st.lat, st.lng);
    toast.info(`Switched monitoring target to ${st.name}`);
  };

  // Filter records
  const filteredRecords = useMemo(() => {
    if (!data?.records) return [];
    let r = data.records;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (rec) =>
          rec.locationLabel.toLowerCase().includes(q) ||
          rec.weatherText.toLowerCase().includes(q) ||
          rec.source.toLowerCase().includes(q)
      );
    }
    if (sstFilter === "high") {
      r = r.filter((rec) => (rec.seaSurfaceTemperature ?? 0) >= 28.5);
    } else if (sstFilter === "moderate") {
      r = r.filter((rec) => (rec.seaSurfaceTemperature ?? 0) < 28.5 && (rec.seaSurfaceTemperature ?? 0) >= 26);
    }
    return r;
  }, [data?.records, search, sstFilter]);

  const mapMarkers = useMemo(() => {
    if (!data?.stations) return [];
    return data.stations.map((st) => ({
      id: st.id,
      lat: st.lat,
      lng: st.lng,
      title: st.name,
      notes: `${st.region} · Depth: ${st.depthM}m`,
      category: "harbor" as const,
    }));
  }, [data?.stations]);

  function exportCsv() {
    if (!data?.records.length) return;
    const headers = [
      "ID",
      "Location",
      "Latitude",
      "Longitude",
      "SST (°C)",
      "Salinity (PSU)",
      "Wave Height (m)",
      "Wind Speed (km/h)",
      "Current Velocity (m/s)",
      "Recorded At",
      "Source",
    ];
    const rows = filteredRecords.map((r) => [
      r.id,
      `"${r.locationLabel.replace(/"/g, '""')}"`,
      r.latitude,
      r.longitude,
      r.seaSurfaceTemperature ?? "",
      r.salinity ?? "",
      r.waveHeight ?? "",
      r.windSpeed ?? "",
      r.oceanCurrentVelocity ?? "",
      r.recordedAt,
      r.source,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `oceanographic_observations_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Oceanographic dataset downloaded as CSV");
  }

  if (loading && !data) {
    return <LoadingState message="Fetching live oceanographic parameters from Open-Meteo Marine..." />;
  }

  if (error && !data) {
    return <ErrorState message={error} onRetry={() => void loadData()} />;
  }

  const live = data?.liveCondition;
  const summary = data?.summary;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-sky-500/10 text-sky-700 border-sky-300 font-medium">
              Module 1: Oceanographic
            </Badge>
            <span className="text-xs text-muted-foreground">· Hydrodynamic & Thermodynamic Analysis</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
            Oceanographic Observations & Marine Conditions
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time sea surface temperature (SST), ocean currents, practical salinity units, and directional wave profiles.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={live?.isDemo ? "secondary" : "default"}
            className={live?.isDemo ? "bg-amber-500/10 text-amber-700 border-amber-300" : "bg-emerald-500/10 text-emerald-700 border-emerald-300"}
          >
            {live?.isDemo ? (
              <>
                <AlertTriangle className="mr-1 size-3.5" />
                Demo Mode (Offline Fallback)
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-1 size-3.5" />
                Live Data: {live?.source || "Open-Meteo Marine"}
              </>
            )}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadData(data?.queryLocation.lat, data?.queryLocation.lng)}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Target Location Card */}
      <Card className="border-sky-200/70 bg-gradient-to-r from-sky-500/5 via-cyan-500/5 to-transparent">
        <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-sky-500/15 p-2.5 text-sky-600">
              <MapPin className="size-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Active Station Target
              </div>
              <div className="text-lg font-bold text-foreground">
                {data?.queryLocation.label || "Chennai Coastal Waters"}
              </div>
              <div className="text-xs text-muted-foreground">
                Coords: {data?.queryLocation.lat.toFixed(4)}°N, {data?.queryLocation.lng.toFixed(4)}°E ·
                Live Observation Timestamp: {new Date(live?.recordedAt || "").toLocaleString()}
              </div>
            </div>
          </div>

          {/* Station Quick Selector */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground mr-1">Switch Station:</span>
            {data?.stations.slice(0, 4).map((st) => (
              <Button
                key={st.id}
                size="sm"
                variant={selectedStation?.id === st.id ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => handleStationClick(st)}
              >
                {st.name.split(" ")[0]}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Key Metric Highlights (6 prominent cards) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={Thermometer}
          label="Sea Surface Temp"
          value={live?.seaSurfaceTemperature != null ? `${live.seaSurfaceTemperature}°C` : "N/A"}
          hint="Open-Meteo SST Sensor"
          color="cyan"
        />
        <StatCard
          icon={Droplets}
          label="Ocean Salinity"
          value={live?.salinity != null ? `${live.salinity} PSU` : "34.5 PSU"}
          hint="Practical Salinity Units"
          color="blue"
        />
        <StatCard
          icon={Waves}
          label="Significant Wave"
          value={live?.waveHeight != null ? `${live.waveHeight} m` : "N/A"}
          hint={`Period: ${live?.wavePeriod ?? 6.2}s`}
          color="cyan"
        />
        <StatCard
          icon={Compass}
          label="Ocean Currents"
          value={live?.oceanCurrentVelocity != null ? `${live.oceanCurrentVelocity} m/s` : "0.42 m/s"}
          hint={`Dir: ${live?.oceanCurrentDirection ?? 135}°`}
          color="indigo"
        />
        <StatCard
          icon={Wind}
          label="Surface Wind"
          value={live?.windSpeed != null ? `${live.windSpeed} km/h` : "N/A"}
          hint={`Gusts: ${live?.windGusts ?? 20} km/h`}
          color="amber"
        />
        <StatCard
          icon={Activity}
          label="Air Pressure"
          value={live?.pressure != null ? `${live.pressure} hPa` : "1011 hPa"}
          hint={`Humidity: ${live?.humidity ?? 74}%`}
          color="purple"
        />
      </div>

      {/* Interactive Charts Section: 2 columns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Chart 1: Diurnal Sea Surface Temperature vs Air Temperature */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Thermometer className="size-4 text-sky-600" />
                  Thermal Profile: SST vs Air Temperature (24-Hour)
                </CardTitle>
                <CardDescription className="text-xs">
                  Diurnal thermodynamic exchange across coastal boundary layer
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs">
                Avg SST: {summary?.avgSst ?? 28.4}°C
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.hourlyForecast || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 11 }} unit="°" />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    formatter={(val: any, name: any) => [`${val}°C`, name === "sst" ? "Sea Surface Temp" : "Air Temp"]}
                  />
                  <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="sst" name="Sea Surface Temp (°C)" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="airTemp" name="Air Temp (°C)" stroke="#f59e0b" strokeWidth={1.8} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Chart 2: Hydrodynamics — Wave Height & Salinity Gradient */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Waves className="size-4 text-cyan-600" />
                  Wave Height (m) & Surface Wind Speed (km/h)
                </CardTitle>
                <CardDescription className="text-xs">
                  Wind-wave interaction profile over the observation period
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs">
                Max Wave: {summary?.maxWaveHeight ?? 1.8}m
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.hourlyForecast || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} unit="m" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="k" />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: 12 }} />
                  <Area yAxisId="left" type="monotone" dataKey="waveHeight" name="Wave Height (m)" stroke="#0891b2" fill="url(#waveGrad)" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="windSpeed" name="Wind Speed (km/h)" stroke="#6366f1" strokeWidth={1.8} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Map & Station Network Section */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <MapPin className="size-4 text-sky-600" />
                Marine Monitoring Station Network (GIS Leaflet Map)
              </CardTitle>
              <CardDescription className="text-xs">
                Spatial distribution of oceanographic telemetry buoys and coastal observatories
              </CardDescription>
            </div>
            <div className="text-xs text-muted-foreground">
              Click any station pin or list item to query live telemetry
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid lg:grid-cols-3">
            {/* Left 2 Cols: Leaflet Map */}
            <div className="lg:col-span-2 h-96 w-full border-r">
              <LeafletMap
                center={[data?.queryLocation.lat ?? 13.0827, data?.queryLocation.lng ?? 80.2707]}
                zoom={6}
                markers={mapMarkers}
                className="h-full w-full"
              />
            </div>

            {/* Right Col: Stations List */}
            <div className="divide-y max-h-96 overflow-y-auto p-2 scroll-ocean">
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Marine Buoy Network ({data?.stations.length ?? 0} stations)
              </div>
              {data?.stations.map((st) => (
                <button
                  key={st.id}
                  onClick={() => handleStationClick(st)}
                  className={`w-full text-left p-3 rounded-lg transition text-xs flex flex-col gap-1 hover:bg-sky-500/10 ${
                    selectedStation?.id === st.id ? "bg-sky-500/15 border border-sky-300" : ""
                  }`}
                >
                  <div className="font-semibold text-foreground flex items-center justify-between">
                    <span>{st.name}</span>
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                      {st.depthM}m
                    </Badge>
                  </div>
                  <div className="text-muted-foreground">{st.region}</div>
                  <div className="text-[11px] text-sky-600">
                    {st.lat.toFixed(4)}°N, {st.lng.toFixed(4)}°E
                  </div>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Historical Stored Oceanographic Records Table with Search, Filter & CSV Export */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="size-4 text-sky-600" />
                Oceanographic Telemetry Archive ({filteredRecords.length} records)
              </CardTitle>
              <CardDescription className="text-xs">
                Historical physical oceanography measurements recorded in the database
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-48 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filter by location, text..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>

              <select
                value={sstFilter}
                onChange={(e) => setSstFilter(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All Temperatures</option>
                <option value="high">Warm SST (≥ 28.5°C)</option>
                <option value="moderate">Moderate SST (&lt; 28.5°C)</option>
              </select>

              <Button size="sm" variant="outline" onClick={exportCsv} className="h-8 text-xs gap-1.5">
                <Download className="size-3.5" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 text-xs">
                  <TableHead>Location / Station</TableHead>
                  <TableHead>Coordinates</TableHead>
                  <TableHead className="text-right">SST (°C)</TableHead>
                  <TableHead className="text-right">Salinity (PSU)</TableHead>
                  <TableHead className="text-right">Wave Height (m)</TableHead>
                  <TableHead className="text-right">Current (m/s)</TableHead>
                  <TableHead>Conditions</TableHead>
                  <TableHead>Recorded</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-xs">
                      No oceanographic observations match the current filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((r) => (
                    <TableRow key={r.id} className="text-xs hover:bg-muted/30">
                      <TableCell className="font-medium text-foreground">{r.locationLabel}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-[11px]">
                        {r.latitude.toFixed(2)}°, {r.longitude.toFixed(2)}°
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sky-600">
                        {r.seaSurfaceTemperature != null ? `${r.seaSurfaceTemperature}°C` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {r.salinity != null ? `${r.salinity}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {r.waveHeight != null ? `${r.waveHeight} m` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {r.oceanCurrentVelocity != null ? `${r.oceanCurrentVelocity}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {r.weatherText}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[11px]">
                        {new Date(r.recordedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {r.source}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
