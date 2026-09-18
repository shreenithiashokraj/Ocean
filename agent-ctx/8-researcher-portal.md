# Task 8 — Researcher Portal + Fisherman Dashboard

- **Agent**: researcher-portal-agent (Z.ai Code)
- **Task**: Build the Researcher Portal (3 views) + Fisherman Dashboard
  (1 view) for the Fisherman Module — 3 new backend API routes
  (RESEARCHER/ADMIN-guarded, no PII), 4 client views (3 researcher +
  1 fisherman dashboard), and 3 new methods appended to `src/lib/api.ts`.

## Files created

### Backend API routes (`runtime = "nodejs"`, guarded by `requireRole("RESEARCHER","ADMIN")`)

1. `src/app/api/researcher/sea-conditions/route.ts` — GET. Lists stored
   `SeaCondition` rows newest-first, limit 200. Strips `userId` and any
   other PII from the response — only environmental fields are returned
   (id, lat, lng, locationLabel, source, isDemo, recordedAt, payload).
   Returns `{ records: [...] }`. Logs via `logApiCall({ service: "researcher", ... })`.
2. `src/app/api/researcher/fishing-data/route.ts` — GET. Returns
   AGGREGATE research data in one response object:
   - `speciesDistribution`: `[{species, count, avgConfidence}]` grouped
     over all FishAnalysis rows (species not null), sorted by count desc.
   - `confidenceBuckets`: `[{bucket, count}]` (4 buckets: <0.5,
     0.5–0.7, 0.7–0.85, >0.85).
   - `totalAnalyses`: number.
   - `recentSeaConditions`: last 10 SeaCondition records (no userId).
   - `alertSummary`: `[{severity, count, unread}]` from WeatherAlert.
   - `fishingSpots`: all FishingSpot rows (curated, environmental).
   - `monthlyTrend`: `[{month, analyses}]` over last 6 months.
   Aggregations computed in JS (Prisma `groupBy` can't compute avg
   confidence on SQLite) from the project's small FishAnalysis set.
3. `src/app/api/researcher/sea-conditions/live/route.ts` — GET. Query
   `lat`,`lng` (defaults to Chennai; range-validated). Calls
   `fetchWeatherMarine(lat,lng)` + `reverseGeocode(lat,lng)` in parallel
   and returns `{ data, isDemo, source, recordedAt, label }` — same
   shape as `/api/sea-conditions` so the researcher view reuses the
   compact card pattern. **CRITICAL: does NOT persist a SeaCondition
   row** — strictly read-only environmental lookup. `Cache-Control:
   no-store` set.

### Client views (`'use client'`, layout `mx-auto max-w-7xl px-4 py-6 sm:px-6`, glass-card, animate-fade-up, LoadingState/ErrorState/EmptyState, scroll-ocean, default + named export)

4. `src/components/researcher/researcher-dashboard-view.tsx` — Researcher
   home. Welcome banner + Refresh button + purple disclaimer. 4
   StatCards. Pulls `researcherFishingData()` + `researcherSeaConditions()`
   in `Promise.all`. PieChart (species), BarChart (confidence), LineChart
   (monthly trend). Mini-table of last 5 stored sea-condition records.
5. `src/components/researcher/researcher-sea-conditions-view.tsx` —
   Read-only. Coordinate input + "Fetch live conditions" button calling
   `api.researcherLiveSeaConditions(lat,lng)`. Compact live snapshot card
   (4 StatCards + 4 DetailChips). Demo notice when offline. Below:
   archive table of stored records; click row → Dialog with parsed JSON
   payload.
6. `src/components/researcher/researcher-fishing-data-view.tsx` — Full
   reports dashboard. 4 StatCards. Species distribution PieChart +
   sortable table. Confidence buckets BarChart. Monthly trend AreaChart
   (gradient fill). Alert severity summary list (mirrors safety-alerts
   severity styling). Fishing spots table. Recent sea conditions strip.
   "Export CSV" button — client-side `Blob` + `URL.createObjectURL`
   download of `speciesDistribution` (with proper CSV escaping).
7. `src/components/dashboard/fisherman-dashboard-view.tsx` — Fisherman's
   personal home. Welcome banner (name + RoleBadge + current date).
   Quick-access 2×3 grid: 4 working module cards (Sea Conditions /
   Safety Alerts / AI Fish Analysis / Location & Navigation) → each
   calls `setView(<view-id>)` from Zustand. 2 disabled dashed cards
   (Catch Logging / SOS) with "Coming Soon" badges. Three live cards
   populated on mount via `Promise.allSettled` after geolocation
   resolves (Chennai fallback): Current Conditions / Safety Status /
   Recent Analyses. Per-card Loading/Error/Empty state.

### Shared lib edit (append-only)

`src/lib/api.ts` — appended 3 new methods to the `api` object (existing
methods untouched):
- `researcherSeaConditions()` → GET `/api/researcher/sea-conditions`
- `researcherLiveSeaConditions(lat, lng)` → GET `/api/researcher/sea-conditions/live?lat=${lat}&lng=${lng}`
- `researcherFishingData()` → GET `/api/researcher/fishing-data` (fully typed return shape)

## Behavior rules honored

- Researcher sees ONLY aggregate fish-analysis stats + environmental
  sea-condition records. Backend strips `userId` from every response.
- The live-conditions route does NOT persist a fisherman-owned
  SeaCondition row — strictly read-only environmental lookup.
- All charts use real DB aggregates (no fake data). The live snapshot
  reuses the shared `fetchWeatherMarine` lib which already labels demo
  data via `isDemo`.
- CSV export is done client-side via Blob download.
- Sticky footer is handled by the existing AppShell.
- `Cache-Control: no-store` set on live responses.

## Verification

- `bun run lint` → **0 errors / 0 warnings** for my files.
- `bunx tsc --noEmit --pretty false` → **0 type errors** in any of the
  files I created or modified (other agents' files still have pre-existing
  type errors I did not touch).
- Dev server is running; existing routes still serve 200 with no compile
  errors. The 3 new researcher routes have not yet been hit from the SPA
  (because the orchestrator hasn't re-wired `modules/index.tsx` yet) —
  once the orchestrator swaps in the new exports, the SPA will trigger
  compilation of `/api/researcher/*` on first navigation.
- Note on local curl verification: the dev server is bound to `:::3000`
  in a separate network namespace from this shell, so direct
  `curl localhost:3000` returns ECONNREFUSED from here. Verified lint +
  tsc instead.

## Not done (out of scope, deferred to orchestrator)

- Did NOT edit `src/components/modules/index.tsx` per the task spec.
  The orchestrator wires the new exports in afterwards:
  - `export { default as ResearcherDashboardView } from "@/components/researcher/researcher-dashboard-view";`
  - `export { default as ResearcherSeaConditionsView } from "@/components/researcher/researcher-sea-conditions-view";`
  - `export { default as ResearcherFishingDataView } from "@/components/researcher/researcher-fishing-data-view";`
  - `export { default as FishermanDashboardView } from "@/components/dashboard/fisherman-dashboard-view";`
