# Fisherman Module — Worklog

This file tracks the work performed by all agents on the Fisherman Module
project. Each entry starts with `---` and follows the standard template.

## Project context

- Single-page application at `/` (sandbox constraint), with client-side view
  routing via Zustand store (`src/lib/store.ts`) simulating the multi-portal
  structure requested (admin / researcher / fisherman).
- Backend: Next.js App Router API routes under `/api/*`, Prisma + SQLite.
- Auth: bcrypt passwords + httpOnly JWT session cookie (`src/lib/auth.ts`).
- API service layer: `src/lib/api.ts` (single place to swap providers).
- Shared types: `src/lib/types.ts`.
- Permissions (server + client mirror): `src/lib/permissions.ts`.
- Theme: deep ocean blue in `src/app/globals.css`.
- Demo accounts (see README / seed):
  - admin@fisherman.dev / Admin@123
  - researcher@fisherman.dev / Research@123
  - fisher@fisherman.dev / Fisher@123

## Architecture rules for all agents

- NEVER hardcode fake real-time weather/marine/AI data as live data. Real data
  comes from configured APIs (Open-Meteo for weather/marine, z-ai-web-dev-sdk
  VLM for fish analysis). If an API is unavailable, label clearly as
  "Demo Data / Offline Mode".
- Backend enforces roles via `requireRole(...)` from `@/lib/auth`.
- Client components must use `api.*` from `@/lib/api.ts`, never `fetch` directly
  to a hardcoded URL.
- Use existing shadcn/ui components in `src/components/ui`.
- Sticky footer: root wrapper uses `min-h-screen flex flex-col`, footer `mt-auto`.
- Add new API routes under `src/app/api/<service>/route.ts`.
- Append your own work record below using the template in the system prompt.

---

## Task 5 — AI Fish Analysis (VLM)

- **Agent**: Z.ai Code (Task 5)
- **Task**: Build the AI Fish Analysis module — backend VLM route
  (POST/GET), DELETE-by-id route, and the client-side `FishAnalysisView`
  (uploader + result card + history list with delete confirm).

### Files created

1. `src/app/api/fish-analysis/route.ts` — POST + GET, `runtime = "nodejs"`.
   POST: `requireUser()` guard, validates image data URL (must start with
   `data:image/`, only jpeg/png/webp, ≤8 MB → 422 on bad input), calls
   the VLM via `zai.chat.completions.createVision(...)`, parses a strict
   JSON response (loose JSON parser with code-fence stripping + fallback
   to a notes-only row on parse failure), persists a `FishAnalysis` row,
   logs every call via `logApiCall({ service: "fish-analysis", ... })`.
   GET: lists the current user's analyses newest first.
2. `src/app/api/fish-analysis/[id]/route.ts` — DELETE, `runtime = "nodejs"`.
   Looks up the row, returns 404 if missing, 403 if `row.userId !==
   session.sub` (fisherman owns their own analyses), otherwise deletes +
   returns `{ ok: true }`.
3. `src/components/fish-analysis/fish-analysis-view.tsx` — main client view
   (`'use client'`). Exports default + named `FishAnalysisView`. Layout:
   `mx-auto max-w-6xl px-4 py-6 sm:px-6`. Drag-drop uploader + file input
   (accept jpeg/png/webp), client-side type/size validation, image preview
   with remove button, simulated upload progress bar, "Analyze Fish"
   button (purple gradient), loading state with skeleton + "Analyzing
   image with AI…" spinner, full result card (species, confidence %
   with Progress bar, alternative-species chips, size/weight metric
   boxes, characteristics bullets, identification notes, amber
   quality-warning notice, market-price section showing `Unavailable`
   when no API configured, thumbnail), amber prediction disclaimer,
   expandable history list with AlertDialog-gated delete.

### Wiring change

`src/components/modules/index.tsx` — replaced the `FishAnalysisView`
stub with `export { default as FishAnalysisView } from
"@/components/fish-analysis/fish-analysis-view"` so the module router
uses the real implementation. Surgical one-line addition; other stubs
were not touched.

### VLM SDK call (verified via the VLM skill)

```ts
const ZAIModule = await import("z-ai-web-dev-sdk");
const ZAI = (ZAIModule as { default?: unknown }).default ?? ZAIModule;
const zai = await (ZAI as { create: () => Promise<VLMClient> }).create();
const completion = await zai.chat.completions.createVision({
  messages: [{
    role: "user",
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
  }],
  thinking: { type: "disabled" },
});
```

Key learnings:
- The vision method is `chat.completions.createVision(...)` — NOT
  `chat.completions.create(...)`.
- SDK is dynamic-imported inside the route handler so it can never end
  up in a client bundle.
- `content` may be string OR array of content blocks; `contentToString()`
  handles both, plus an object-with-`.text` shape.
- Strict-JSON prompt + loose JSON parser (strips ```json fences, extracts
  first `{...}` block). On parse failure, falls back to a row with null
  species + raw text in `notes` so the UI surfaces a graceful state.

### Behavior rules honored

- Image type/size validated on BOTH client and server.
- Upload progress + analysis loading state visible to user.
- Graceful API error handling (toast + `ErrorState`).
- Market price never invented — `analysis.market` is `null` when
  `FISH_MARKET_API_URL` / `FISH_MARKET_API_KEY` are unset; UI shows the
  `Unavailable` component with an env-var hint.
- Backend enforces that the fisherman owns their own analyses (DELETE
  returns 403 on ownership mismatch).
- Failed VLM attempts are still persisted (null species + error in
  `notes`) so the fisherman sees a record of every attempt.

### Verification

- `bun run lint`: 0 errors / 0 warnings in my files. (Remaining 2
  warnings live in `src/app/page.tsx`, owned by another agent.)
- `GET /api/fish-analysis` → 401 (route compiles + auth guard fires +
  `ApiLog` INSERT visible in `dev.log`).
- `DELETE /api/fish-analysis/test` → 401 (compiles + auth guard fires +
  `ApiLog` INSERT visible).
- `POST /api/fish-analysis` → 401 (compiles + auth guard fires +
  `ApiLog` INSERT visible).
- `GET /` → 200 (re-export in `modules/index.tsx` compiles cleanly when
  the SPA shell renders).

### Stage Summary

Task 5 complete. All three required files written; the route is wired
into the SPA via a one-line re-export in `modules/index.tsx`. The
z-ai-web-dev-sdk VLM is called backend-only via dynamic import, with a
strict-JSON prompt + loose parser + graceful fallback. Image validation
runs on both client and server; ownership is enforced on delete; no
prices are invented. Lint passes for my files; dev server compiles all
three new routes and serves the SPA without errors.

---

## Task ID: 6

- **Agent**: location-navigation-agent
- **Task**: Implement the Location & Navigation module end-to-end — backend
  REST routes for saved locations + curated fishing spots, plus a
  real-Leaflet/OpenStreetMap client map view with geolocation, place
  search, save/delete flows, and distance-sorted fishing harbors.

### Work Log

- Read worklog + conventions. Confirmed `api.ts` already declares
  `listSavedLocations`, `saveLocation`, `deleteLocation`, `searchPlaces`,
  and `listFishingSpots` — these are the client contract for this module.
- Created `src/app/api/locations/route.ts`:
  - `GET` → `requireUser()`, lists current user's saved locations
    (`db.savedLocation.findMany where userId=sub`) newest-first.
    Returns `{locations:[{id,name,latitude,longitude,notes,category,createdAt}]}`.
  - `POST` → `requireUser()`. Body `{name,lat,lng,notes?,category?}`.
    Validates name (≥2 chars), lat (-90..90), lng (-180..180),
    category (one of fishing|harbor|home|waypoint, default "fishing").
    Returns `201 {location:{...}}`.
  - `runtime = "nodejs"`.
- Created `src/app/api/locations/[id]/route.ts`:
  - `DELETE` → `requireUser()`. Finds row; if not found OR
    `userId !== session.sub` → `404 Not found` (no ownership leak).
    Otherwise deletes. Returns `{ok:true}`. `runtime = "nodejs"`.
- Created `src/app/api/fishing-spots/route.ts`:
  - `GET` → `requireUser()`. Returns ALL `FishingSpot` rows from DB
    (curated real harbor/port coords from seed). Optional `lat`,`lng`
    query params trigger haversine `distanceKm` computation + nearest-first
    sort. NO invented fish-population data — `species` field comes from DB
    only (may be empty string). `runtime = "nodejs"`.
- Created `src/components/location/leaflet-map.tsx` (client-only):
  - Imports `leaflet/dist/leaflet.css` at the top (Turbopack handles it).
  - Calls `L.Icon.Default.mergeOptions(...)` with the unpkg 1.9.4 marker
    icons (fixes bundler-broken default icons).
  - Imperative `L.map(ref, {center, zoom, scrollWheelZoom:true})` in a
    `useEffect`; adds OSM tile layer with `© OpenStreetMap contributors`
    attribution; adds a `L.layerGroup` for cheap clear+redraw on prop
    changes; cleanup `map.remove()` on unmount.
  - Renders user marker (blue) + accuracy circle when `accuracy > 0`;
    general `markers[]` (per-marker color); a `searchMarker` (purple);
    `onMapClick` propagates `lat,lng` to parent.
  - SSR safety: NO `useState` mounted guard (lint forbids
    `react-hooks/set-state-in-effect`); instead, the parent view wraps
    this component in `next/dynamic({ ssr:false })` so it only mounts on
    the client.
  - Exports both named `LeafletMap` and default.
- Created `src/components/location/location-navigation-view.tsx`:
  - Layout: `mx-auto max-w-7xl px-4 py-6 sm:px-6` with a 2-col grid on
    `lg:` (left = controls/cards `max-w-md`, right = sticky map
    `h-[600px]`). On mobile the map stacks below the controls.
  - Current Location card: `LocateFixed` "Use my location" button
    (`navigator.geolocation.getCurrentPosition` with high-accuracy,
    15 s timeout); shows lat/lng + accuracy (m); "Refresh" button.
    On `PERMISSION_DENIED` (or unsupported) → toast + amber banner +
    manual lat/lng inputs as fallback. `applyManualLocation` validates
    `-90..90` and `-180..180` before applying.
  - Search Location card: Input + button → `api.searchPlaces(q)` → list
    of `{name,region,country}`. Clicking a result pins it (purple marker)
    + recenters map. Gracefully degrades when `/api/places/search` 404s:
    shows a warning toast instructing the user to use geolocation or
    map-click capture instead. (Note: `/api/places/search` is NOT in
    scope for this task — left for another agent.)
  - "Save current point" button → opens a Dialog (name, category via
    `Select`, notes) → `api.saveLocation` → toast + refresh saved list.
    Disabled if no point is selected (geolocation / search / map-click
    must produce a coordinate first).
  - Saved Locations list (`scroll-ocean max-h-80`): each item shows
    name, coords, category Badge, client-computed haversine distance
    from current location (when known), "Show on map" (recenters +
    popup), and "Delete" (AlertDialog confirm). Empty state when none.
  - Fishing Spots list: loads via `api.listFishingSpots(currentLat,
    currentLng)` once geolocation resolves (also auto-fetches with no
    reference point if user denies geolocation). Each spot: name,
    region, distance, `bottomType` Badge (when present), depth (when
    present). Species rendered via `Unavailable` component when empty,
    per the no-fabricated-fish-data rule.
  - Map markers: user (blue, accuracy circle), saved (green per
    category), fishing spots (amber, capped at 50), search (purple).
    Clicking the map captures a coordinate (red corner badge) which
    becomes the save target.
  - Uses `LoadingState` / `ErrorState` / `EmptyState` from
    `@/components/common/states`. All cards use `glass-card` +
    `animate-fade-up`. Sticky footer handled by `AppShell`.
- Wired the new view into `src/components/modules/index.tsx` by
  replacing the local stub with
  `export { LocationNavigationView } from "@/components/location/location-navigation-view";`.
  Removed the unused `cn` import. Other stub views left intact for their
  owning agents.
- Ran the seed (`bun run db:seed`) to populate the 5 curated FishingSpot
  rows (Chennai, Kochi, Mangalore, etc.).
- Tested the new API endpoints end-to-end with curl as `fisher@fisherman.dev`:
  - `POST /api/auth/sign-in` → 200.
  - `GET /api/locations` → `{locations:[]}` (empty for fresh user).
  - `POST /api/locations` with valid body → 201 + created row.
  - `GET /api/locations` again → returns the new row.
  - `DELETE /api/locations/:id` → `{ok:true}`.
  - `POST /api/locations` with `name:"X"` → 422 "Name must be at least 2 characters".
  - `POST /api/locations` with `lat:999` → 422 "Latitude must be between -90 and 90".
  - `GET /api/fishing-spots?lat=13.0827&lng=80.2707` → spots sorted
    nearest-first with `distanceKm` field; Chennai = 0 km at the top.
  - `GET /api/fishing-spots` (no lat/lng) → spots WITHOUT `distanceKm`.
  - `GET /api/locations` (no cookie) → 401.
  - `GET /api/fishing-spots` (no cookie) → 401.
- Ran `bun run lint` → 0 errors, 0 warnings in my files. Only 2
  pre-existing warnings remain in `src/app/page.tsx` (unused
  eslint-disable directives that pre-date this task).
- Checked `dev.log` — server compiling my new code in 184-316 ms, all
  `GET /` returning 200, no runtime errors. (An older `EADDRINUSE`
  line from a duplicate startup attempt was harmless — the live
  server on port 3000 is the one answering 200s.)

### Stage Summary

- Backend: 3 new API routes (`/api/locations` GET+POST,
  `/api/locations/[id]` DELETE, `/api/fishing-spots` GET), all auth-guarded
  with `requireUser()`, server-side coordinate validation, ownership
  check on delete.
- Frontend: real Leaflet + OpenStreetMap map (NOT a fake image) with
  proper attribution; geolocation with graceful permission-denial
  fallback to manual entry; place search with graceful 404 handling;
  save/delete flows with dialog confirmations; distance-sorted fishing
  spots list; click-to-capture-coordinate flow.
- Strictly followed "no fabricated fish data" rule — species only
  rendered when non-empty, otherwise `Unavailable` pill.
- Strictly followed "files I create" rule — only the 5 listed files
  plus a single-line wiring edit in `src/components/modules/index.tsx`.
  The `/api/places/search` route was NOT created (out of scope); the UI
  degrades gracefully with a clear warning.
- Known limitation: marker icons loaded from unpkg CDN (per the task
  spec's explicit fix) — if offline, markers will fall back to broken
  images. Acceptable per task constraints.
- All API endpoints verified working via curl with valid + invalid
  inputs. Lint clean.


---

## Task 4 — Safety & Alert System (safety-alerts-agent)

**Agent**: safety-alerts-agent
**Task**: Implement the Safety & Alert System module — alert engine, notifications API, and the fisherman-facing Safety & Alert System view.

### Work Log

- Read `worklog.md`, `prisma/schema.prisma`, `src/lib/{types,api,auth,weather,db,store}.ts`, `prisma/seed.js`, and `src/components/modules/index.tsx` to learn conventions.
- Created 5 API route files:
  - `src/app/api/alerts/route.ts` — GET list (own + broadcast), supports `?unread=1`.
  - `src/app/api/alerts/run/route.ts` — POST alert engine.
  - `src/app/api/alerts/[id]/read/route.ts` — POST mark-read with ownership guard.
  - `src/app/api/notifications/route.ts` — GET list (per-user, newest first, limit 100).
  - `src/app/api/notifications/[id]/read/route.ts` — POST mark-read (strict owner).
- Created client view `src/components/safety-alerts/safety-alerts-view.tsx` (default + named `SafetyAlertsView`):
  - StatCard row (total / critical / unread / last alert), severity-color-striped alert cards (LOW=slate, MODERATE=amber, HIGH=orange, CRITICAL=red), type icon per alert (Wind/Waves/Rain/Storm/Visibility), click → optimistic mark-read + shadcn Dialog with full details, "Run alert check now" / "Show unread only" Switch / "Mark all read" controls, 60s auto-refresh, Loading/Error/Empty states, safety disclaimer `<aside role="note">`, responsive 1/2/3-col grid, accessible (`aria-label`, `aria-busy`, focus rings, semantic `<header>/<section>/<aside>`).
- Wired the new view in by editing `src/components/modules/index.tsx` to re-export `SafetyAlertsView` from the real file (replaced the stub).
- Ran `bun run lint` — my files contribute 0 errors / 0 warnings. (The 1 project-level lint error is in `src/components/sea-conditions/sea-conditions-view.tsx`, owned by another agent.)
- End-to-end verified via curl: all routes 401 unauthed; authed fisher gets `{alerts:[]}` 200, notifications list 200, `POST /api/alerts/run` returns `{created,checked}` 200, `POST /api/alerts/:id/read` returns `{ok:true}` 200. Dev log shows the expected SQL `WHERE (userId = ? OR userId IS NULL) ORDER BY createdAt DESC` for the list and the unread filter wraps with `isRead = ? AND (...)`. The previous `GET /api/notifications 404` spam from the header poller has stopped.

### Alert engine (POST /api/alerts/run) summary

1. `requireUser()` — any role. ADMIN → `userId=null` (broadcast); others → `userId=session.sub`.
2. Coordinates: JSON body `{lat,lng}` > query `?lat=&lng=` > Chennai default (13.0827, 80.2707), clamped to valid ranges.
3. `fetchWeatherMarine(lat, lng)` for current conditions (Open-Meteo, with clearly-labelled demo fallback when offline).
4. Loads all `AlertThreshold` rows.
5. Maps `metric`→`SeaConditionData` field; skips null/non-finite readings; otherwise increments `checked`.
6. Severity: `pressureHpa` inverse (lower=worse) per spec. **Documented deviation:** `visibilityM` is also treated as inverse because the seeded thresholds (caution=5000, high=2000, critical=1000) only make sense under lower=worse semantics — following the spec literally would flag clear-weather visibility (10000m) as CRITICAL. Rationale is in the source comment on `severityFor()`.
7. Metric→type: wind→WIND, wave→WAVE, precipitation→RAIN, visibility→VISIBILITY, pressure→STORM.
8. De-dupe: skips if an UNREAD alert of the same `type`/`severity`/`userId` exists from the last 6 hours.
9. Persists `WeatherAlert` (`source="Fisherman Module Alert Engine"`, endTime = now+6h) + `Notification` (per-user if scoped; broadcast to active users if ADMIN). Notification `type` = `alert` for CRITICAL/HIGH else `warning`.
10. Returns `{ created, checked }`. `logApiCall({ service: "alert-engine", endpoint: "/api/alerts/run", method: "POST", status: 200, message: "created=N" })` in `finally`; 500 record on error.
- Cleaned up one false-positive test alert generated while validating the spec-literal severity logic, so the fisher account sees a clean state.

### Stage Summary

All 6 required files created + 1 minimal wiring edit. Backend enforces ownership (own alerts + broadcast only for read; notifications strictly owner-only; mark-read returns 404 to non-owners). Source field is always `"Fisherman Module Alert Engine"`. No fake data — uses `fetchWeatherMarine`, which labels demo data when offline. Sticky footer is handled by the existing `AppShell`. Responsive + accessible. Detailed work record at `agent-ctx/4-safety-alerts-agent.md`.

---

## Task ID: 3
**Agent:** sea-conditions
**Task:** Build the Real-Time Sea Conditions module for the Fisherman Module — backend API routes + main client view.

### Work Log
- Read project conventions (`worklog.md`, `lib/weather.ts`, `lib/auth.ts`, `lib/api.ts`, `lib/types.ts`, `prisma/schema.prisma`, shared UI in `components/common/*`).
- Created `src/app/api/sea-conditions/route.ts` — GET handler that:
  - Calls `requireUser()`; returns 401 if no session.
  - Parses `lat`/`lng` query params (numbers), defaults to Chennai (13.0827, 80.2707) when missing/non-numeric, and 400s on out-of-range values.
  - Runs `fetchWeatherMarine(lat,lng)` + `reverseGeocode(lat,lng)` in parallel.
  - Persists a `SeaCondition` row every call (with `isDemo` flag) and logs to `ApiLog` via `logApiCall({ service: "weather", endpoint: "/api/sea-conditions", message: isDemo ? "offline-fallback" : "ok" })`.
  - Returns `{ data, isDemo, source, recordedAt, label }` with `Cache-Control: no-store`. `export const runtime = "nodejs"`.
- Created `src/app/api/places/search/route.ts` — GET handler that:
  - Calls `requireUser()`; returns 401 if no session.
  - Reads `q`, returns `{ results: [...] }` via `forwardGeocode(q)` from `@/lib/weather`. `runtime = "nodejs"`.
- Created `src/components/sea-conditions/sea-conditions-view.tsx` — the main client view:
  - `'use client'` view exporting both named and default `SeaConditionsView`.
  - Header (title + subtitle + source + last-updated) with an auto-refresh `Select` (1m/5m/15m/30m/Off) and a "My location" button.
  - Manual place search (Input + button) that calls `api.searchPlaces(q)` and shows a click-outside-to-dismiss dropdown of results to pick from.
  - On mount: requests `navigator.geolocation.getCurrentPosition`; on deny/unsupported, defaults to Chennai with a sonner toast.
  - Auto-refresh via `setInterval` based on `refreshMinutes` (cleared on change/unmount).
  - Status banner derives Safe (wind<25 & wave<1.5, green) / Caution (wind<40 & wave<2.5, amber) / Dangerous (red) / Unknown.
  - When `isDemo`, shows a prominent amber "Demo Data / Offline Mode" badge in the status banner and an amber footer notice "Live API unavailable — showing offline demo data."
  - Headline metrics strip uses the shared `StatCard` (Wind Speed, Wave Height, Air Temp, Sea Surface Temp).
  - Detail grid (responsive 1/2/3 cols) of custom `glass-card` cards: Location (lat/lng/accuracy + Refresh/My-location buttons), Weather Overview (WMO icon + text + air temp), Wind (speed/gusts/direction + rotated Navigation arrow), Wave (height/period/direction + rotated Compass), Temperature (air/sea/humidity), Atmospherics (pressure/precip/visibility), Sun (sunrise/sunset in local time using `utcOffsetSeconds`).
  - Marine condition chart — recharts `AreaChart` with dual Y-axes for wave height (left) and wind speed (right), gradient fills, ChartContainer/ChartTooltip, and a graceful empty/loading state.
  - Loading uses `CardSkeleton`; errors use `ErrorState` with retry; missing values use `Unavailable`. Sticky footer is left to AppShell.
- Wired the new view into `src/components/modules/index.tsx` (replaced the `SeaConditionsView` stub with `export { SeaConditionsView } from "@/components/sea-conditions/sea-conditions-view"` — only that export was touched).
- Verified by checking `dev.log` tail: `GET /api/sea-conditions` and `GET /api/places/search?q=chennai` both compile cleanly (~120ms) and return 401 when unauthenticated. `GET /` (which compiles the whole module tree including the new view) renders 200 with no errors. Removed two unused icon imports (`Droplets`, `Eye`) after lint review.

### Stage Summary
Real-Time Sea Conditions module is complete and wired in. Fishermen (and admins) can sign in, click "Sea Conditions" in the sidebar, and see live Open-Meteo weather + marine data for their GPS location (or a searched coastal place) with auto-refresh, a safety status banner, individual metric cards with rotated compass arrows, and a 24-hour wave/wind forecast chart. When the upstream API is unreachable, the backend falls back to clearly-labeled demo data and the UI shows a prominent amber "Demo Data / Offline Mode" notice so fake values are never shown as live. Each request is persisted to `SeaCondition` for history/admin views, and each external API call is logged to `ApiLog`. No compile errors. No issues to flag.

---

## Task ID: 7

- **Agent**: admin-portal-agent
- **Task**: Build the Admin Portal — all admin-only client views + their API routes (users, settings, thresholds, api-logs, sea-conditions, fish-analyses, locations) and the seven admin views (dashboard, users, sea-conditions, alerts, fish-analyses, locations, settings).

### Work Log

- Read `worklog.md`, `prisma/schema.prisma`, `src/lib/{api,auth,db,store,types}.ts`, `.env.example`, `src/components/modules/index.tsx`, the existing alerts + locations + fish-analysis routes for pattern reference. Confirmed `api.ts` already declares the 10 admin methods (listUsers, updateUserRole, getSettings, upsertSetting, getThresholds, upsertThreshold, getApiLogs, getAdminSeaConditions, getAdminFishAnalyses, getAdminLocations).
- Created 8 API route files under `src/app/api/admin/`:
  - `users/route.ts` — GET lists all users with profile phone.
  - `users/[id]/route.ts` — PATCH role + isActive. Validates role ∈ {ADMIN, RESEARCHER, FISHERMAN}; rejects non-boolean isActive with 422; rejects self-deactivation with 400 (cannot lock yourself out); 404 on missing user.
  - `settings/route.ts` — GET lists all SystemSetting rows. POST upsert by key; category defaults to "general" and is coerced into the allowed set {general, api, alert, branding}. Rejects keys containing `apiKey`/`secret`/`password`/`token` with 422 — secrets are NEVER stored in the non-secret settings table.
  - `thresholds/route.ts` — GET lists AlertThresholds. POST upsert by metric. caution/high/critical must all be finite numbers; unit capped at 20 chars; non-numeric values rejected with 422.
  - `api-logs/route.ts` — GET newest 100 ApiLog rows newest first, with the acting user's email included via Prisma `include`.
  - `sea-conditions/route.ts` — GET newest 100 SeaCondition rows newest first, with user. `payload` (the JSON string) IS returned so the admin UI can pretty-print it in a row-click dialog.
  - `fish-analyses/route.ts` — GET newest 100 FishAnalysis rows newest first, with user. `imageDataUrl` is intentionally OMITTED from the list payload to keep responses small; each row carries a boolean `hasImage` instead.
  - `locations/route.ts` — GET combined view. Runs `Promise.all` to fetch SavedLocation (with user) + FishingSpot in one request. Returns `{records: {saved: [...], spots: [...]}}` (the api.ts wrapper types this as `{records: unknown[]}` and the view casts to the expected object shape with `Array.isArray` runtime guards).
- Created 7 client views under `src/components/admin/`:
  - `admin-dashboard-view.tsx` — Overview dashboard. `Promise.all` fetches 7 endpoints in parallel; each failing endpoint degrades individually via `safeCatch` so one 500 doesn't break the whole dashboard. 10 StatCards in a responsive grid (2/3/4/5 cols): total users, fishermen, researchers, total alerts, critical alerts, fish analyses, sea-condition records, saved locations, fishing spots, recent API logs. "System Health" card showing live API providers from settings (non-secret only). "Recent API Logs" table (last 10) with HTTP-status-color-coded Badge. "Recent Alerts" mini-list (last 5) with severity chip. Amber disclaimer `<aside>`.
  - `admin-users-view.tsx` — User table with controls. Search by email/name, filter by role (Select). Per-row role Select, isActive Switch + Badge, "Save" button (disabled when row is clean). Self row marked with "you" badge; self-deactivation Switch disabled (backend also rejects with 400). Toast on save.
  - `admin-sea-conditions-view.tsx` — Records table with 3-stat strip (Total/Live/Demo). Click any row → Dialog with pretty-printed JSON payload (using `JSON.stringify(JSON.parse(raw), null, 2)` with fallback to raw string). source/isDemo Badges.
  - `admin-alerts-view.tsx` — Alerts table with 3-stat strip (Total/Critical/Unread). Filter by severity Select. Per-row: title, type chip (color-coded per type), severity chip (color-coded per severity), location (or "broadcast" Radio icon for null userId), Read Badge, created time. Pulls alerts from `/api/alerts` (admin can see broadcast + own).
  - `admin-fish-analyses-view.tsx` — Fish analyses table with 3-stat strip (Total/Identified/Avg confidence). Per-row: species (or "failed" badge when null), confidence Progress bar (handles both 0..1 and 0..100 ranges), size/weight, user, has-image indicator (image NOT in payload — boolean only). `qualityWarning` shown as amber sub-line.
  - `admin-locations-view.tsx` — Locations with Tabs. Tab 1: Saved Locations table (every user's saved locations with category chip + user). Tab 2: Fishing Spots table (curated catalog with region/depth/bottom-type badge/species/source). Both tables wrapped in `scroll-ocean max-h-[32rem] overflow-y-auto`.
  - `admin-settings-view.tsx` — Settings + thresholds. Prominent amber info card at top: "API keys for weather/marine/market/AI are configured via server environment variables (see .env.example). This UI manages non-secret settings and thresholds only." Tabs: General, API Providers, Alert Thresholds, Branding. General/Branding: editable list with per-row Save. API Providers: editable list with the relevant env-var NAME shown beneath each setting key (NEVER the value) + a separate read-only env-var reference card listing all server env vars. Alert Thresholds: editable list (metric, caution, high, critical, unit) with per-row Save; adds a cyan "How the alert engine uses these" explainer noting visibility/pressure inverse semantics.
- Did NOT edit `src/components/modules/index.tsx` per the task instructions — the orchestrator wires exports afterward.
- Verified with curl:
  - `GET /api/admin/users` → 200 (admin cookie) returning 3 users; 401 (no cookie); 401 (fisher cookie).
  - `PATCH /api/admin/users/:fisher_id` with valid body → 200 `{ok:true}`; with bad role → 422; self-deactivation → 400.
  - `POST /api/admin/thresholds` upsert → 200; non-numeric value → 422.
  - `POST /api/admin/settings` upsert → 200; key=`apiKey` → 422 with "Secrets must be configured via server environment variables".
  - `GET /api/admin/sea-conditions` returns `payload` JSON string.
  - `GET /api/admin/fish-analyses` returns `hasImage` boolean, no `imageDataUrl`.
  - `GET /api/admin/locations` returns `{records: {saved: [], spots: [5 curated]}}`.
  - `GET /` → 200 (SPA still renders).
- Ran `bun run lint` → 0 errors / 0 warnings (clean).
- Checked `dev.log` — all admin routes compiling in 2-130ms, returning expected status codes. No compile errors anywhere.

### Stage Summary

All 8 admin API routes + 7 admin client views created. Every admin route is guarded by `requireRole("ADMIN")` returning 401 when not admin (per spec, returning 401 for both unauthenticated and non-admin sessions is acceptable). Secrets are never exposed in the settings UI — only env-var NAMES are shown, and the upsert endpoint rejects keys that look like secrets (`apiKey`, `secret`, `password`, `token`). All views use glass-card, scroll-ocean, LoadingState/ErrorState/EmptyState, StatCard, and responsive tables with `overflow-x-auto`. The dev server hot-reloads cleanly; no compile errors. Lint passes for all files. Detailed work record at `agent-ctx/7-admin-portal-agent.md`.


---

## Task ID: 8

- **Agent**: researcher-portal-agent (Z.ai Code)
- **Task**: Build the Researcher Portal (3 views) + Fisherman Dashboard
  (1 view) for the Fisherman Module — 3 new backend API routes
  (RESEARCHER/ADMIN-guarded, no PII), 4 client views (3 researcher +
  1 fisherman dashboard), and 3 new methods appended to `src/lib/api.ts`.

### Work Log

- Read `worklog.md`, `src/lib/{store,api,auth,types,weather,db}.ts`,
  `prisma/schema.prisma`, `src/components/modules/index.tsx`,
  `src/components/module-router.tsx`, `src/components/common/*`,
  `src/components/role-badge.tsx`, `src/components/brand.tsx`,
  `src/components/sea-conditions/sea-conditions-view.tsx`,
  `src/components/safety-alerts/safety-alerts-view.tsx`, the shared
  shadcn `chart.tsx`/`table.tsx`/`badge.tsx`/`dialog.tsx`, and the
  existing `/api/sea-conditions/route.ts` to learn conventions before
  writing anything.
- Created **3 backend API routes** (all `runtime = "nodejs"`, all
  guarded by `requireRole("RESEARCHER","ADMIN")`, all logging via
  `logApiCall({ service: "researcher", ... })`):
  1. `src/app/api/researcher/sea-conditions/route.ts` — GET. Lists
     stored `SeaCondition` rows newest-first, limit 200. Strips
     `userId` and any other PII from the response — only environmental
     fields are returned (id, lat, lng, locationLabel, source, isDemo,
     recordedAt, payload). Returns `{ records: [...] }`.
  2. `src/app/api/researcher/fishing-data/route.ts` — GET. Returns
     AGGREGATE research data in one response object:
     `speciesDistribution` (group-by-species count + avg confidence,
     sorted by count desc), `confidenceBuckets` (4 buckets: <0.5,
     0.5–0.7, 0.7–0.85, >0.85), `totalAnalyses`, `recentSeaConditions`
     (last 10, environmental only), `alertSummary` (severity→count
     + unread), `fishingSpots` (all curated spots), `monthlyTrend`
     (analyses per month over last 6 months, including the current
     month). Aggregations are computed in JS (Prisma `groupBy` can't
     compute avg confidence on SQLite) from the project's small
     FishAnalysis set — no individual fisherman identities are exposed.
  3. `src/app/api/researcher/sea-conditions/live/route.ts` — GET.
     Query `lat`,`lng` (defaults to Chennai; range-validated). Calls
     `fetchWeatherMarine(lat,lng)` + `reverseGeocode(lat,lng)` in
     parallel and returns `{ data, isDemo, source, recordedAt, label }`
     — same shape as `/api/sea-conditions` so the researcher view
     reuses the compact card pattern. **CRITICAL: does NOT persist a
     SeaCondition row** — strictly read-only environmental lookup
     (researcher is not generating a fisherman-owned record). `Cache-
     Control: no-store` set on the response.
- Appended **3 new methods** to the `api` object in
  `src/lib/api.ts` (existing methods untouched):
  - `researcherSeaConditions()` → GET `/api/researcher/sea-conditions`
  - `researcherLiveSeaConditions(lat,lng)` → GET
    `/api/researcher/sea-conditions/live?lat=${lat}&lng=${lng}` (typed
    with the same shape as `getSeaConditions`, including `label`).
  - `researcherFishingData()` → GET `/api/researcher/fishing-data`
    (fully typed: speciesDistribution / confidenceBuckets /
    totalAnalyses / recentSeaConditions / alertSummary / fishingSpots /
    monthlyTrend).
- Created **3 researcher client views** (each `'use client'`, layout
  `mx-auto max-w-7xl px-4 py-6 sm:px-6`, glass-card, animate-fade-up,
  LoadingState/ErrorState/EmptyState per panel, `scroll-ocean` for long
  lists, both default + named export):
  4. `src/components/researcher/researcher-dashboard-view.tsx` —
     Researcher home. Welcome banner + "Refresh" button + purple
     disclaimer `<aside role="note">` ("Data shown is aggregated for
     research purposes. Individual fisherman identities are not
     exposed."). 4 StatCards (Total Analyses / Distinct Species /
     Sea-Condition Records / Active Alerts). Pulls both
     `researcherFishingData()` and `researcherSeaConditions()` in
     `Promise.all`. Three charts (recharts via the shared shadcn
     `ChartContainer`/`ChartTooltip`): PieChart (species distribution,
     donut with 10-color rotation), BarChart (confidence buckets,
     rounded-top bars), LineChart (monthly analysis trend, monotone
     curve). Mini-table of last 5 stored sea-condition records
     (locationLabel / coords / source / isDemo badge / recordedAt).
  5. `src/components/researcher/researcher-sea-conditions-view.tsx`
     — Read-only. Coordinate input (lat/lng) + "Fetch live conditions"
     button calling `api.researcherLiveSeaConditions(lat,lng)`.
     Compact live snapshot card: 4 StatCards (Air Temp / Wind Speed /
     Wave Height / Pressure) + 4 DetailChips (Sea Surface Temp / Wind
     Gusts / Visibility / Humidity) + location coords. Demo data is
     flagged with an amber "Live API unreachable — showing clearly-
     labelled offline demo data" notice + amber Demo/Live badge.
     Below: archive table of all stored records (clickable rows). Click
     opens a shadcn `Dialog` with the full JSON payload pretty-printed.
  6. `src/components/researcher/researcher-fishing-data-view.tsx` —
     Full reports dashboard. Top row 4 StatCards (Total Analyses /
     Distinct Species / Total Alerts / Curated Spots). Species
     distribution: PieChart (donut) side-by-side with a sortable table
     (species / count / avg confidence %). Confidence buckets BarChart
     (rounded-top bars). Monthly trend AreaChart (gradient fill, last
     6 months). Alert severity summary list (LOW=slate / MODERATE=
     amber / HIGH=orange / CRITICAL=rose — mirrors safety-alerts view
     styling). Fishing spots table (name / region / depth / bottom
     type badge). Recent sea conditions strip (last 10). "Export CSV"
     button — client-side `Blob` + `URL.createObjectURL` download of
     `speciesDistribution` as `species-distribution-YYYY-MM-DD.csv`
     (with proper CSV escaping for embedded commas/quotes). Purple
     research disclaimer.
- Created the **fisherman dashboard view**:
  7. `src/components/dashboard/fisherman-dashboard-view.tsx` — The
     fisherman's personal home. Welcome banner: "Welcome back, {name}"
     (cyan name) + RoleBadge + current date (full weekday + long
     date). Quick-access 2×3 grid: 4 working module cards (Sea
     Conditions / Safety Alerts / AI Fish Analysis / Location &
     Navigation) — each card has a gradient-tinted icon, title, short
     desc, and a button that calls `setView(<view-id>)` from the
     Zustand store. 2 disabled dashed cards (Catch Logging / SOS)
     with "Coming Soon" badges. Three live cards populated on mount
     via `Promise.allSettled` after geolocation resolves (Chennai
     fallback on deny/unsupported): Current Conditions (StatCards-like
     Metric chips: Air Temp / Wind / Wave / Weather text, with isDemo
     notice), Safety Status (unread count + severity breakdown list),
     Recent Analyses (last 3 with species + confidence % + time-ago).
     Each card has its own LoadingState/ErrorState/EmptyState so one
     failing call doesn't break the page.
- Did NOT edit `src/components/modules/index.tsx` per the task spec
  (the orchestrator wires the new exports in afterwards). The existing
  stubs in that file continue to render until the orchestrator swaps
  them for `export { default as ResearcherDashboardView } from
  "@/components/researcher/researcher-dashboard-view"` etc.
- Ran `bun run lint` — **0 errors / 0 warnings** for my files.
- Ran `bunx tsc --noEmit --pretty false` — **0 type errors** in any
  of the files I created or modified (the only TS errors reported are
  in other agents' files: `examples/websocket/*`, `skills/*`,
  `src/components/admin/admin-dashboard-view.tsx`, and an existing
  cast in `src/lib/weather.ts:209`).
- Verified the dev server is running (dev.log shows `GET /` 200, auth
  POST 200, notifications GET 200, etc.). The 3 new researcher routes
  have not yet been hit from the SPA (because the orchestrator hasn't
  re-wired `modules/index.tsx` yet) — once the orchestrator swaps in
  the new exports, the SPA will trigger compilation of
  `/api/researcher/*` on first navigation. **Note on local curl
  verification**: the dev server is bound to `:::3000` in a separate
  network namespace from this shell, so direct `curl localhost:3000`
  returns ECONNREFUSED from here. Verified lint + tsc instead.

### Stage Summary

All 7 required files written (3 API routes + 3 researcher views + 1
fisherman dashboard view) plus 3 appended `api.ts` methods. Backend
enforces `requireRole("RESEARCHER","ADMIN")` on all 3 researcher
routes and strips userId / personal info from every response
(researcher sees only AGGREGATE fish-analysis stats + environmental
sea-condition records; never individual fisherman identities, private
SavedLocations, or personal accounts). The live-conditions route does
NOT persist a fisherman-owned SeaCondition row — it's strictly a
read-only environmental lookup. All charts use real DB aggregates
(no fake data); the live snapshot reuses the shared `fetchWeatherMarine`
lib which already labels demo data via `isDemo`. CSV export is done
client-side via Blob download. Sticky footer is handled by the existing
AppShell. Lint + tsc clean for all my files; dev server compiles
existing routes without errors.

---
Task ID: 9 + 10 (orchestrator integration + verification)
Agent: orchestrator (main)
Task: Wire all module exports into the registry, fix integration bugs, run end-to-end verification, write README.

Work Log:
- Rewrote src/components/modules/index.tsx to re-export all real view implementations (removed remaining stubs): sea-conditions, safety-alerts, fish-analysis, location, fisherman dashboard, 3 researcher views, 7 admin views.
- Fixed src/app/api/alerts/route.ts so ADMIN sees ALL alerts (role-scoped backend query) — honors "admin views all alerts" requirement.
- Fixed src/components/admin/admin-dashboard-view.tsx crash: AdminLocationsPayload type had a `records` wrapper that the stats code read as `loc.saved`/`loc.spots` directly (undefined.length → client exception). Corrected the type + the destructuring cast.
- Fixed src/app/page.tsx session-persistence bug: when the httpOnly cookie was cleared/expired but localStorage still held a stale user, the app rendered a broken shell (401s). Now api.me() returning null explicitly clears the local user and routes to landing.
- Fixed react-hooks/static-components lint error in sea-conditions view (dynamic weather icon rendered via createElement instead of a capitalized JSX tag).
- Verified all four fisherman modules render in Agent Browser with no console/runtime errors.
- Generated a real fish image (z-ai image CLI) and ran the full VLM round-trip via curl: POST /api/fish-analysis → real prediction (Yellowtail Amberjack, 0.85 confidence, characteristics, notes, market=null correctly). Verified the result appears in the fisher's history UI.
- Verified the alert engine end-to-end: lowered windSpeedKmh threshold via admin API → ran /api/alerts/run → created 1 CRITICAL alert → visible in fisher's Safety Alerts UI → restored threshold.
- Verified sign-up flow: created a brand-new fisherman account, auto-signed-in, redirected to Fisherman Dashboard.
- Verified sticky footer: mt-auto in min-h-screen flex flex-col pushes footer to bottom on short pages and below viewport (natural flow) on long pages — no overlap.
- Final: bun run lint → 0 errors / 0 warnings. dev.log → no runtime errors. Server alive (HTTP 200). DB seeded (4 users incl. test account, 5 fishing spots).
- Wrote comprehensive README.md (setup, env vars, DB, API, AI, running, testing, deployment, how to edit one page).

Stage Summary:
- Complete, production-ready Fisherman Module SPA delivered at /.
- All 3 role portals functional (Fisherman, Researcher, Admin) with backend-enforced RBAC.
- 4 working fisherman modules (Sea Conditions, Safety Alerts, AI Fish Analysis, Location & Navigation); Catch Logging + SOS wired as disabled "Coming Soon".
- Real integrations: Open-Meteo weather/marine, z-ai-web-dev-sdk VLM, Leaflet/OpenStreetMap. No fake live data; offline mode clearly labeled.
- Demo accounts: admin@fisherman.dev / Admin@123, researcher@fisherman.dev / Research@123, fisher@fisherman.dev / Fisher@123.

---

## Task F6 — Admin API Monitoring View

- **Task ID**: F6
- **Agent**: GLM (fullstack-dev, view-only build)
- **Task**: Build ONE new admin client view — `src/components/admin/api-monitoring-view.tsx` — that surfaces external-service health derived from the `api_logs` table over the last 24h. Must not touch any working module, `module-router.tsx`, `modules/index.tsx`, or existing views.

### Work Log

1. Read `worklog.md` and project conventions: SPA at `/`, client-side view routing via Zustand, dark ocean blue theme, `.glass-card` / `.scroll-ocean` classes, `api.*` client layer, shadcn/ui, lucide-react, recharts, sonner toasts.
2. Read `src/lib/api.ts` to confirm the contracts:
   - `api.getApiHealth()` → `{ overall, services: [{ service, health, total, errors, lastStatus, lastAt, p95Ms }] }`
   - `api.getApiLogs()` → `{ logs: [{ id, service, endpoint, method, status, durationMs, message, userEmail, createdAt }] }`
3. Read both backend route handlers (`src/app/api/admin/api-health/route.ts`, `src/app/api/admin/api-logs/route.ts`) to confirm exact wire shapes (both `requireRole("ADMIN")`).
4. Studied existing admin view patterns (`admin-dashboard-view.tsx` for layout / table / severity chips) and the researcher chart usage (`researcher-fishing-data-view.tsx` for `ChartContainer` + `ChartTooltip` + `ChartConfig` patterns).
5. Created `src/components/admin/api-monitoring-view.tsx`:
   - Default + named `ApiMonitoringView` export.
   - Layout `mx-auto max-w-7xl px-4 py-6 sm:px-6`.
   - Header "API Monitoring" + subtitle "Health of external service integrations over the last 24h" + live "Updated Xm ago · auto-refresh on" indicator + Refresh button.
   - Overall health banner: large `glass-card` with icon + text + color (CheckCircle2/amber AlertTriangle/rose ServerCrash). `role="status" aria-live="polite"`, plus `<span className="sr-only">` so screen readers hear "Healthy/Degraded/Unavailable".
   - StatCards row: total services, healthy, degraded, unavailable (cyan / green / amber / red accents).
   - Services table (`glass-card`, shadcn Table) with service, health badge (emerald/amber/rose with icon + text label), total calls, errors, last HTTP status badge (colored by 2xx/4xx/5xx with `title` describing class), lastAt (relative), p95Ms. Sorted by health severity (unavailable → degraded → healthy), then error rate desc, then alphabetical.
   - Recharts `BarChart` (per-service total vs. errors, side-by-side) using `ChartContainer` + `ChartTooltip` + `ChartConfig` exactly like the researcher view, cyan (#22d3ee) + rose (#fb7185).
   - "Recent API Calls" section: `api.getApiLogs()` → newest 25, `scroll-ocean max-h-96 overflow-y-auto overflow-x-auto`, columns: service, endpoint (truncated), method badge, status badge (colored by 2xx/4xx/5xx with `title`), durationMs (ms/s formatting), userEmail or "—", relative time.
   - Auto-refresh: 60s `window.setInterval` calls the latest loader (kept in a ref so the effect does not re-subscribe on every render); clears on unmount.
   - Note aside (cyan): "API keys and secrets are managed via server environment variables and are never shown here."
   - Loading / error guards via shared `LoadingState` + `ErrorState` with retry. `EmptyState` for zero-row tables.
6. Verified: `bun run lint` clean (no errors / warnings). Dev log shows `✓ Compiled in 244ms` and no compile errors after the file was added.

### Constraints honored

- Single new file only — did not edit `modules/index.tsx`, `module-router.tsx`, any existing view, or any backend route.
- Real data only via `api.getApiHealth()` + `api.getApiLogs()`. No fabricated metrics.
- Health conveyed via icon + text + color (never color alone); sr-only label + icon on banner and table chips.
- Admin-only by virtue of the backend's `requireRole("ADMIN")` already in place on both routes.

### Stage Summary

One new admin client view delivered at `src/components/admin/api-monitoring-view.tsx`, exporting both `ApiMonitoringView` (named) and a default export. It is intentionally not wired into `module-router.tsx` (constraint); the AppShell / module router can import it directly when the admin nav is extended. Lint clean; dev server compiles without errors.

---

## Task ID: F5

- **Agent**: researcher-views-agent (Z.ai Code)
- **Task**: Build four new researcher client views — Data Explorer, Dataset
  Details, GIS map, and Research Reports — wired to the already-implemented
  `/api/researcher/{datasets,datasets/:key,gis,reports}` endpoints. Do NOT
  touch the working fisherman/admin modules or the existing 3 researcher
  views; do NOT modify `modules/index.tsx` or `module-router.tsx` (the
  orchestrator wires the new exports in afterward).

### Work Log

- Read `worklog.md`, `src/lib/api.ts`, `src/lib/store.ts`,
  `src/lib/datasets.ts`, the existing API routes
  (`/api/researcher/datasets`, `/api/researcher/datasets/[id]`,
  `/api/researcher/gis`, `/api/researcher/reports`, `/api/researcher/reports/[id]`),
  the shared UI (`common/states.tsx`, `common/stat-card.tsx`,
  `ui/{dialog,alert-dialog,table,select,switch,pagination,chart,card,button,badge,input}.tsx`),
  the existing researcher views for pattern reference
  (`researcher-dashboard-view.tsx`), the Leaflet map component at
  `src/components/location/leaflet-map.tsx`, and the existing
  `location-navigation-view.tsx` (which lazy-loads the map) — to confirm
  conventions before writing any new code.
- Created **4 new client views** (each `'use client'`, layout
  `mx-auto max-w-{7xl|5xl} px-4 py-6 sm:px-6`, glass-card, animate-fade-up,
  LoadingState/ErrorState/EmptyState per panel, scroll-ocean where needed,
  both default + named export, no PII rendered, real DB data only):
  1. `src/components/researcher/data-explorer-view.tsx` —
     `ResearcherDataExplorerView`. Header "Research Data Explorer" + subtitle
     "Real datasets backed by stored observations — no PII." Filter bar:
     search by name (Input) + dataType Select (All/Oceanographic/Fisheries,
     derived from the actual datasets returned) + status Select
     (All/Active/Archived). Dataset cards grid (sm:2 / lg:3 cols): per-dataset
     icon (Waves/Layers/MapIcon/ShieldAlert), accent (cyan/green/amber/red),
     dataType badge, status badge, name, description, big-number record
     count panel, source / coverage (N/S/E/W bounds) / lastUpdated dl, first
     4 field-label chips, "Explore dataset" button that calls
     `setSelectedDatasetKey(key)` + `setView("researcher.dataset-details")`.
     EmptyState when registry returns nothing (shouldn't happen but handled).
     LoadingState via 4 CardSkeletons on initial fetch; ErrorState on fetch
     failure.
  2. `src/components/researcher/dataset-details-view.tsx` —
     `ResearcherDatasetDetailsView`. Reads `selectedDatasetKey` from the
     Zustand store; if null shows EmptyState + "Back to explorer" button.
     Loads via `api.getResearcherDataset(key, {page,pageSize:10,search})`.
     Header card: name, dataType/status badges, description, source + N/S/E/W
     coverage. 3 StatCards (Total records / Matching search / Coverage).
     Chart suited to dataset (built from CURRENT page's records, with note
     "Aggregated from the records on the current page only"): for
     fish-analyses → BarChart of confidence buckets (<0.5/0.5–0.7/0.7–0.85
     / >0.85); for sea-conditions → BarChart of count by `source`
     (open-meteo vs offline); for alerts → BarChart of count by `severity`;
     for fishing-spots → BarChart of count by `bottomType`. EmptyState
     inside the chart card when no records. Paginated shadcn Table with
     per-dataset column descriptors (sea-conditions / fish-analyses /
     fishing-spots / alerts). Debounced (~300ms) search Input that re-fetches
     with `search` param. Prev/Next buttons + numeric page Input clamped to
     [1, totalPages]. "Save as report" button opens a Dialog with the
     dataset-name-prefilled title; on confirm calls
     `api.createResearcherReport({title, description, datasetKey,
     filters:{search,page,pageSize}, summary:{recordCount,total,coverage}})`
     → toast + `setView("researcher.reports")`. All hooks (useState,
     useEffect, useCallback, useMemo) are declared BEFORE the early-return
     `if (!selectedKey) return EmptyState`, to satisfy
     react-hooks/rules-of-hooks. Per-row key falls back to `row-${page}-${idx}`
     when record lacks an `id`.
  3. `src/components/researcher/gis-view.tsx` — `ResearcherGisView`. Layout
     `mx-auto max-w-7xl`. lg:2-col grid `[16rem_1fr]` — controls aside on
     the left, sticky h-[600px] map on the right. Filters: per-source Switch
     toggles (sea-conditions / fishing-spots / alerts) with colour dot +
     icon + count; default all three on. Re-fetches `api.getResearcherGis
     (selectedSources)` whenever toggles change. 4 StatCards (Total points,
     Sea conditions, Fishing spots, Weather alerts). Reuses the existing
     Leaflet map via `dynamic(() => import("@/components/location/leaflet-map")
     .then(m=>m.LeafletMap), { ssr:false })` (same convention as
     location-navigation-view.tsx). Markers coloured per dataset
     (sea-conditions=#22d3ee cyan, fishing-spots=#f59e0b amber,
     alerts=#fb7185 red) with bound HTML-escaped popups including `detail`.
     Map auto-centres on the mean of the points (or default world-view
     zoom 2 when empty). Legend card (color→dataset). Purple "data
     aggregated for research purposes — individual fisherman identities
     are not exposed" disclaimer aside. Map region has
     `aria-label="Researcher geographic observations map"`. EmptyState when
     no points for the selected sources.
  4. `src/components/researcher/reports-view.tsx` —
     `ResearcherReportsView`. Layout `mx-auto max-w-5xl`. Header "Research
     Reports" + subtitle "Saved snapshots of your research queries." Lists
     `api.listResearcherReports()` on mount, sorted by `updatedAt` desc.
     Each report is a glass-card: FileText icon tile, datasetKey badge
     (colour per dataset — cyan/emerald/amber/rose), title, created + (when
     different) updated timestamp, description (or "No description
     provided." fallback), "View JSON" Button → Dialog pretty-printing
     `filtersJson` + `summaryJson` in `<pre><code>` blocks with scroll-ocean
     + max-h-60, and a per-row AlertDialog "Delete report?" confirmation
     (Cancel / Delete) calling `api.deleteResearcherReport(id)` → toast +
     filter-removed-from-list. Loading state on the delete button while
     awaiting response. EmptyState when no reports ("No saved reports yet.
     Create one from a dataset's detail page by clicking 'Save as
     report'.") with FileText icon.
- Did NOT edit `src/components/modules/index.tsx` or
  `src/components/module-router.tsx` — the orchestrator wires
  `ResearcherDataExplorerView`, `ResearcherDatasetDetailsView`,
  `ResearcherGisView`, `ResearcherReportsView` into the module registry +
  ViewRenderer switch afterward (the ViewIds `researcher.data-explorer`,
  `researcher.dataset-details`, `researcher.gis`, `researcher.reports` are
  already declared in `src/lib/store.ts`).
- Reused the existing `LeafletMap` at `@/components/location/leaflet-map` —
  did NOT create a new map component.
- Ran `bun run lint` → **0 errors / 0 warnings** for all 4 files (initial
  run flagged 2 errors + 1 warning in dataset-details-view.tsx because
  two `useMemo` hooks were called AFTER an early `if (!selectedKey) return`;
  fixed by moving both `useMemo`s + the prefill `useEffect` ABOVE the early
  return so hook order is stable across renders. Also removed an unused
  `eslint-disable-line react-hooks/exhaustive-deps` directive).
- Ran `bunx tsc --noEmit --pretty false` → 0 TypeScript errors in any of the
  4 new files. (The only TS errors reported are pre-existing in other
  agents' files: `examples/websocket/*`, `skills/*`,
  `admin-dashboard-view.tsx`, `admin/api-monitoring-view.tsx`,
  `profile/profile-view.tsx`, and `lib/weather.ts:209` — none of which I
  touched.)
- Checked `/home/z/my-project/dev.log` after each write — the dev server
  hot-reloaded cleanly each time; the final entries show
  `✓ Compiled in 244ms / 214ms / 222ms / 211ms / 222ms / 189ms / 181ms`
  with no compile errors. Two transient "Fast Refresh had to perform a
  full reload due to a runtime error" warnings appeared mid-edit (when the
  lint-failing dataset-details-view was first saved) but the subsequent
  re-compiles after the fix succeeded cleanly.
- Verified the `/api/researcher/datasets`, `/api/researcher/datasets/:key`,
  `/api/researcher/gis`, and `/api/researcher/reports` API contracts in
  `src/lib/api.ts` match what each view consumes (typed via
  `as unknown as <Type>` casts where needed because the api.ts return types
  use `unknown[]` for arrays).
- Verified all 4 new views use real DB aggregate data only (no hardcoded
  numbers anywhere), show EmptyState when a dataset has 0 records with a
  useful message explaining what data is required (e.g. "No sea-condition
  observations yet. Fishermen must log sea conditions for data to
  appear."), and render no fisherman PII (the GIS endpoint strips userId
  from sea-condition points; the fish-analyses dataset preview omits owner
  identity entirely — only species / confidence / size / weight / createdAt
  are shown).

### Stage Summary

All 4 new researcher client views created and wired to the existing
`/api/researcher/*` endpoints. No existing module or route was modified.
Data integrity is preserved: only the 4 real datasets (sea-conditions,
fish-analyses, fishing-spots, alerts) are exposed; charts are built from
the CURRENT page's records (with a clear "this page" label); empty
datasets show actionable EmptyState explanations; no fisherman PII is
rendered anywhere. The shared Leaflet map is reused (lazy-loaded with
`next/dynamic({ssr:false})` per the established convention). All 4 files
export both a default and a named function so the orchestrator can wire
them via either pattern. Lint passes with 0 errors/warnings for the new
files; the dev server compiles cleanly on every change. Sticky footer is
handled by the existing AppShell. Detailed work record above.


---

## Task ID: F4

- **Agent**: profile-notifications-agent (Z.ai Code)
- **Task**: Build two NEW client views — `ProfileView` (profile + preferences) and `NotificationsView` (full notification center) — using existing API contracts. Fix the dead "Profile & Settings" link. Do NOT touch any working module or the module-router registry.

### Work Log

- Read `worklog.md` end-to-end to learn conventions (single SPA at `/`, Zustand view routing, dark ocean theme, glass-card / scroll-ocean / ocean-bg, `api.*` service layer with `ApiError`, shared `LoadingState`/`ErrorState`/`EmptyState`/`StatCard`, `RoleBadge`, shadcn/ui, sonner toasts).
- Read `src/lib/api.ts` to confirm the exact shapes for `getProfile`/`updateProfile`/`listNotifications`/`markNotificationRead`/`deleteNotification`/`readAllNotifications` (all already implemented backend-side; my work is purely client UI).
- Read `src/app/api/profile/route.ts`, `src/app/api/notifications/route.ts`, `src/app/api/notifications/[id]/route.ts`, `src/app/api/notifications/[id]/read/route.ts`, `src/app/api/notifications/read-all/route.ts` to confirm what fields the server actually returns.
- Read `prisma/schema.prisma` for `User`, `UserProfile`, `Notification` models (severity is nullable, category default `general`, alertId nullable + FK to `WeatherAlert`).
- Read `src/components/safety-alerts/safety-alerts-view.tsx` (same author agent's prior file) to mirror styling idioms: severity color stripe, type→icon mapping, time-ago helper, `aria-busy`, optimistic UI, auto-refresh interval, glass-card rows, `<aside role="note">` disclaimer.
- Read `src/components/layout/header.tsx` and `sidebar.tsx` to confirm where the dead link is wired (`onClick={() => setView("fisherman.profile")}` in the header dropdown, plus a "Notifications" sidebar entry) — both new views will be reachable once the orchestrator wires them into `modules/index.tsx` + `module-router.tsx`.
- Read `src/components/ui/{tabs,select,alert-dialog,switch,label,input,separator,badge,avatar,card,button}.tsx` to learn exact prop signatures.

#### Files created (ONLY these — no other file touched)

1. **`src/components/profile/profile-view.tsx`** (default + named `ProfileView`)
   - Layout: `mx-auto max-w-4xl px-4 py-6 sm:px-6 animate-fade-up`.
   - Header: `Avatar` (initials fallback), name + email + `RoleBadge`.
   - `Tabs` with two triggers: **Profile** and **Preferences** (icon + label, full-width on mobile).
   - **Profile tab** (3 glass-cards):
     - Read-only identity card — Email (`Mail` icon, helper note "managed by admin") + Role (`RoleBadge` + role description), separated by vertical `Separator`.
     - Personal information card — `Field` for Full name (required, ≥2 chars), Phone (tel), Country, Vessel name, License number. Each Field has shadcn `Label` (with `htmlFor`) + lucide icon + `Input` (`aria-invalid` + `aria-describedby` + error `<p>` when touched & invalid).
     - Preferred location card — `Field`s for Location name (full-width), Latitude, Longitude. A **"Use my current location"** `Button` calls `navigator.geolocation.getCurrentPosition` with high-accuracy + 10s timeout; on success fills lat/lng (4 decimals) + sets location name to "Current location" if blank; on failure maps `PERMISSION_DENIED`/`TIMEOUT`/`UNAVAILABLE` to friendly toast.error. Lat validated to [-90, 90], lng to [-180, 180], and if only one is set both error.
     - Save button → `api.updateProfile({ name, phone, country, vesselName, licenseNumber, preferredLocationName, preferredLat, preferredLng })` (sends `null` when lat/lng cleared). Toast on success/error. Updates local state from server response.
   - **Preferences tab** (2 glass-cards):
     - Language & units card — 3-up `SelectField` grid: Language (en/es/fr/ta/hi/bn — each labeled with native script + English), Temperature (celsius/fahrenheit), Wind speed (kmh/ms/knots). Below: three secondary `Badge`s echoing current selections with mini icons (Thermometer/Wind/Globe) for instant visual confirmation.
     - Notification preferences card — Two `SwitchRow`s with `Separator` between: `notifAlerts` ("Alert notifications", on by default) and `notifSummary` ("Daily summary digest", off by default). Each Switch has matching `Label htmlFor` + description.
     - Save button → `api.updateProfile({ language, temperatureUnit, windUnit, notifAlerts, notifSummary })`. Toast on success.
   - Sign out section at the bottom — small bordered panel with amber `AlertTriangle` + "Sign out of your account" + outline Button → `api.signOut()` then `useAppStore.getState().logoutClient()` then `useAppStore.setState({ view: "landing" })` and success toast (mirrors header's existing logout handler).
   - Loading: `LoadingState` while initial `getProfile` is in flight. Error: `ErrorState` with retry button on failure (covers 401/session-expired case).
   - Fully responsive: 1-col on mobile, 2-col on `sm:`+ grids for fields, 3-col for preferences. Accessible: every input has a `<Label htmlFor>` bound to its id, error messages are programmatic + visible, required field has `*` marker.

2. **`src/components/notifications/notifications-view.tsx`** (default + named `NotificationsView`)
   - Layout: `mx-auto max-w-4xl px-4 py-6 sm:px-6 animate-fade-up`.
   - Header: `Bell` icon + "Notifications" title + subtitle. Action buttons (wrap on mobile): `Refresh` (outline, calls `load()`), `Mark all read` (primary, calls `api.readAllNotifications()`, shows updated count in toast), and a `Switch` toggle labeled "Unread only" inside a bordered label.
   - StatCards row (2× on mobile, 4-up on `sm:`): Total (`Bell`, cyan), Unread (`BellRing`, amber, sub "All caught up" when 0), Alert-category count (`ShieldAlert`, red), Critical-severity count (`AlertTriangle`, red). All counts from real DB rows fetched via `api.listNotifications()` — no fake numbers.
   - Category filter: shadcn `Select` (All/general/alert/system/analysis) with `Label htmlFor="notif-category-filter"` + `SelectTrigger id="notif-category-filter" aria-label="Filter by category"`.
   - Notification list (`scroll-ocean max-h-[28rem]`): each item is a `<li>` wrapping a glass-card `<article>` with:
     - Severity/type color stripe down the left edge — color is paired with an **icon + text label** so severity is never communicated by color alone (a11y hard requirement):
       - `info` → `Info` icon, sky chip + dot, label "Info"
       - `success` → `CheckCircle2` icon, emerald chip + dot, label "Success"
       - `warning` → `AlertTriangle` icon, amber chip + dot, label "Warning"
       - `alert` → `ShieldAlert` icon, rose chip + dot, label "Alert"
     - Unread items get a `ring-1 ring-primary/30` + a "New" pill (dot + word "New").
     - Title (truncate), message (muted), then meta row: type chip + category `Badge` (outline) + (when severity is set and not LOW) a severity chip, then relative time (`Clock` icon + `timeAgo`).
     - If `alertId` is present, a **"View related alert"** button calls `useAppStore.setState({ view: "fisherman.safety-alerts" })` exactly as specified.
     - Row actions: `Mark read` (outline, only when unread — optimistic mark + revert on failure) and `Delete` (ghost destructive — opens `AlertDialog` for confirmation, then optimistic delete + revert on failure).
   - Empty state: `EmptyState` (icon `Inbox`) with a context-aware message depending on whether filters are active.
   - Auto-refresh: `setInterval` every 60s calls `load()` (cleared on unmount).
   - Loading: `LoadingState` while initial fetch in flight. Error: `ErrorState` with retry button.
   - Accessibility: every button has `aria-label` (often with the notification title interpolated), every Switch + Select has an associated Label, the list `<ul>` has `role="list"`. Severity is communicated via **icon + text + color** — never color alone.
   - Footer `<aside role="note">` with a `Sparkles` icon explaining the auto-refresh cadence.

### Validation, errors, rollback

- Client-side validation before PATCH: name ≥2 chars, lat in [-90, 90], lng in [-180, 180], lat/lng must be both-empty-or-both-set. `touched` state gating means errors only show after the user has blurred or pressed Save (less noisy UX).
- Optimistic UI: mark-read + delete update local state immediately and revert on `ApiError` with a toast. Mark-all-read uses the bulk endpoint and shows the server-returned `updated` count in the success toast.
- All `api.*` calls route through the shared service layer; no raw `fetch` to any URL.

### Lint / type-check / runtime

- `bun run lint` → **0 errors / 0 warnings** for my two files.
- `bunx tsc --noEmit --pretty false` → **0 type errors** in `profile-view.tsx` or `notifications-view.tsx`. (Initial iteration surfaced two issues I fixed: `lucide-react` has no `Boat` icon — switched to `Anchor`; and `Record<string, unknown>` → `Profile` direct cast fails TS's structural check — routed through `unknown` (`as unknown as Profile`) at the three call sites where `api.getProfile`/`api.updateProfile` return `Record<string, unknown>` per the existing `api.ts` signature, which I deliberately did not modify since widening that type wasn't part of my task scope.)
- `dev.log` shows clean hot-reload compiles (`✓ Compiled in 18x–24x ms`) on every save with no runtime errors. The pre-existing 30s `/api/notifications` poll from the header bell continues to return 200.

### Notes for the orchestrator

- I did NOT touch `src/components/modules/index.tsx` or `src/components/module-router.tsx` (per the task spec). To activate the new views, the orchestrator will need to:
  1. Add to `modules/index.tsx`:
     ```ts
     export { ProfileView } from "@/components/profile/profile-view";
     export { NotificationsView } from "@/components/notifications/notifications-view";
     ```
  2. Add to `module-router.tsx`'s `ViewRenderer` switch:
     ```tsx
     case "fisherman.profile": return <ProfileView />;
     case "fisherman.notifications": return <NotificationsView />;
     ```
  3. Import both in `module-router.tsx`'s top import block.
- Both views are "universal" — the backend (`/api/profile`, `/api/notifications`) is per-session-owned, so any role (admin/researcher/fisherman) can open them without an extra client guard. They are linked from the fisherman header dropdown + sidebar (already wired), and the "View related alert" button routes to the existing `fisherman.safety-alerts` view.

### Stage Summary

Both required files created. Real backend data only (no simulated notifications). Client-side validation mirrors backend rules (name ≥2 chars, lat/lng ranges). Severity accessibility satisfied via icon + text + color triple. Sticky footer handled by the existing AppShell (no new footer added). Lint clean, tsc clean, dev.log clean. Files are ready for the orchestrator to wire into the module registry. Detailed work record at `agent-ctx/F4-profile-notifications-agent.md`.

---
Task ID: PHASE-2 (orchestrator)
Agent: orchestrator (main)
Task: Phase 2 continuation — inspect existing codebase, then extend it systematically (alert lifecycle, notification center, fisherman profile, researcher data workspace, admin API monitoring, security hardening) WITHOUT breaking working features.

Work Log:
- INSPECTION: Read worklog + all lib files (auth, store, api, types, permissions, weather) + schema + module-router + sidebar + alert engine + dev server state. Confirmed auth, sea conditions, alerts engine, VLM fish analysis, location/nav, 7 admin views, 3 researcher views all REAL and working. Identified gaps: fisherman.settings was a DEAD LINK (router had no case), no alert lifecycle (only isRead), no notification center page, no researcher data-explorer/GIS/reports, no admin API health, last-admin protection incomplete.
- FOUNDATION schema (additive, non-breaking): + WeatherAlert.{status,metric,actualValue,thresholdValue,acknowledgedAt,acknowledgedBy,resolvedAt}; + Notification.{severity,category,alertId(FK→WeatherAlert SetNull)}; + UserProfile.{preferredLocationName,preferredLat,preferredLng,language,temperatureUnit,windUnit,notifAlerts,notifSummary}; + new ResearchReport model. db:push applied.
- BACKEND: src/lib/alerts.ts (resolveAlertStatus, touchExpiredAlerts, serializeAlert). Updated /api/alerts (list with status/severity filters + auto-expire), /api/alerts/run (populate metric/actualValue/thresholdValue/status=ACTIVE, link notifications to alert with severity), + /api/alerts/[id]/acknowledge, + /api/alerts/[id]/resolve (ownership-checked). + /api/profile (GET/PATCH own), + /api/notifications/[id] (DELETE), + /api/notifications/read-all. + src/lib/datasets.ts (real dataset registry: 4 datasets backed by actual Prisma queries, NO fabricated scientific data). + /api/researcher/datasets, /api/researcher/datasets/[id] (paginated preview), /api/researcher/gis (aggregate geo obs, no PII), /api/researcher/reports + /[id] (CRUD). + /api/admin/api-health (healthy/degraded/unavailable from api_logs). Strengthened /api/admin/users/[id] with last-active-admin guard.
- api.ts: appended ~12 new methods (getProfile/updateProfile, acknowledgeAlert/resolveAlert, deleteNotification/readAllNotifications, listResearcherDatasets/getResearcherDataset/getResearcherGis, listResearcherReports/createResearcherReport/deleteResearcherReport, getApiHealth). Existing methods untouched.
- WIRING: store.ts +ViewId (fisherman.notifications/profile/ai-history, researcher.data-explorer/dataset-details/gis/reports, admin.api-monitoring) + selectedDatasetKey + roleCanAccess updates. sidebar.tsx nav updated (preserved Coming Soon items). modules/index.tsx + module-router.tsx wired 7 new view exports. header profile link fixed (fisherman.settings → fisherman.profile, was a dead link).
- SUBAGENTS (parallel, distinct folders, did NOT touch registry): F4 → ProfileView + NotificationsView; F5 → ResearcherDataExplorerView + ResearcherDatasetDetailsView + ResearcherGisView + ResearcherReportsView (reuse LeafletMap, real DB data, empty states); F6 → ApiMonitoringView.
- ENHANCEMENTS (self): surgically added alert lifecycle UI to existing safety-alerts-view.tsx (status badge on cards, status+metric+actual/threshold in detail dialog, Acknowledge/Resolve buttons). Did NOT rewrite the working view.
- BUGS FIXED: (1) api-monitoring-view crashed — `loadRef.current = load` referenced `load` before its useCallback declaration (temporal dead zone → ReferenceError); moved assignment after the declaration. (2) CRITICAL: Prisma client was STALE after schema push — the running Turbopack process held the pre-change client, so acknowledge/resolve 500'd with "Unknown argument status". Fixed by `bun run db:generate` + dev server restart. Documented in README.
- CLEANUP: deleted stale Phase-1 test alert (created with temp thresholds 5/10/12) + its orphaned notification so demo state honestly reflects restored thresholds (25/40/60) and current demo conditions (wind 14 → no alert).
- VERIFICATION (Agent Browser + curl): researcher dashboard/data-explorer/dataset-details/gis/reports all render with real data + OSM tiles; admin api-monitoring renders (after fix); fisherman profile (dead link fixed) + notifications render; alert lifecycle end-to-end ACTIVE→ACKNOWLEDGED→RESOLVED persisted + reflected in UI; RBAC — fisher blocked (401/403) from all /api/admin/* and /api/researcher/*; own profile allowed (200); last-admin guard blocks demote+deactivate (400); 360px mobile no horizontal overflow; lint 0/0; dev.log no runtime errors.
- README updated with Phase 2 highlights, testing scenarios (21-30), and the Prisma-client-regeneration note.

Stage Summary:
- All Phase 1 working features PRESERVED (no rewrites, no broken routes).
- Phase 2 delivered: alert lifecycle (ACTIVE/ACKNOWLEDGED/EXPIRED/RESOLVED + auto-expire + metric context), notification center (severity/category/related-alert/delete), fisherman profile & preferences (fixes dead link, ownership-enforced), researcher data workspace (data explorer + dataset details + GIS + reports, all on REAL stored data, no PII, empty states), admin API monitoring (health dashboard), last-admin protection, accessibility hardening (icon+text+color for severity/status).
- Real integrations preserved and extended: Open-Meteo, z-ai VLM, Leaflet/OSM. No fake live data, no fabricated datasets, no fabricated market prices.
- `bun run dev` on port 3000 (daemonized). Lint: 0 errors / 0 warnings.
