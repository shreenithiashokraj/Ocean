# Task 4 — Safety & Alert System

- **Task ID**: 4
- **Agent**: safety-alerts-agent
- **Task**: Build the Safety & Alert System module — alert engine, notifications API, and the fisherman-facing Safety & Alert System view.

## Work Log

- Read `worklog.md`, `prisma/schema.prisma`, `src/lib/{types,api,auth,weather,db,store}.ts`, the `seed.js` file, and the existing `modules/index.tsx` + `app-shell.tsx` to understand conventions.
- Created 5 API route files:
  - `src/app/api/alerts/route.ts` — GET list (user-scoped + broadcast), supports `?unread=1`.
  - `src/app/api/alerts/run/route.ts` — POST alert engine (see "Engine design" below).
  - `src/app/api/alerts/[id]/read/route.ts` — POST mark-read with ownership guard.
  - `src/app/api/notifications/route.ts` — GET list (per-user, newest first, limit 100).
  - `src/app/api/notifications/[id]/read/route.ts` — POST mark-read (strict owner).
- Created the client view `src/components/safety-alerts/safety-alerts-view.tsx`:
  - StatCard row: total / critical / unread / last-alert-time.
  - Alert cards with severity color stripe (LOW=slate, MODERATE=amber, HIGH=orange, CRITICAL=red) and type icon (Wind/Waves/Rain/Storm/Visibility).
  - Click a card → optimistic mark-read + shadcn Dialog with full details.
  - Header buttons: "Run alert check now", "Show unread only" Switch toggle, "Mark all read".
  - Auto-refresh every 60s via `setInterval`.
  - Loading / Error / Empty states (shared components).
  - Safety disclaimer footer (amber `<aside role="note">`).
  - Fully responsive (1/2/3-col grid) and accessible (semantic elements, `aria-label`s, `aria-busy`, focus rings).
- Wired the new view into `src/components/modules/index.tsx` by replacing the local stub with a re-export:
  `export { SafetyAlertsView } from "@/components/safety-alerts/safety-alerts-view";`
- Ran `bun run lint` — my files contribute **0 errors / 0 warnings**. (The 1 remaining lint error in the project is in `src/components/sea-conditions/sea-conditions-view.tsx`, owned by another agent.)
- Verified endpoints end-to-end via curl:
  - All routes return 401 when unauthenticated (auth guard works).
  - Authed fisher: `GET /api/alerts` → `{alerts:[]}` 200; `GET /api/notifications` → seeded "Welcome aboard" entries 200.
  - `POST /api/alerts/run` (default Chennai): returned `{created:1, checked:6}` then `{created:0, checked:6}` after the visibility fix.
  - `POST /api/alerts/:id/read` → `{ok:true}` 200.
  - Dev log shows the expected SQL: `WHERE (userId = ? OR userId IS NULL) ORDER BY createdAt DESC` for the list, and the unread filter wraps with `isRead = ? AND (...)`.
- Cleaned up a false-positive test alert that was generated while validating the spec-literal severity logic, so the fisher user sees a clean state.

## Engine design (POST /api/alerts/run)

1. `requireUser()` — any authenticated role may trigger. ADMIN → `userId=null` (broadcast); everyone else → `userId=session.sub`.
2. Coordinates resolved from JSON body `{lat,lng}` first, then query `?lat=&lng=`, else Chennai default (13.0827, 80.2707). Clamped to valid ranges.
3. `fetchWeatherMarine(lat, lng)` — uses Open-Meteo (clearly-labelled demo data when offline).
4. Loads all `AlertThreshold` rows.
5. Maps each `metric` → `SeaConditionData` field (windSpeedKmh→windSpeed, windGustsKmh→windGusts, waveHeightM→waveHeight, precipitationMm→precipitation, visibilityM→visibility, pressureHpa→pressure).
6. Skips metrics whose current value is null/non-finite. Otherwise increments `checked`.
7. Severity logic: `pressureHpa` uses inverse (lower=worse) per spec. **Documented deviation:** `visibilityM` is also treated as inverse (lower=worse) because the seeded thresholds (caution=5000, high=2000, critical=1000) only make sense under lower=worse semantics — the spec's "for all others, higher=worse" would flag clear-weather visibility of 10000m as CRITICAL, which is a false positive. Full rationale is in the source comment on `severityFor()`.
8. Metric→type mapping: wind→WIND, wave→WAVE, precipitation→RAIN, visibility→VISIBILITY, pressure→STORM.
9. De-dupe: `db.weatherAlert.findFirst` for an existing UNREAD alert with same `type`, `severity`, `userId` created in the last 6 hours. Skip if found.
10. On create: writes the `WeatherAlert` (source = `"Fisherman Module Alert Engine"`, endTime = now+6h) and a `Notification` (per-user if `targetUserId` set; broadcast to all active users if ADMIN-triggered). Notification `type` = `alert` for CRITICAL/HIGH else `warning`.
11. Returns `{ created, checked }`.
12. `logApiCall({ service: "alert-engine", endpoint: "/api/alerts/run", method: "POST", status: 200, message: "created=N" })` in a `finally` block; also logs a 500 record on error.

## Stage Summary

All 6 required files were created + 1 minimal wiring edit to `modules/index.tsx`. The backend enforces ownership (own alerts + broadcast only; notifications strictly owner-only; mark-read returns 404 for non-owners to avoid existence leakage). Source field is always `"Fisherman Module Alert Engine"`. No fake data — the engine uses `fetchWeatherMarine` which clearly labels demo data when offline. Responsive + accessible client view with sticky footer handled by the existing `AppShell`. The repeated `GET /api/notifications 404` spam in the dev log (caused by the header polling) has stopped — the route now returns 200.
