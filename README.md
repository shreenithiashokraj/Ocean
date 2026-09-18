# Fisherman Module

A production-ready, full-stack **smart fishing technology platform** built with Next.js 16, TypeScript, Tailwind CSS, Prisma, and the z-ai-web-dev-sdk. It delivers real-time sea conditions, a threshold-driven safety alert engine, AI-powered fish analysis (real Vision Language Model), and an interactive map for location & navigation — all behind secure, role-based portals for **Fishermen**, **Researchers**, and **Admins**.

> Marine & weather data: **Open-Meteo** (free, no API key).  
> Maps: **Leaflet + OpenStreetMap**.  
> AI fish analysis: **z-ai-web-dev-sdk Vision Language Model**.  
> Auth: **bcrypt-hashed passwords + httpOnly JWT sessions** with backend role enforcement.

---

## Highlights

- 🔐 **Secure auth** — sign-in / sign-up / forgot / reset / logout, session persistence, role-based redirects, unauthorized-access page, backend-enforced permissions.
- 🌊 **Real-Time Sea Conditions** — live Open-Meteo weather + marine data, GPS or manual location, auto-refresh, marine forecast chart, Safe/Caution/Dangerous status, clearly-labeled offline/demo fallback.
- 🚨 **Safety & Alert System** — backend alert engine fetches conditions, checks configurable thresholds, deduplicates, persists alerts, fires notifications; severity levels, read/unread, history, details.
- 🐟 **AI Fish Analysis** — upload a fish photo, the VLM predicts species + confidence + alternatives + size/weight ranges + characteristics + notes; quality warnings; history with delete. Market price shows "unavailable" unless a real price API is configured (never fabricated).
- 🗺️ **Location & Navigation** — interactive Leaflet map, GPS, manual search, saved locations CRUD, curated real fishing spots with haversine distance.
- 👥 **Three role portals** — Fisherman, Researcher (aggregate research data only, no PII), Admin (full system management: users, settings, thresholds, API logs, all records).
- 🧱 **Scalable architecture** — a single API service layer (`src/lib/api.ts`) means any provider can be swapped without rewriting the UI. Catch Logging & SOS are wired as "Coming Soon" placeholders so they can be added later without touching existing modules.

### Phase 2 additions

- 🔄 **Alert lifecycle** — alerts now carry `ACTIVE → ACKNOWLEDGED → EXPIRED → RESOLVED` status, with `metric`, `actualValue` and `thresholdValue` context. ACTIVE alerts past their `endTime` auto-expire. Acknowledge/Resolve actions are ownership-checked on the backend.
- 🔔 **Notification center** — a full `/fisherman/notifications` page with severity, category, related-alert linking, mark-read / mark-all-read / delete. Notifications are linked to their source alert (`alertId`) and carry a `severity`. The header badge is driven by real backend data.
- 👤 **Fisherman profile & preferences** — `/fisherman.profile` (previously a dead link) with editable name/phone/vessel/license, preferred location (GPS-fillable), language, temperature unit, wind unit, and notification preferences. Backend enforces ownership (only the caller's own row is ever touched).
- 🔬 **Researcher data workspace** — Data Explorer (lists 4 real, queryable datasets with live record counts + coverage), Dataset Details (paginated preview + per-dataset charts + "Save as report"), GIS Map View (real OSM tiles overlaying sea-condition coords, fishing spots, alert coords — no PII), and Research Reports (saved snapshots with JSON view + delete). No fabricated scientific data — empty datasets show actionable empty states.
- 📊 **Admin API monitoring** — `/admin.api-monitoring` with an overall health banner (healthy/degraded/unavailable, communicated via icon + text + color), per-service table (calls, errors, last status, p95 latency), a call-volume chart, and a recent-calls log. Secrets are never shown.
- 🛡️ **Last-admin protection** — the backend refuses to demote or deactivate the final active administrator, preventing accidental lockout.
- ♿ **Accessibility hardening** — alert severity and lifecycle status are always conveyed via icon + text + color (never color alone), with `aria-label`s on icon-only buttons and `sr-only` text where needed.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) |
| Database | Prisma ORM + SQLite |
| Auth | bcryptjs + jose (JWT) + httpOnly cookies |
| State | Zustand (client) |
| Maps | Leaflet + OpenStreetMap |
| Charts | Recharts |
| Icons | Lucide React |
| AI | z-ai-web-dev-sdk (VLM for fish analysis) |
| Marine/weather | Open-Meteo (forecast + marine + geocoding) |

---

## Project setup

```bash
git clone <your-repo> fisherman-module
cd fisherman-module
bun install        # or npm install
```

---

## Environment variables

Copy `.env.example` to `.env` and adjust. **All secrets live on the backend only** — none are ever exposed to the client.

```bash
cp .env.example .env
```

```env
# Prisma (SQLite file)
DATABASE_URL=file:/home/z/my-project/db/custom.db

# Auth — JWT signing secret (CHANGE in production)
JWT_SECRET=replace-with-a-long-random-string
JWT_EXPIRES_HOURS=168
SESSION_COOKIE_NAME=fisherman_session

# Weather & marine data — Open-Meteo (free, no key required)
OPEN_METEO_WEATHER_URL=https://api.open-meteo.com/v1/forecast
OPEN_METEO_MARINE_URL=https://marine-api.open-meteo.com/v1
OPEN_METEO_GEO_URL=https://geocoding-api.open-meteo.com/v1/search

# Optional fish market price API (leave blank to disable -> shows "Market price unavailable")
FISH_MARKET_API_URL=
FISH_MARKET_API_KEY=

# AI fish analysis uses z-ai-web-dev-sdk (bundled). No key needed in the sandbox.
```

> **API keys policy:** Weather/marine data needs no key. AI fish analysis uses the bundled SDK. If you later wire a fish-market price provider, set `FISH_MARKET_API_URL`/`FISH_MARKET_API_KEY` on the server — the UI will surface real prices automatically and otherwise shows "Market price unavailable".

---

## Database setup

```bash
bun run db:push     # create/sync the SQLite schema
bun run db:seed     # seed demo accounts, default alert thresholds, system settings, and curated fishing spots
```

### Seed accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@fisherman.dev` | `Admin@123` |
| Researcher | `researcher@fisherman.dev` | `Research@123` |
| Fisherman | `fisher@fisherman.dev` | `Fisher@123` |

The seed also installs 6 default alert thresholds (wind speed, gusts, wave height, precipitation, visibility, pressure), 8 system settings, and 5 curated real-world fishing harbors (Chennai, Kochi, Mumbai, Visakhapatnam, Mangalore).

---

## API setup

Weather & marine data is provided by **Open-Meteo** — no API key required. The backend service lives in `src/lib/weather.ts`:

- `fetchWeatherMarine(lat, lng)` — combined Open-Meteo forecast + marine snapshot.
- `reverseGeocode(lat, lng)` — BigDataCloud (free, no key) → "City, Region, Country".
- `forwardGeocode(q)` — Open-Meteo geocoding for place search.
- `wmoCodeToText(code)` — WMO weather code → human text.
- `logApiCall(...)` — best-effort logging to the `api_logs` table.

When the live API is unreachable, the backend returns clearly-labeled **demo/offline data** (`isDemo: true`). The UI surfaces a prominent amber notice — fake values are never shown as live data.

To swap providers, edit `src/lib/weather.ts` (or the relevant `OPEN_METEO_*` env vars). The UI never calls external APIs directly.

---

## AI API setup

Fish analysis uses the **z-ai-web-dev-sdk Vision Language Model** (backend-only, dynamically imported in `src/app/api/fish-analysis/route.ts` so it can never reach a client bundle).

The VLM is prompted to return strict JSON with: species, confidence (0–1), alternative species, size range, weight range, characteristics, identification notes, and an image-quality warning. The result is persisted to the `fish_analyses` table.

- Validated server-side: only `image/jpeg`, `image/png`, `image/webp`, max ~8 MB.
- A clear **"AI prediction — verify with a local expert"** disclaimer is shown.
- Market price is only displayed when a real price API is configured; otherwise "Market price unavailable".

To use a different vision provider, replace the call in `src/app/api/fish-analysis/route.ts` — the UI contract (`FishAnalysisResult` in `src/lib/types.ts`) stays the same.

---

## Running locally

```bash
bun run dev        # http://localhost:3000  (Turbopack)
```

Open the app and sign in with one of the seed accounts above, or use the **one-click demo account** buttons on the landing page.

> The app is a single-page experience at `/`. Client-side view routing (Zustand) simulates the multi-portal structure (admin / researcher / fisherman) within one route. Role-based access is enforced both client-side (UX) and server-side (every API route guards with `requireUser`/`requireRole`).

---

## Testing

Manual end-to-end scenarios (all verified with the Agent Browser):

1. **Admin sign-in** — `admin@fisherman.dev` / `Admin@123` → lands on Admin Dashboard.
2. **Researcher sign-in** — `researcher@fisherman.dev` / `Research@123` → lands on Researcher Dashboard (aggregate data, no PII).
3. **Fisherman sign-in** — `fisher@fisherman.dev` / `Fisher@123` → lands on Fisherman Dashboard.
4. **Invalid login** — wrong password → "Invalid email or password" (401), no session created.
5. **Forgot password** — generates a secure reset token (sandbox returns it so you can continue to reset).
6. **Role-based redirects** — signed-in users are auto-routed to their role's dashboard; auth views are blocked while signed in.
7. **Unauthorized route access** — a fisherman cannot open admin/researcher views (UI hides them + backend rejects API calls).
8. **Sea condition API success** — `/api/sea-conditions?lat=&lng=` returns live Open-Meteo data + persists a record.
9. **Sea condition API failure** — offline → `isDemo: true` with clearly-labeled demo payload.
10. **Weather alerts** — `/api/alerts/run` fetches conditions, checks thresholds, creates/deduplicates alerts; `/api/alerts` lists them.
11. **AI image upload** — drag/drop or browse; validates type & size; shows preview + upload progress.
12. **AI analysis success** — VLM returns species + confidence + alternatives + characteristics + notes; saved to history.
13. **AI analysis failure** — invalid image → 422; VLM parse failure → graceful fallback row (notes-only).
14. **Location permission** — grant → GPS pin on map; deny → Chennai fallback + notice + manual search.
15. **Map loading** — real OpenStreetMap tiles + attribution; markers for user/saved/spots.
16. **Save/delete location** — persisted per user; ownership enforced on delete.
17. **Mobile responsiveness** — sidebar collapses to a sheet; cards reflow to 1 column.
18. **Database operations** — Prisma CRUD across all models; sessions revocable on logout.
19. **Logout** — session deleted server-side, cookie cleared, returns to landing.
20. **Session persistence** — httpOnly cookie rehydrates on reload; stale/expired sessions clear the local user and return to landing.

### Phase 2 scenarios (verified)

21. **Alert lifecycle** — an ACTIVE alert is Acknowledged (`POST /api/alerts/:id/acknowledge`), then Resolved (`POST /api/alerts/:id/resolve`); the status badge updates in the UI and persists in the DB. ACTIVE alerts past `endTime` auto-expire on list.
22. **Alert metric context** — the alert detail dialog shows Metric, Actual value, Threshold crossed, Source.
23. **Notification center** — `/fisherman.notifications` lists notifications with severity + category + related-alert link; mark-read, mark-all-read, and delete all work; the header badge reflects real backend unread count.
24. **Fisherman profile** — `/fisherman.profile` edits name/phone/vessel/license + preferred location (GPS) + preferences; backend ownership-enforced (a fisher can only patch their own row).
25. **Researcher data explorer** — 4 real datasets listed with live record counts + geographic coverage; "Explore dataset" opens a paginated preview + per-dataset chart + "Save as report".
26. **Researcher GIS** — real OSM tiles overlay sea-condition coords + fishing spots + alert coords; source filters re-fetch; no fisherman PII.
27. **Researcher reports** — saved snapshots persist; JSON view + delete work.
28. **Admin API monitoring** — overall health banner + per-service table + call-volume chart + recent-calls log; secrets never shown.
29. **Last-admin protection** — demoting or deactivating the final active admin → `400` with a clear message.
30. **RBAC security** — a fisherman's session is rejected (`401`/`403`) by every `/api/admin/*` and `/api/researcher/*` route; a fisher can only read/patch their own profile and own saved locations/analyses.

Code quality: `bun run lint` → 0 errors, 0 warnings.

> **Note on Prisma client regeneration:** the `WeatherAlert`, `Notification` and `UserProfile` models gained new columns in Phase 2. After `bun run db:push` (which regenerates the client), **restart the dev server** so Turbopack picks up the regenerated `@prisma/client` — otherwise the running process holds a stale client and lifecycle/profile writes will 500.

---

## Deployment

```bash
bun run build     # production build
bun run start     # start the production server
```

Set production environment variables (especially `JWT_SECRET`) via your host's secret manager. Ensure the SQLite file path (or a production Postgres URL if you swap the datasource) is writable. Put any external API keys (e.g. `FISH_MARKET_API_KEY`) in server-side env only.

---

## Project structure

```
src/
├─ app/
│  ├─ layout.tsx                 # root layout: ocean theme, ThemeProvider, Toaster
│  ├─ page.tsx                  # SPA shell: session hydration + view routing
│  ├─ globals.css               # deep ocean theme + glass-card + scroll-ocean
│  └─ api/
│     ├─ auth/                  # sign-in, sign-up, sign-out, me, forgot, reset
│     ├─ sea-conditions/        # Open-Meteo weather + marine
│     ├─ places/search/         # geocoding
│     ├─ alerts/               # list + run engine + mark-read
│     ├─ notifications/         # list + mark-read
│     ├─ fish-analysis/        # VLM analyze + list + delete
│     ├─ locations/             # saved locations CRUD
│     ├─ fishing-spots/        # curated spots + haversine distance
│     ├─ admin/               # users, settings, thresholds, api-logs, sea-conditions, fish-analyses, locations
│     └─ researcher/          # sea-conditions, fishing-data (aggregate), live snapshot
├─ components/
│  ├─ auth/                    # landing, sign-in, sign-up, forgot, reset, unauthorized
│  ├─ layout/                 # header, sidebar, footer, app-shell
│  ├─ dashboard/              # fisherman dashboard
│  ├─ sea-conditions/         # sea conditions view + cards
│  ├─ safety-alerts/         # safety & alert view + cards
│  ├─ fish-analysis/         # uploader + results + history
│  ├─ location/              # Leaflet map + location navigation view
│  ├─ researcher/            # researcher dashboard + sea-conditions + fishing-data
│  ├─ admin/                 # 7 admin views
│  ├─ modules/               # view registry (re-exports all module views)
│  ├─ module-router.tsx      # maps view id → component
│  ├─ common/               # loading/error/empty states, stat card
│  ├─ brand.tsx             # original Fisherman Module logo
│  └─ ui/                   # shadcn/ui component set
└─ lib/
   ├─ auth.ts              # bcrypt + JWT + session + role guards
   ├─ db.ts                # Prisma client
   ├─ store.ts            # Zustand (auth + client view routing)
   ├─ api.ts              # single API service layer (client)
   ├─ weather.ts          # Open-Meteo + geocoding + api logging (server)
   ├─ permissions.ts      # role → portal access map
   └─ types.ts            # shared TypeScript types
prisma/
├─ schema.prisma          # 11 models (users, profiles, sessions, sea_conditions, weather_alerts, alert_thresholds, fish_analyses, saved_locations, fishing_spots, notifications, api_logs, system_settings)
└─ seed.js               # demo accounts + thresholds + settings + spots
```

---

## How to edit only one page

Each module is fully isolated in its own folder. To edit a single screen, touch only that file — nothing else needs to change:

| Want to change… | Edit only |
| --- | --- |
| Sea conditions UI | `src/components/sea-conditions/sea-conditions-view.tsx` |
| Safety alerts UI | `src/components/safety-alerts/safety-alerts-view.tsx` |
| AI fish analysis UI | `src/components/fish-analysis/fish-analysis-view.tsx` |
| Location & navigation UI | `src/components/location/location-navigation-view.tsx` |
| Fisherman dashboard | `src/components/dashboard/fisherman-dashboard-view.tsx` |
| Researcher dashboard | `src/components/researcher/researcher-dashboard-view.tsx` |
| Admin users page | `src/components/admin/admin-users-view.tsx` |
| Admin settings page | `src/components/admin/admin-settings-view.tsx` |
| The marine/weather provider | `src/lib/weather.ts` |
| The AI provider | `src/app/api/fish-analysis/route.ts` |
| Alert thresholds | seeded in `prisma/seed.js`, editable live in the Admin → Settings → Alert Thresholds tab |

The view registry (`src/components/modules/index.tsx`) maps each logical view id to its component, so adding a new module is: create the component folder + file, add one export line to the registry, add the nav item in `src/components/layout/sidebar.tsx`. Existing modules are untouched.

### Adding the "Coming Soon" modules (Catch Logging, SOS)

The two disabled modules are already wired as `soon: true` nav items. To activate one:

1. Create `src/components/catch-logging/catch-logging-view.tsx` exporting `CatchLoggingView`.
2. Add `export { CatchLoggingView } from "@/components/catch-logging/catch-logging-view";` to `src/components/modules/index.tsx`.
3. Add `"fisherman.catch-logging"` to `ViewId` in `src/lib/store.ts` and remove `soon: true` from its nav item in `src/components/layout/sidebar.tsx`.
4. Add the API routes under `src/app/api/catch-logging/`.
5. Add `canAccess`/client-guard entries for the new view.

No existing file needs to change its behavior.

---

## Safety & data integrity notes

- **Never trust the frontend role.** Every API route guards with `requireUser()`/`requireRole(...)`; ownership is verified per record (a fisherman can only delete their own analyses/locations; a researcher never receives PII).
- **No fake live data.** Real-time values come from Open-Meteo. When the API is down, the UI shows a clearly-labeled "Demo Data / Offline Mode" banner. Missing fields render "Data unavailable".
- **No fabricated market prices.** Prices only appear when a real price API is configured; otherwise "Market price unavailable".
- **Alerts are system-generated.** The alert source is "Fisherman Module Alert Engine". The UI reminds users to always follow official maritime-authority warnings; it never claims official government warnings unless a real source provides them.

---

## License

Original work. No third-party logos or copyrighted branding are used. Map data © OpenStreetMap contributors. Marine data © Open-Meteo.
