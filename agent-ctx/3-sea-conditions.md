# Agent Work Record — Task 3 (Real-Time Sea Conditions)

- **Task ID:** 3
- **Agent:** sea-conditions
- **Module:** Fisherman → Real-Time Sea Conditions (`fisherman.sea-conditions` view)

## Files created / touched

| Path | Action | Purpose |
| --- | --- | --- |
| `src/app/api/sea-conditions/route.ts` | created | GET handler — auth, Open-Meteo fetch + reverse geocode + DB persistence + ApiLog + `no-store` |
| `src/app/api/places/search/route.ts` | created | GET handler — auth, forward geocode (Open-Meteo) for the location-search dropdown |
| `src/components/sea-conditions/sea-conditions-view.tsx` | created | Main client view — geolocation, auto-refresh, status banner, metric cards, 24h recharts chart, demo-data notice |
| `src/components/modules/index.tsx` | edited | Replaced the `SeaConditionsView` stub with a re-export from the new file (only that one export was touched; other modules untouched) |

## Key implementation notes

- **Backend route `/api/sea-conditions`** validates `lat`/`lng` server-side (range
  `[-90,90]` / `[-180,180]`), defaults to Chennai (13.0827, 80.2707) when
  missing/non-numeric, runs `fetchWeatherMarine` and `reverseGeocode` in
  parallel, persists a `SeaCondition` row (always — marked `isDemo`),
  logs to `ApiLog` (`service: "weather"`, `message: "offline-fallback"` when
  demo), and returns `{ data, isDemo, source, recordedAt, label }` with
  `Cache-Control: no-store`. `runtime = "nodejs"`.
- **Backend route `/api/places/search`** validates `q` (max 100 chars), calls
  `forwardGeocode(q)`, returns `{ results: [...] }`. `runtime = "nodejs"`.
  Both routes call `requireUser()` and 401 on no session (all three roles may
  read; admin too).
- **Client view** requests geolocation on mount; on deny/unsupported it falls
  back to Chennai with a toast notice. Auto-refresh interval selectable
  (1/5/15/30 minutes or Off). Manual place search via `api.searchPlaces` with a
  click-outside-to-dismiss dropdown. Status derived Safe/Caution/Dangerous from
  wind (<25 / <40) and wave (<1.5 / <2.5). Demo data shows a prominent amber
  "Demo Data / Offline Mode" badge in the status banner and a footer notice.
- Missing metric values render the shared `<Unavailable />` component; loading
  shows `<CardSkeleton />` / inline `Loader2`; errors show `<ErrorState />`
  with a retry button. The 24-hour marine chart is a recharts `AreaChart`
  with two Y-axes (wave height on the left, wind speed on the right), gradient
  fills, and a graceful "no data" state when `hourly.time` is empty.

## Architecture choices

- All client → backend traffic goes through `api.*` (`api.getSeaConditions`,
  `api.searchPlaces`) — never direct `fetch`. The `api.ts` response type for
  `getSeaConditions` does not include `label`, so the view casts the response
  via `as unknown as SeaConditionsResponse` rather than modifying the shared
  `api.ts` (out of scope for this task).
- Sticky footer is handled by `AppShell`; the view does not add its own.
- `glass-card`, `ocean-bg`, and `scroll-ocean` (for the search results list)
  are used as defined in `globals.css`.
- The view is responsive (1 col mobile, 2 cols tablet, 3 cols desktop) and
  uses semantic `<header>`, `<section>`, `<footer>` tags plus aria labels on
  icon-only buttons.

## Verification

- `GET /api/sea-conditions` returns `401` when unauthenticated — route compiles
  in ~121ms, no errors.
- `GET /api/places/search?q=chennai` returns `401` when unauthenticated — route
  compiles in ~123ms, no errors.
- `GET /` (the SPA shell) compiles the whole module tree including the new
  view via `module-router.tsx` with no errors.
- No compile errors observed in `dev.log` after writing the files.
