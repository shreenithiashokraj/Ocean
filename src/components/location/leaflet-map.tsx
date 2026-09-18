"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import L from "leaflet";
import { cn } from "@/lib/utils";

/**
 * Plain-Leaflet client map. We intentionally avoid `react-leaflet` for React 19
 * compatibility. The map is created imperatively in a `useEffect` and cleaned
 * up on unmount via `map.remove()`.
 *
 * SSR safety: the parent view lazy-loads this component via
 * `next/dynamic({ ssr:false })`, so this component only ever mounts in the
 * browser. No `useState` mounted guard is required.
 */

export interface MapMarker {
  lat: number;
  lng: number;
  title?: string;
  color?: string; // css color used for the pin (default blue)
  popup?: string;
}

export interface UserMarker {
  lat: number;
  lng: number;
  accuracy?: number; // meters
}

export interface LeafletMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  userMarker?: UserMarker | null;
  searchMarker?: MapMarker | null;
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
}

// Fix Leaflet's default marker icons (broken by bundler asset path resolution).
// Done once at module load. Uses the official unpkg CDN images matching the
// installed Leaflet 1.9.4 version so the markers render correctly.
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const DEFAULT_CENTER = { lat: 20.0, lng: 0.0 }; // world view fallback

function coloredDivIcon(color: string): L.DivIcon {
  // A round pin rendered with the given CSS color — works for our green/amber/purple/blue markers.
  return L.divIcon({
    className: "fm-map-pin",
    html: `<span style="display:inline-block;width:18px;height:18px;border-radius:9999px;background:${color};border:3px solid rgba(255,255,255,0.9);box-shadow:0 0 0 2px rgba(0,0,0,0.25),0 2px 6px rgba(0,0,0,0.4);"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

const COLORS = {
  user: "#3b82f6", // blue
  saved: "#22c55e", // green
  spot: "#f59e0b", // amber
  search: "#a855f7", // purple
  click: "#ef4444", // red
};

export function LeafletMap({
  center,
  zoom = 4,
  markers = [],
  userMarker = null,
  searchMarker = null,
  onMapClick,
  className,
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Initialize the map once after mount. The parent wraps us in
  // `next/dynamic({ ssr:false })`, so this effect only runs in the browser.
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return; // already init

    const c = center ?? DEFAULT_CENTER;
    const map = L.map(containerRef.current, {
      center: [c.lat, c.lng],
      zoom,
      scrollWheelZoom: true,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    // Single layer group for all dynamic markers so we can clear + redraw cheaply.
    const group = L.layerGroup().addTo(map);
    layerRef.current = group;
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Re-center when `center` changes after init.
  useEffect(() => {
    if (!mapRef.current || !center) return;
    mapRef.current.setView([center.lat, center.lng], zoom, { animate: true });
  }, [center?.lat, center?.lng, zoom]);

  // Redraw all dynamic markers whenever inputs change.
  useEffect(() => {
    const group = layerRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();

    // User marker + accuracy circle (blue).
    if (userMarker) {
      const um = L.marker([userMarker.lat, userMarker.lng], {
        icon: coloredDivIcon(COLORS.user),
        title: "Your location",
        alt: "Your location",
      }).addTo(group);
      if (userMarker.accuracy && userMarker.accuracy > 0) {
        L.circle([userMarker.lat, userMarker.lng], {
          radius: userMarker.accuracy,
          color: COLORS.user,
          fillColor: COLORS.user,
          fillOpacity: 0.12,
          weight: 1,
        }).addTo(group);
      }
      um.bindPopup(
        `<strong>Your location</strong><br/>${userMarker.lat.toFixed(5)}, ${userMarker.lng.toFixed(5)}<br/>${
          userMarker.accuracy ? `±${Math.round(userMarker.accuracy)} m accuracy` : ""
        }`
      );
    }

    // General markers (e.g. saved locations green, fishing spots amber).
    for (const m of markers) {
      const color = m.color || COLORS.saved;
      const marker = L.marker([m.lat, m.lng], {
        icon: coloredDivIcon(color),
        title: m.title ?? "",
        alt: m.title ?? "",
      }).addTo(group);
      if (m.popup) marker.bindPopup(m.popup);
      else if (m.title) marker.bindPopup(m.title);
    }

    // Search result marker (purple).
    if (searchMarker) {
      const sm = L.marker([searchMarker.lat, searchMarker.lng], {
        icon: coloredDivIcon(searchMarker.color || COLORS.search),
        title: searchMarker.title ?? "Search result",
        alt: searchMarker.title ?? "Search result",
      }).addTo(group);
      if (searchMarker.popup) sm.bindPopup(searchMarker.popup);
      else if (searchMarker.title) sm.bindPopup(searchMarker.title);
    }
  }, [markers, userMarker, searchMarker]);

  // Map click → caller captures coordinate.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onMapClick) return;
    const handler = (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    };
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [onMapClick]);

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full rounded-xl overflow-hidden", className)}
      role="region"
      aria-label="Interactive map"
      style={{ minHeight: 320 }}
    />
  );
}

export default LeafletMap;
