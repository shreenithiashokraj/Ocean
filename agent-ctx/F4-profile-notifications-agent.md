# Task F4 — Profile & Notifications Views

- **Task ID**: F4
- **Agent**: profile-notifications-agent (Z.ai Code)
- **Task**: Build two NEW client views — `ProfileView` (profile + preferences) and `NotificationsView` (full notification center) — using existing API contracts. Fix the dead "Profile & Settings" link. Do NOT touch any working module or the module-router registry.

## Work Log

- Read `worklog.md` end-to-end (all prior agents' records) to learn the project conventions (single SPA at `/`, Zustand view routing, dark ocean theme, glass-card / scroll-ocean / ocean-bg, `api.*` service layer with `ApiError`, shared `LoadingState` / `ErrorState` / `EmptyState` / `StatCard`, `RoleBadge`, `BrandMark`, shadcn/ui component set, sonner toasts).
- Read `src/lib/api.ts` to confirm the exact shapes for `getProfile` / `updateProfile` / `listNotifications` / `markNotificationRead` / `deleteNotification` / `readAllNotifications` (all already implemented backend-side; my work is purely client UI).
- Read `src/app/api/profile/route.ts`, `src/app/api/notifications/route.ts`, `src/app/api/notifications/[id]/route.ts`, `src/app/api/notifications/[id]/read/route.ts`, `src/app/api/notifications/read-all/route.ts` to confirm what fields the server actually returns (Profile: name, email, role, phone, country, vesselName, licenseNumber, avatarUrl, preferredLocationName, preferredLat, preferredLng, language, temperatureUnit, windUnit, notifAlerts, notifSummary. Notification: id, title, message, type, severity, category, alertId, isRead, createdAt).
- Read `prisma/schema.prisma` for `User`, `UserProfile`, `Notification` models (severity is nullable, category default `general`, alertId nullable + FK to `WeatherAlert`).
- Read `src/components/safety-alerts/safety-alerts-view.tsx` (same author agent's prior file) to mirror styling idioms: severity color stripe, type→icon mapping, time-ago helper, `aria-busy`, optimistic UI, auto-refresh interval, glass-card rows, `<aside role="note">` disclaimer.
- Read `src/components/layout/header.tsx` and `sidebar.tsx` to find where the dead link is wired (`onClick={() => setView("fisherman.profile")}` in the header dropdown, plus a "Notifications" sidebar entry) — confirming both new views will be reachable once the orchestrator wires them into `modules/index.tsx` + `module-router.tsx`.
- Read `src/components/ui/{tabs,select,alert-dialog,switch,label,input,separator,badge,avatar,card,button}.tsx` to learn the exact prop signatures (e.g., `Tabs` uses `value`/`onValueChange`, `Select` requires `SelectValue` inside `SelectTrigger`, `AlertDialogAction` accepts `onClick` via props spread).

### Files created (ONLY these — no other file touched)

1. **`src/components/profile/profile-view.tsx`** (default + named `ProfileView`)
   - Layout: `mx-auto max-w-4xl px-4 py-6 sm:px-6 animate-fade-up`.
   - Sticky header with `Avatar` (initials fallback), name + email + `RoleBadge`.
   - `Tabs` with two triggers: **Profile** and **Preferences** (icon + label, full-width on mobile).
   - **Profile tab** (3 glass-cards):
     - **Read-only identity card** — Email (with `Mail` icon, helper note "managed by admin") + Role (RoleBadge + role description), separated by a vertical `Separator`.
     - **Personal information card** — `Field` for Full name (required, validated ≥2 chars), Phone (tel), Country, Vessel name, License number. Each Field has shadcn `Label` (with `htmlFor`) + lucide icon + `Input` (`aria-invalid` + `aria-describedby` + error `<p>` with `AlertTriangle` icon when touched & invalid).
     - **Preferred location card** — `Field`s for Location name (full-width), Latitude, Longitude. A **"Use my current location"** `Button` that calls `navigator.geolocation.getCurrentPosition` with high-accuracy + 10s timeout; on success fills lat/lng (4 decimals) + sets location name to "Current location" if blank; on failure maps `PERMISSION_DENIED`/`TIMEOUT`/`UNAVAILABLE` to friendly toast.error. Latitude validated to [-90, 90], longitude to [-180, 180], and if only one is set, both error.
     - Save button → `api.updateProfile({ name, phone, country, vesselName, licenseNumber, preferredLocationName, preferredLat, preferredLng })` (sends `null` when lat/lng cleared). Toast success/error. Updates local state from server response.
   - **Preferences tab** (2 glass-cards):
     - **Language & units card** — 3-up `SelectField` grid: Language (en/es/fr/ta/hi/bn — each labeled with native script + English), Temperature (celsius/fahrenheit), Wind speed (kmh/ms/knots). Below: three secondary `Badge`s echoing current selections with mini icons (Thermometer/Wind/Globe) for instant visual confirmation.
     - **Notification preferences card** — Two `SwitchRow`s with `Separator` between: `notifAlerts` ("Alert notifications", on by default) and `notifSummary` ("Daily summary digest", off by default). Each Switch has matching `Label htmlFor` + description.
     - Save button → `api.updateProfile({ language, temperatureUnit, windUnit, notifAlerts, notifSummary })`. Toast on success.
   - **Sign out section** at the bottom — small bordered panel with amber `AlertTriangle` + "Sign out of your account" + outline Button → `api.signOut()` then `useAppStore.getState().logoutClient()` then `useAppStore.setState({ view: "landing" })` and a success toast (mirrors header's existing logout handler).
   - Loading: `LoadingState` while initial `getProfile` is in flight. Error: `ErrorState` with retry button on failure (covers 401/session-expired case).
   - Fully responsive: 1-col on mobile, 2-col on `sm:`+ grids for fields, 3-col for preferences. Accessible: every input has a `<Label htmlFor>` bound to its id, error messages are programmatic + visible, required field has `*` marker + `aria-required` via `required` attr.

2. **`src/components/notifications/notifications-view.tsx`** (default + named `NotificationsView`)
   - Layout: `mx-auto max-w-4xl px-4 py-6 sm:px-6 animate-fade-up`.
   - **Header**: `Bell` icon + "Notifications" title + subtitle. Action buttons (wrap on mobile): `Refresh` (outline, calls `load()`), `Mark all read` (primary, calls `api.readAllNotifications()`, shows updated count in toast), and a `Switch` toggle labeled "Unread only" inside a bordered label.
   - **StatCards row** (2× on mobile, 4-up on `sm:`): Total (`Bell`, cyan), Unread (`BellRing`, amber, sub "All caught up" when 0), Alert-category count (`ShieldAlert`, red), Critical-severity count (`AlertTriangle`, red). All counts come from real DB rows fetched via `api.listNotifications()` — no fake numbers.
   - **Category filter**: shadcn `Select` (All/general/alert/system/analysis) with `Label htmlFor="notif-category-filter"` + `SelectTrigger id="notif-category-filter" aria-label="Filter by category"`.
   - **Notification list** (`scroll-ocean max-h-[28rem]`): each item rendered as a `<li>` wrapping a glass-card `<article>` with:
     - **Severity/type color stripe** down the left edge — color is paired with an **icon + text label** so severity is never communicated by color alone (a11y hard requirement):
       - `info` → `Info` icon, blue (sky) chip + dot, label "Info"
       - `success` → `CheckCircle2` icon, green (emerald) chip + dot, label "Success"
       - `warning` → `AlertTriangle` icon, amber chip + dot, label "Warning"
       - `alert` → `ShieldAlert` icon, red (rose) chip + dot, label "Alert"
     - Unread items get a `ring-1 ring-primary/30` + a "New" pill (dot + word "New").
     - Title (truncate), message (muted), then a meta row: type chip + category `Badge` (outline) + (when severity is set and not LOW) a severity chip, then relative time (`Clock` icon + `timeAgo`).
     - If `alertId` is present, a **"View related alert"** button calls `useAppStore.setState({ view: "fisherman.safety-alerts" })` exactly as specified.
     - Row actions: `Mark read` (outline, only when unread — optimistic mark + revert on failure) and `Delete` (ghost destructive — opens `AlertDialog` for confirmation, then optimistic delete + revert on failure).
   - **Empty state**: `EmptyState` (icon `Inbox`) with a context-aware message depending on whether filters are active.
   - **Auto-refresh**: `setInterval` every 60s calls `load()` (cleared on unmount).
   - **Loading**: `LoadingState` while initial fetch in flight. **Error**: `ErrorState` with retry button.
   - Accessibility: every button has `aria-label` (often with the notification title interpolated), every Switch + Select has an associated Label, the list `<ul>` has `role="list"` and each `<li>` is `role="listitem"`-equivalent via the `<article>` element. Severity is communicated via **icon + text + color** — never color alone.
   - Footer `<aside role="note">` with a `Sparkles` icon explaining the auto-refresh cadence.

### Validation, errors, rollback

- Client-side validation before PATCH: name ≥2 chars, lat in [-90, 90], lng in [-180, 180], lat/lng must be both-empty-or-both-set. `touched` state gating means errors only show after the user has blurred or pressed Save (less noisy UX).
- Optimistic UI: mark-read + delete update local state immediately and revert on `ApiError` with a toast. Mark-all-read uses the bulk endpoint and shows the server-returned `updated` count in the success toast.
- All `api.*` calls route through the shared service layer; no raw `fetch` to any URL.

### Lint / type-check / runtime

- `bun run lint` → **0 errors / 0 warnings** for my two files.
- `bunx tsc --noEmit --pretty false` → **0 type errors** in `profile-view.tsx` or `notifications-view.tsx`. (Initial iteration surfaced two issues I fixed: `lucide-react` has no `Boat` icon — switched to `Anchor`; and `Record<string, unknown>` → `Profile` direct cast fails TS's structural check — routed through `unknown` (`as unknown as Profile`) at the three call sites where `api.getProfile`/`api.updateProfile` return `Record<string, unknown>` per the existing `api.ts` signature, which I deliberately did not modify since widening that type wasn't part of my task scope.)
- `dev.log` shows clean hot-reload compiles (`✓ Compiled in 18x–24x ms`) on every save with no runtime errors. The pre-existing 30s `/api/notifications` poll from the header bell continues to return 200.

## Notes for the orchestrator

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

## Stage Summary

Both required files created. Real backend data only (no simulated notifications). Client-side validation mirrors backend rules (name ≥2 chars, lat/lng ranges). Severity accessibility satisfied via icon + text + color triple. Sticky footer handled by the existing AppShell (no new footer added). Lint clean, tsc clean, dev.log clean. Files are ready for the orchestrator to wire into the module registry.
