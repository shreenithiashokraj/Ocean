"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  Compass,
  Crosshair,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Pin,
  Plus,
  Save,
  Search,
  Ship,
  Star,
  Trash2,
} from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Unavailable,
} from "@/components/common/states";

// Lazy-mount the Leaflet map (ssr:false) so Leaflet only ever runs in the browser.
const LeafletMap = dynamic(
  () => import("@/components/location/leaflet-map").then((m) => m.LeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[400px] w-full items-center justify-center bg-muted/30 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading map…
      </div>
    ),
  }
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface SavedLocationDTO {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  notes: string;
  category: string;
  createdAt: string;
}

interface FishingSpotDTO {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  region: string;
  species: string;
  depthM: number | null;
  bottomType: string;
  source: string;
  distanceKm?: number;
}

interface PlaceResult {
  name: string;
  lat: number;
  lng: number;
  country?: string;
  region?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

const CATEGORY_LABELS: Record<string, string> = {
  fishing: "Fishing",
  harbor: "Harbor",
  home: "Home",
  waypoint: "Waypoint",
};

const CATEGORY_COLOR: Record<string, string> = {
  fishing: "#22c55e",
  harbor: "#0ea5e9",
  home: "#a855f7",
  waypoint: "#f97316",
};

// ── Main view ─────────────────────────────────────────────────────────────────

export function LocationNavigationView() {
  // Geolocation
  const [userLoc, setUserLoc] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoDenied, setGeoDenied] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");

  // Search
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchPin, setSearchPin] = useState<{
    lat: number;
    lng: number;
    title: string;
  } | null>(null);

  // Map click → temporary point to save
  const [clickPoint, setClickPoint] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Saved locations
  const [saved, setSaved] = useState<SavedLocationDTO[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);

  // Fishing spots
  const [spots, setSpots] = useState<FishingSpotDTO[]>([]);
  const [spotsLoading, setSpotsLoading] = useState(false);
  const [spotsError, setSpotsError] = useState<string | null>(null);
  const [spotsLoaded, setSpotsLoaded] = useState(false);

  // Save dialog
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveCategory, setSaveCategory] = useState<string>("fishing");
  const [saveNotes, setSaveNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [pendingDelete, setPendingDelete] = useState<SavedLocationDTO | null>(
    null
  );

  // Map markers/popup registry
  const [focusTarget, setFocusTarget] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
  } | null>(null);

  // ── Data fetchers ──────────────────────────────────────────────────────────

  const loadSaved = useCallback(async () => {
    setSavedLoading(true);
    setSavedError(null);
    try {
      const r = (await api.listSavedLocations()) as { locations: unknown[] };
      setSaved(r.locations as SavedLocationDTO[]);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load saved locations";
      setSavedError(msg);
    } finally {
      setSavedLoading(false);
    }
  }, []);

  const loadSpots = useCallback(
    async (lat?: number, lng?: number) => {
      setSpotsLoading(true);
      setSpotsError(null);
      try {
        const r = (await api.listFishingSpots(lat, lng)) as {
          spots: unknown[];
        };
        setSpots(r.spots as FishingSpotDTO[]);
        setSpotsLoaded(true);
      } catch (e) {
        const msg =
          e instanceof ApiError ? e.message : "Failed to load fishing spots";
        setSpotsError(msg);
      } finally {
        setSpotsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  // When the user's location becomes available, fetch spots sorted by distance.
  useEffect(() => {
    if (userLoc) loadSpots(userLoc.lat, userLoc.lng);
    else loadSpots();
  }, [userLoc?.lat, userLoc?.lng, loadSpots, userLoc]);

  // ── Geolocation ────────────────────────────────────────────────────────────

  const locateMe = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      setGeoDenied(true);
      return;
    }
    setLocating(true);
    setGeoDenied(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setFocusTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 13 });
        setLocating(false);
        toast.success("Location updated");
      },
      (err) => {
        setLocating(false);
        setGeoDenied(true);
        if (err.code === err.PERMISSION_DENIED) {
          toast.error("Location permission denied", {
            description: "Enter coordinates manually below.",
          });
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          toast.error("Position unavailable", {
            description: "Try entering coordinates manually.",
          });
        } else if (err.code === err.TIMEOUT) {
          toast.error("Location request timed out");
        } else {
          toast.error("Could not get your location");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }, []);

  const applyManualLocation = useCallback(() => {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      toast.error("Latitude must be a number between -90 and 90");
      return;
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      toast.error("Longitude must be a number between -180 and 180");
      return;
    }
    setUserLoc({ lat, lng });
    setFocusTarget({ lat, lng, zoom: 12 });
    toast.success("Manual location applied");
  }, [manualLat, manualLng]);

  // ── Search ──────────────────────────────────────────────────────────────────

  const runSearch = useCallback(async () => {
    const q = searchQ.trim();
    if (q.length < 2) {
      toast.error("Enter a search term with at least 2 characters");
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const r = (await api.searchPlaces(q)) as { results: unknown[] };
      const parsed = (r.results as PlaceResult[]).filter(
        (x) => typeof x?.lat === "number" && typeof x?.lng === "number"
      );
      setSearchResults(parsed);
      if (parsed.length === 0) {
        toast.info("No places found", { description: "Try a different search term." });
      }
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      const msg =
        e instanceof ApiError
          ? e.message
          : "Search failed — place search service is unavailable";
      setSearchError(msg);
      if (status === 404) {
        toast.warning("Place search is offline", {
          description:
            "The /api/places/search endpoint is not deployed. Use 'Use my location' or click the map to pick a point.",
        });
      } else {
        toast.error(msg);
      }
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQ]);

  const pickSearchResult = useCallback((p: PlaceResult) => {
    setSearchPin({ lat: p.lat, lng: p.lng, title: p.name });
    setFocusTarget({ lat: p.lat, lng: p.lng, zoom: 12 });
    toast.success(`Selected: ${p.name}`);
  }, []);

  // ── Save flow ───────────────────────────────────────────────────────────────

  const openSaveDialog = useCallback(() => {
    const target =
      clickPoint ??
      (searchPin
        ? { lat: searchPin.lat, lng: searchPin.lng }
        : userLoc
        ? { lat: userLoc.lat, lng: userLoc.lng }
        : null);
    if (!target) {
      toast.error("No location selected", {
        description:
          "Use 'Use my location', search, or click the map first.",
      });
      return;
    }
    setSaveName("");
    setSaveCategory("fishing");
    setSaveNotes("");
    setSaveOpen(true);
  }, [clickPoint, searchPin, userLoc]);

  const saveTargetCoords = useMemo(() => {
    if (clickPoint) return clickPoint;
    if (searchPin) return { lat: searchPin.lat, lng: searchPin.lng };
    if (userLoc) return { lat: userLoc.lat, lng: userLoc.lng };
    return null;
  }, [clickPoint, searchPin, userLoc]);

  const confirmSave = useCallback(async () => {
    if (!saveTargetCoords) return;
    const name = saveName.trim();
    if (name.length < 2) {
      toast.error("Name must be at least 2 characters");
      return;
    }
    setSaving(true);
    try {
      await api.saveLocation({
        name,
        lat: saveTargetCoords.lat,
        lng: saveTargetCoords.lng,
        notes: saveNotes.trim() || undefined,
        category: saveCategory,
      });
      toast.success("Location saved");
      setSaveOpen(false);
      setClickPoint(null);
      await loadSaved();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to save location";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [saveTargetCoords, saveName, saveNotes, saveCategory, loadSaved]);

  // ── Delete flow ─────────────────────────────────────────────────────────────

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    try {
      await api.deleteLocation(pendingDelete.id);
      toast.success("Location deleted");
      setPendingDelete(null);
      await loadSaved();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to delete location";
      toast.error(msg);
    }
  }, [pendingDelete, loadSaved]);

  // ── Show on map (saved locations / spots) ─────────────────────────────────

  const showOnMap = useCallback((lat: number, lng: number, zoom = 13) => {
    setFocusTarget({ lat, lng, zoom });
  }, []);

  // ── Map marker builders ─────────────────────────────────────────────────────

  const savedMarkers = useMemo(
    () =>
      saved.map((s) => ({
        lat: s.latitude,
        lng: s.longitude,
        title: s.name,
        color: CATEGORY_COLOR[s.category] ?? "#22c55e",
        popup: `<strong>${escapeHtml(s.name)}</strong><br/>${
          s.latitude.toFixed(5)
        }, ${s.longitude.toFixed(5)}<br/><span style="text-transform:uppercase;font-size:11px;letter-spacing:0.05em;color:#888">${
          CATEGORY_LABELS[s.category] ?? s.category
        }</span>${s.notes ? `<br/>${escapeHtml(s.notes)}` : ""}`,
      })),
    [saved]
  );

  const spotMarkers = useMemo(
    () =>
      spots.slice(0, 50).map((s) => ({
        lat: s.latitude,
        lng: s.longitude,
        title: s.name,
        color: "#f59e0b",
        popup: `<strong>${escapeHtml(s.name)}</strong>${
          s.region ? `<br/>${escapeHtml(s.region)}` : ""
        }<br/>${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}${
          s.bottomType
            ? `<br/><span style="font-size:11px;color:#aaa">Bottom: ${escapeHtml(
                s.bottomType
              )}</span>`
            : ""
        }${
          s.species
            ? `<br/><span style="font-size:11px;color:#aaa">Species: ${escapeHtml(
                s.species
              )}</span>`
            : ""
        }`,
      })),
    [spots]
  );

  const allMarkers = useMemo(
    () => [...savedMarkers, ...spotMarkers],
    [savedMarkers, spotMarkers]
  );

  const mapCenter = focusTarget ?? userLoc ?? (saved[0]
    ? { lat: saved[0].latitude, lng: saved[0].longitude }
    : null) ?? { lat: 13.0827, lng: 80.2707 };

  const mapZoom = focusTarget?.zoom ?? 4;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
            <Navigation className="size-6" />
            Location & Navigation
          </h1>
          <p className="text-sm text-muted-foreground">
            Real OpenStreetMap navigation, your saved spots, and curated fishing
            harbors.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadSpots(userLoc?.lat, userLoc?.lng)}
            disabled={spotsLoading}
          >
            {spotsLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Ship className="size-4" />
            )}
            Refresh fishing spots
          </Button>
          <Button size="sm" onClick={openSaveDialog}>
            <Save className="size-4" />
            Save current point
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Left column: controls + lists */}
        <div className="flex flex-col gap-6 max-w-md">
          {/* Current Location */}
          <Card className="glass-card animate-fade-up">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Crosshair className="size-4 text-primary" />
                Current Location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {userLoc ? (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
                  <div className="font-medium">
                    {userLoc.lat.toFixed(5)}, {userLoc.lng.toFixed(5)}
                  </div>
                  {userLoc.accuracy != null && (
                    <div className="text-xs text-muted-foreground">
                      Accuracy ±{Math.round(userLoc.accuracy)} m
                    </div>
                  )}
                </div>
              ) : geoDenied ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                  Location permission denied. Enter coordinates manually:
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No location yet — click <em>Use my location</em> to begin.
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={locateMe} disabled={locating} size="sm">
                  {locating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <LocateFixed className="size-4" />
                  )}
                  Use my location
                </Button>
                {userLoc && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={locateMe}
                    disabled={locating}
                  >
                    <Compass className="size-4" />
                    Refresh
                  </Button>
                )}
              </div>
              {geoDenied && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Input
                    placeholder="Latitude"
                    inputMode="decimal"
                    value={manualLat}
                    onChange={(e) => setManualLat(e.target.value)}
                    aria-label="Manual latitude"
                  />
                  <Input
                    placeholder="Longitude"
                    inputMode="decimal"
                    value={manualLng}
                    onChange={(e) => setManualLng(e.target.value)}
                    aria-label="Manual longitude"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="col-span-2"
                    onClick={applyManualLocation}
                  >
                    <Plus className="size-4" />
                    Apply manual location
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Search Location */}
          <Card className="glass-card animate-fade-up">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="size-4 text-primary" />
                Search a Place
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Chennai harbour"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") runSearch();
                  }}
                  aria-label="Search query"
                />
                <Button onClick={runSearch} disabled={searching} size="sm">
                  {searching ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                  Search
                </Button>
              </div>
              {searchError && (
                <p className="text-xs text-amber-400">
                  {searchError}
                </p>
              )}
              {searchResults.length > 0 && (
                <ul className="scroll-ocean max-h-72 space-y-1 overflow-y-auto pr-1">
                  {searchResults.map((r, i) => (
                    <li key={`${r.name}-${i}`}>
                      <button
                        onClick={() => pickSearchResult(r)}
                        className="flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-2 text-left text-sm transition hover:border-border hover:bg-accent/60"
                      >
                        <MapPin className="mt-0.5 size-4 shrink-0 text-purple-400" />
                        <span className="flex-1">
                          <span className="block font-medium">{r.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {[r.region, r.country].filter(Boolean).join(", ") ||
                              `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {searchPin && (
                <div className="rounded-md border border-purple-500/40 bg-purple-500/10 p-2 text-xs text-purple-200">
                  Pinned: <strong>{searchPin.title}</strong>
                  <button
                    onClick={() => setSearchPin(null)}
                    className="ml-2 text-purple-300 underline-offset-2 hover:underline"
                  >
                    clear
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Saved Locations */}
          <Card className="glass-card animate-fade-up">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="size-4 text-emerald-400" />
                Saved Locations
                {saved.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {saved.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {savedLoading ? (
                <LoadingState label="Loading saved locations…" />
              ) : savedError ? (
                <ErrorState message={savedError} onRetry={loadSaved} />
              ) : saved.length === 0 ? (
                <EmptyState
                  title="No saved locations yet"
                  description="Use 'Save current point' above, or click anywhere on the map to capture a coordinate."
                  icon={Star}
                />
              ) : (
                <ul className="scroll-ocean max-h-80 space-y-2 overflow-y-auto pr-1">
                  {saved.map((s) => {
                    const dKm = userLoc
                      ? haversineKm(
                          userLoc.lat,
                          userLoc.lng,
                          s.latitude,
                          s.longitude
                        )
                      : null;
                    return (
                      <li
                        key={s.id}
                        className="rounded-lg border border-border/60 bg-muted/30 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block size-2.5 shrink-0 rounded-full"
                                style={{
                                  background:
                                    CATEGORY_COLOR[s.category] ?? "#22c55e",
                                }}
                                aria-hidden
                              />
                              <span className="truncate font-medium">
                                {s.name}
                              </span>
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
                              {dKm != null && (
                                <span className="ml-2 text-emerald-400">
                                  · {fmtKm(dKm)} away
                                </span>
                              )}
                            </div>
                            {s.notes && (
                              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                {s.notes}
                              </p>
                            )}
                          </div>
                          <Badge variant="outline" className="shrink-0">
                            {CATEGORY_LABELS[s.category] ?? s.category}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              showOnMap(s.latitude, s.longitude, 14)
                            }
                          >
                            <MapPin className="size-3.5" />
                            Show on map
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => setPendingDelete(s)}
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Fishing Spots */}
          <Card className="glass-card animate-fade-up">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Ship className="size-4 text-amber-400" />
                Fishing Harbors & Spots
                {spots.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {spots.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {spotsLoading && !spotsLoaded ? (
                <LoadingState label="Loading fishing spots…" />
              ) : spotsError ? (
                <ErrorState
                  message={spotsError}
                  onRetry={() => loadSpots(userLoc?.lat, userLoc?.lng)}
                />
              ) : spots.length === 0 ? (
                <EmptyState
                  title="No fishing spots available"
                  description="Curated harbor coordinates are seeded on the server."
                  icon={Ship}
                />
              ) : (
                <ul className="scroll-ocean max-h-80 space-y-2 overflow-y-auto pr-1">
                  {spots.slice(0, 30).map((s) => (
                    <li
                      key={s.id}
                      className="rounded-lg border border-border/60 bg-muted/30 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{s.name}</div>
                          {s.region && (
                            <div className="text-xs text-muted-foreground">
                              {s.region}
                            </div>
                          )}
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
                            {s.distanceKm != null && (
                              <span className="ml-2 text-amber-400">
                                · {fmtKm(s.distanceKm)} away
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            {s.bottomType && (
                              <Badge variant="outline" className="capitalize">
                                {s.bottomType}
                              </Badge>
                            )}
                            {s.depthM != null && (
                              <span className="text-muted-foreground">
                                Depth: {s.depthM} m
                              </span>
                            )}
                            <span className="text-muted-foreground">
                              Species:{" "}
                              {s.species && s.species.trim().length > 0 ? (
                                <span className="text-foreground">
                                  {s.species}
                                </span>
                              ) : (
                                <Unavailable />
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => showOnMap(s.latitude, s.longitude, 13)}
                        >
                          <MapPin className="size-3.5" />
                          Show on map
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: map (sticky on lg) */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card className="glass-card overflow-hidden p-0">
            <CardContent className="p-0">
              <div className="relative h-[320px] sm:h-[460px] lg:h-[600px]">
                <LeafletMap
                  center={mapCenter}
                  zoom={mapZoom}
                  markers={allMarkers}
                  userMarker={userLoc ?? null}
                  searchMarker={
                    searchPin
                      ? {
                          lat: searchPin.lat,
                          lng: searchPin.lng,
                          title: searchPin.title,
                          color: "#a855f7",
                          popup: `<strong>${escapeHtml(
                            searchPin.title
                          )}</strong><br/>${searchPin.lat.toFixed(
                            5
                          )}, ${searchPin.lng.toFixed(5)}`,
                        }
                      : null
                  }
                  onMapClick={(lat, lng) => {
                    setClickPoint({ lat, lng });
                    toast.success("Coordinate captured", {
                      description: `${lat.toFixed(5)}, ${lng.toFixed(5)} — click 'Save current point'.`,
                    });
                  }}
                />
                {/* Map legend */}
                <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap gap-2 rounded-md border border-border/60 bg-background/80 px-2 py-1 text-[11px] backdrop-blur">
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ background: "#3b82f6" }}
                    />
                    You
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ background: "#22c55e" }}
                    />
                    Saved
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ background: "#f59e0b" }}
                    />
                    Spot
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ background: "#a855f7" }}
                    />
                    Search
                  </span>
                </div>
                {clickPoint && (
                  <div className="absolute right-3 top-3 z-[500] flex items-center gap-2 rounded-md border border-red-500/50 bg-background/90 px-2 py-1 text-xs backdrop-blur">
                    <Pin className="size-3.5 text-red-400" />
                    <span>
                      {clickPoint.lat.toFixed(5)}, {clickPoint.lng.toFixed(5)}
                    </span>
                    <button
                      onClick={() => setClickPoint(null)}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      aria-label="Clear captured point"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
              <div className="border-t border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                Map tiles ©{" "}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  OpenStreetMap contributors
                </a>{" "}
                — click the map to capture a coordinate.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this location</DialogTitle>
            <DialogDescription>
              {saveTargetCoords
                ? `Saving ${saveTargetCoords.lat.toFixed(5)}, ${saveTargetCoords.lng.toFixed(
                    5
                  )} to your saved locations.`
                : "Pick a point on the map first."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="loc-name">
                Name
              </label>
              <Input
                id="loc-name"
                placeholder="e.g. North reef drop-off"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="loc-category">
                Category
              </label>
              <Select
                value={saveCategory}
                onValueChange={(v) => setSaveCategory(v)}
              >
                <SelectTrigger id="loc-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fishing">Fishing</SelectItem>
                  <SelectItem value="harbor">Harbor</SelectItem>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="waypoint">Waypoint</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="loc-notes">
                Notes (optional)
              </label>
              <Input
                id="loc-notes"
                placeholder="Tides, landmarks, depth…"
                value={saveNotes}
                onChange={(e) => setSaveNotes(e.target.value)}
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={confirmSave} disabled={saving || saveName.trim().length < 2}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved location?</AlertDialogTitle>
            <AlertDialogDescription>
            This will permanently delete “{pendingDelete?.name}” from your saved locations. This action cannot be undone.
          </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default LocationNavigationView;
