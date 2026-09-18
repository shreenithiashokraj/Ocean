# Task 7 — Admin Portal Agent

## Task

Build the Admin Portal for the Fisherman Module Next.js app: all admin-only
client views (in `src/components/admin/`) + their backing API routes (in
`src/app/api/admin/`). Admin views are mounted as client components on the
single `/` SPA route; the orchestrator wires them into
`src/components/modules/index.tsx` after this task.

## Files created

### Backend API routes (8)

1. `src/app/api/admin/users/route.ts` — GET: lists every user with profile phone.
2. `src/app/api/admin/users/[id]/route.ts` — PATCH: role + isActive update.
   - Validates role ∈ {ADMIN, RESEARCHER, FISHERMAN}.
   - Returns 422 on bad role / non-boolean isActive.
   - Returns 400 on self-deactivation (cannot lock yourself out).
   - Returns 404 on missing user.
3. `src/app/api/admin/settings/route.ts` — GET: list every SystemSetting row.
   POST: upsert by key. Category defaults to `"general"` and is coerced to the
   allowed set. Keys matching `apiKey`, `secret`, `password`, `token` are
   rejected with 422 so secrets never land in the non-secret settings table.
4. `src/app/api/admin/thresholds/route.ts` — GET: list AlertThresholds.
   POST: upsert by metric. All four numeric fields must be finite; unit capped
   at 20 chars.
5. `src/app/api/admin/api-logs/route.ts` — GET: 100 newest ApiLog rows with the
   acting user's email included.
6. `src/app/api/admin/sea-conditions/route.ts` — GET: 100 newest SeaCondition
   rows newest first, with user. `payload` (the JSON string) IS returned so
   the admin UI can pretty-print it in a row-click dialog.
7. `src/app/api/admin/fish-analyses/route.ts` — GET: 100 newest FishAnalysis
   rows newest first, with user. `imageDataUrl` is intentionally OMITTED from
   the list payload to keep responses small; each row carries a boolean
   `hasImage` instead.
8. `src/app/api/admin/locations/route.ts` — GET: combined view. Runs
   `Promise.all` to fetch SavedLocation (with user) + FishingSpot in one
   request. Returns `{records: {saved: [...], spots: [...]}}`. The view
   casts the `{records: unknown[]}` api.ts return shape to the expected object
   shape.

### Client views (7)

9. `src/components/admin/admin-dashboard-view.tsx` — Overview dashboard.
   - `Promise.all` fetches 7 endpoints (users, api-logs, settings, alerts,
     sea-conditions, fish-analyses, locations) in parallel; each failing
     endpoint degrades individually via `safeCatch` so one 500 doesn't break
     the whole dashboard.
   - 10 StatCards in a responsive grid (2/3/4/5 cols): total users, fishermen,
     researchers, total alerts, critical alerts, fish analyses, sea-condition
     records, saved locations, fishing spots, recent API logs.
   - "System Health" card showing live API providers from settings (non-secret
     only).
   - "Recent API Logs" table (last 10) — status Badge color-coded by HTTP
     status family (2xx green, 4xx/5xx red, 3xx amber).
   - "Recent Alerts" mini-list (last 5) with severity chip per row.
   - Amber "Admin actions affect every user" disclaimer `<aside>`.

10. `src/components/admin/admin-users-view.tsx` — User table with controls.
    - Search by email/name (Input + Search icon).
    - Filter by role (Select: All / Admin / Researcher / Fisherman).
    - Per-row: role Select, isActive Switch + Badge, "Save" button.
    - Per-row pending-edits state; Save button only enabled when row is dirty.
    - Self row marked with a "you" badge; self-deactivation Switch is disabled
      (the backend also rejects this with 400).
    - Toast on save.

11. `src/components/admin/admin-sea-conditions-view.tsx` — Records table.
    - 3-stat strip (Total / Live / Demo).
    - Click any row → Dialog with pretty-printed JSON payload (using
      `JSON.stringify(JSON.parse(raw), null, 2)` with fallback to raw string).
    - `source` + `isDemo` Badges; live rows green, demo rows amber.

12. `src/components/admin/admin-alerts-view.tsx` — Alerts table.
    - 3-stat strip (Total / Critical / Unread).
    - Filter by severity (Select).
    - Per-row: title, type chip (color-coded per type), severity chip
      (color-coded per severity), location (or "broadcast" Radio icon for
      null userId), Read Badge, created time.
    - Pulls alerts from `/api/alerts` (the public list endpoint — admin can
      see broadcast + own; for cross-user visibility the public endpoint
      shape is reused).

13. `src/components/admin/admin-fish-analyses-view.tsx` — Fish analyses table.
    - 3-stat strip (Total / Identified / Avg confidence).
    - Per-row: species (or "failed" badge when species is null), confidence
      Progress bar (handles both 0..1 and 0..100 ranges), size/weight, user,
      has-image indicator (image is NOT in the payload — boolean only).
    - `qualityWarning` shown as amber sub-line when present.

14. `src/components/admin/admin-locations-view.tsx` — Locations with Tabs.
    - Tab 1: Saved Locations table — every user's saved locations with
      category chip (fishing/harbor/home/waypoint), user name + email,
      notes (or `Unavailable`), created date.
    - Tab 2: Fishing Spots table — curated catalog with region, depth,
      bottom-type badge, species, source.
    - Both tables wrapped in `scroll-ocean max-h-32 overflow-y-auto`.
    - Note: the api.ts wrapper types the response as `{records: unknown[]}`
      but the backend returns `{records: {saved, spots}}`; the view casts to
      the expected object shape with runtime guards (`Array.isArray` checks).

15. `src/components/admin/admin-settings-view.tsx` — Settings + thresholds.
    - Prominent amber info card at the top: "API keys for weather/marine/market/AI
      are configured via server environment variables (see .env.example). This
      UI manages non-secret settings and thresholds only."
    - Tabs: General, API Providers, Alert Thresholds, Branding.
    - General/Branding: list settings (key/value/updated), per-row Input +
      Save (api.upsertSetting). Save button only enabled when dirty.
    - API Providers: list api-category settings with the relevant env-var NAME
      shown beneath each setting key (NEVER the value). Plus a separate
      read-only env-var reference card listing all server env vars
      (FISH_MARKET_API_URL, FISH_MARKET_API_KEY, JWT_SECRET, DATABASE_URL,
      OPEN_METEO_WEATHER_URL, OPEN_METEO_MARINE_URL, z-ai-web-dev-sdk,
      OpenStreetMap) — names + descriptions only.
    - Alert Thresholds: list thresholds (metric, caution, high, critical, unit)
      with per-row Input + Save (api.upsertThreshold). Adds a cyan "How the
      alert engine uses these" explainer noting that visibility/pressure use
      inverse semantics (lower = worse).

## Verification

- `bun run lint` → 0 errors / 0 warnings (clean).
- All admin endpoints return 401 with no cookie and 401 with a fisher
  cookie (requireRole("ADMIN") returns null for both — per spec, either 401
  or 403 is acceptable).
- `GET /api/admin/users` → 200 with admin cookie, returns 3 users.
- `PATCH /api/admin/users/:fisher_id` with `{role: "RESEARCHER", isActive: true}`
  → 200 `{ok:true}`; bad role → 422; self-deactivation → 400.
- `POST /api/admin/thresholds` upsert → 200; non-numeric value → 422.
- `POST /api/admin/settings` upsert → 200; key="apiKey" → 422 with "Secrets
  must be configured via server environment variables" error.
- `GET /api/admin/sea-conditions` returns payload JSON string (full).
- `GET /api/admin/fish-analyses` returns `hasImage` boolean, no `imageDataUrl`.
- `GET /api/admin/locations` returns `{records: {saved: [], spots: [5 curated]}}`.
- `GET /` → 200 (SPA still renders; orchestrator will wire the views in
  afterward).

## Stage Summary

All 8 API routes + 7 client views created. Every admin route is guarded by
`requireRole("ADMIN")` returning 401 when not admin. Secrets are never
exposed in the settings UI — only env-var NAMES are shown, and the upsert
endpoint rejects keys that look like secrets (`apiKey`, `secret`, `password`,
`token`). All views use glass-card, scroll-ocean, LoadingState/ErrorState/
EmptyState, and responsive tables with `overflow-x-auto`. The dev server
hot-reloads cleanly; no compile errors. Lint passes for all files.
