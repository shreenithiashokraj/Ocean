# Task 6 — Location & Navigation Module

- **Task ID**: 6
- **Agent**: location-navigation-agent
- **Task scope**: Implement the Location & Navigation module end-to-end for the
  Fisherman Module SPA — backend REST routes for saved locations + curated
  fishing spots, plus a real-Leaflet/OpenStreetMap client map view with
  geolocation, place search, save/delete flows, and distance-sorted fishing
  harbors.

## Files I created (exactly the 5 listed in the brief, plus 1 wiring edit)

1. `src/app/api/locations/route.ts` — GET (list user's saved locations
   newest-first) + POST (create with server-side validation: name ≥2 chars,
   lat -90..90, lng -180..180, category ∈ {fishing,harbor,home,waypoint}).
   Both `requireUser()`-guarded. `runtime = "nodejs"`.
2. `src/app/api/locations/[id]/route.ts` — DELETE. `requireUser()`-guarded.
   Finds the row; returns 404 if missing OR `userId !== session.sub` (no
   ownership leak via timing or message). Otherwise deletes, returns
   `{ok:true}`. `runtime = "nodejs"`.
3. `src/app/api/fishing-spots/route.ts` — GET. Returns ALL `FishingSpot` rows
   from DB (curated real harbor/port coords seeded in `prisma/seed.js`).
   Optional `lat`,`lng` query params trigger haversine `distanceKm`
   computation + nearest-first sort. NO fabricated fish-population data —
   `species` field comes from DB only (may be empty string).
   `runtime = "nodejs"`.
4. `src/components/location/leaflet-map.tsx` — client-only Leaflet map
   component. Exports both named `LeafletMap` and default. Imports
   `leaflet/dist/leaflet.css`. Calls `L.Icon.Default.mergeOptions(...)` with
   unpkg 1.9.4 marker icons (fixes bundler-broken default icons). Imperative
   `L.map(ref, {...})` in a `useEffect`; adds OSM tile layer with proper
   attribution; uses a `L.layerGroup` for cheap clear+redraw on prop
   changes; `map.remove()` cleanup on unmount. SSR safety via parent
   `next/dynamic({ ssr:false })` — NO `useState` mounted guard (lint
   forbids `react-hooks/set-state-in-effect`).
5. `src/components/location/location-navigation-view.tsx` — main client view
   (`'use client'`). Exports both named `LocationNavigationView` and default.
   2-col responsive grid (left = controls/cards `max-w-md`, right = sticky
   map `h-[600px]`, stacks below on mobile). Cards: Current Location
   (geolocation + manual fallback), Search a Place, Saved Locations, Fishing
   Spots. Map markers: user (blue + accuracy circle), saved (green per
   category), spots (amber), search (purple). Click-to-capture-coordinate
   flow → save dialog.
6. **Wiring edit** in `src/components/modules/index.tsx` — replaced the local
   `LocationNavigationView` stub with
   `export { LocationNavigationView } from "@/components/location/location-navigation-view";`
   and removed the unused `cn` import. Other stubs left intact for their
   owning agents.

## Notes for downstream agents

- **`/api/places/search` is NOT created** — out of scope for Task 6. The
  `api.searchPlaces(q)` method in `src/lib/api.ts` is already wired to call
  `GET /api/places/search?q=`. The location-navigation-view gracefully
  handles a 404 from that endpoint by showing a warning toast ("Place
  search is offline") and directing the user to use geolocation or
  map-click capture instead. When the place-search backend is built later,
  no UI changes are required — just create the route and it'll "just work".
- **Marker icons** are loaded from `https://unpkg.com/leaflet@1.9.4/dist/...`
  per the explicit fix in the task brief. If offline, marker pins will be
  broken images but the map tiles/markers popups still work.
- **No fabricated fish data**: FishingSpot rows from the seed have
  `species = ""` for all currently-seeded spots. The view renders the
  `Unavailable` pill from `@/components/common/states` whenever `species`
  is empty. When real species data is added (via admin UI / DB seed
  update), it'll render automatically — no UI changes needed.
- **Geolocation denial** path is fully handled: amber banner + manual
  lat/lng inputs as fallback. Validates `-90..90` and `-180..180` on the
  client before applying (server validates too on save).
- **Distance computation** is duplicated client-side (in
  `location-navigation-view.tsx`) for the saved-locations list (distance
  from current location) AND server-side (in `fishing-spots/route.ts`)
  for the spots list (returned as `distanceKm`). Both use the same
  haversine formula.
- **All API endpoints verified** via curl as `fisher@fisherman.dev`:
  sign-in → 200, GET/POST/DELETE locations all return correct shapes and
  status codes (200/201/422/404/401). Fishing spots endpoint returns
  `distanceKm` when lat/lng provided, omits it otherwise, and sorts
  nearest-first when reference is provided.
- **Lint**: 0 errors, 0 warnings in my files. The only remaining 2
  warnings live in `src/app/page.tsx` (unused eslint-disable directives
  that pre-date Task 6).
- **Dev log**: server compiled all new code in 184-316 ms with no errors;
  `GET /` returns 200. An older `EADDRINUSE` log line from a duplicate
  startup attempt is harmless — the live server on port 3000 is the one
  answering 200s.

## Stage Summary

Task 6 complete. All 5 required files written + 1 surgical wiring edit
(`modules/index.tsx`). Real Leaflet + OSM tiles with proper attribution
(NOT a fake map image). Geolocation with graceful denial fallback.
Server-side coordinate validation + ownership enforcement on delete. No
fabricated fish-population data — species rendered only when non-empty
(else `Unavailable` pill). `/api/places/search` deliberately NOT created
(out of scope) — UI degrades gracefully. All endpoints verified working
via curl. Lint clean. Worklog appended after Task 5.
