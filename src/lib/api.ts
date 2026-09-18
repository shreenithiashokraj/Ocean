"use client";

/**
 * Single API service layer. All client -> backend calls go through here so the
 * underlying provider can be swapped without touching the UI.
 */

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers as Record<string, string>),
    },
    ...opts,
  });
  const text = await res.text();
  const body = text ? safeJson(text) : undefined;
  if (!res.ok) {
    const msg =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status})`) || `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  // ── Auth ───────────────────────────────────────────────
  signIn: (email: string, password: string) =>
    request<{ user: import("@/lib/store").AuthUser }>("/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signUp: (input: { name: string; email: string; password: string; role: string; phone?: string }) =>
    request<{ user: import("@/lib/store").AuthUser }>("/api/auth/sign-up", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  signOut: () => request<{ ok: true }>("/api/auth/sign-out", { method: "POST" }),
  me: () => request<{ user: import("@/lib/store").AuthUser | null }>("/api/auth/me"),
  forgotPassword: (email: string) =>
    request<{ resetToken: string; message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: true }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),

  // ── Sea conditions ────────────────────────────────────
  getSeaConditions: (lat: number, lng: number) =>
    request<{ data: unknown; isDemo: boolean; source: string; recordedAt: string | null }>(
      `/api/sea-conditions?lat=${lat}&lng=${lng}`
    ),

  // ── Alerts ────────────────────────────────────────────
  listAlerts: (params: { unreadOnly?: boolean } = {}) =>
    request<{ alerts: unknown[] }>("/api/alerts" + (params.unreadOnly ? "?unread=1" : "")),
  markAlertRead: (id: string) =>
    request<{ ok: true }>(`/api/alerts/${id}/read`, { method: "POST" }),
  runAlertEngine: () =>
    request<{ created: number; checked: number }>("/api/alerts/run", { method: "POST" }),

  // ── Fish analysis ─────────────────────────────────────
  analyzeFish: (imageDataUrl: string) =>
    request<{ analysis: import("@/lib/types").FishAnalysisResult }>("/api/fish-analysis", {
      method: "POST",
      body: JSON.stringify({ image: imageDataUrl }),
    }),
  listFishAnalyses: () => request<{ analyses: unknown[] }>("/api/fish-analysis"),
  deleteFishAnalysis: (id: string) =>
    request<{ ok: true }>(`/api/fish-analysis/${id}`, { method: "DELETE" }),

  // ── Locations ────────────────────────────────────────
  listSavedLocations: () => request<{ locations: unknown[] }>("/api/locations"),
  saveLocation: (input: { name: string; lat: number; lng: number; notes?: string; category?: string }) =>
    request<{ location: unknown }>("/api/locations", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteLocation: (id: string) =>
    request<{ ok: true }>(`/api/locations/${id}`, { method: "DELETE" }),
  searchPlaces: (q: string) =>
    request<{ results: unknown[] }>(`/api/places/search?q=${encodeURIComponent(q)}`),
  listFishingSpots: (lat?: number, lng?: number) =>
    request<{ spots: unknown[] }>(
      `/api/fishing-spots${lat != null && lng != null ? `?lat=${lat}&lng=${lng}` : ""}`
    ),

  // ── Notifications ─────────────────────────────────────
  listNotifications: () => request<{ notifications: unknown[] }>("/api/notifications"),
  markNotificationRead: (id: string) =>
    request<{ ok: true }>(`/api/notifications/${id}/read`, { method: "POST" }),

  // ── Admin ────────────────────────────────────────────
  listUsers: () => request<{ users: unknown[] }>("/api/admin/users"),
  updateUserRole: (id: string, role: string, isActive: boolean) =>
    request<{ ok: true }>(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ role, isActive }),
    }),
  getSettings: () => request<{ settings: unknown[] }>("/api/admin/settings"),
  upsertSetting: (input: { key: string; value: string; category?: string }) =>
    request<{ ok: true }>("/api/admin/settings", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getThresholds: () => request<{ thresholds: unknown[] }>("/api/admin/thresholds"),
  upsertThreshold: (input: { metric: string; caution: number; high: number; critical: number; unit: string }) =>
    request<{ ok: true }>("/api/admin/thresholds", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getApiLogs: () => request<{ logs: unknown[] }>("/api/admin/api-logs"),
  getAdminSeaConditions: () => request<{ records: unknown[] }>("/api/admin/sea-conditions"),
  getAdminFishAnalyses: () => request<{ records: unknown[] }>("/api/admin/fish-analyses"),
  getAdminLocations: () => request<{ records: unknown[] }>("/api/admin/locations"),

  // ── Researcher ───────────────────────────────────────────────────────
  // Aggregate + environmental data only (no PII). Guarded by RESEARCHER/ADMIN
  // server-side via `requireRole("RESEARCHER","ADMIN")`.
  researcherSeaConditions: () =>
    request<{ records: unknown[] }>("/api/researcher/sea-conditions"),
  researcherLiveSeaConditions: (lat: number, lng: number) =>
    request<{
      data: import("@/lib/types").SeaConditionData;
      isDemo: boolean;
      source: string;
      recordedAt: string | null;
      label: string;
    }>(`/api/researcher/sea-conditions/live?lat=${lat}&lng=${lng}`),
  researcherFishingData: () =>
    request<{
      speciesDistribution: {
        species: string;
        count: number;
        avgConfidence: number | null;
      }[];
      confidenceBuckets: { bucket: string; count: number }[];
      totalAnalyses: number;
      recentSeaConditions: {
        id: string;
        latitude: number;
        longitude: number;
        locationLabel: string | null;
        source: string;
        isDemo: boolean;
        recordedAt: string;
        payload: string;
      }[];
      alertSummary: { severity: string; count: number; unread: number }[];
      fishingSpots: {
        id: string;
        name: string;
        latitude: number;
        longitude: number;
        region: string | null;
        species: string | null;
        depthM: number | null;
        bottomType: string | null;
        source: string;
      }[];
      monthlyTrend: { month: string; analyses: number }[];
    }>("/api/researcher/fishing-data"),
};
