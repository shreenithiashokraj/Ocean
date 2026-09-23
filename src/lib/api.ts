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

export interface MarineRecordDetail {
  label: string;
  value: string;
}

/** One normalized record returned by the Unified Data Explorer. */
export interface MarineRecordRow {
  id: string;
  datasetKey: string;
  datasetName: string;
  domainKey: string | null;
  domainLabel: string;
  title: string;
  taxon: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  occurredAt: string | null;
  source: string;
  status: string;
  details: MarineRecordDetail[];
}

export interface ExplorerDomainInfo {
  key: string;
  label: string;
  datasetKeys: string[];
  note: string | null;
  hasSource: boolean;
  recordCount: number;
}

export interface MarineRecordSearchResult {
  records: MarineRecordRow[];
  total: number;
  page: number;
  pageSize: number;
  truncated: boolean;
  domains: ExplorerDomainInfo[];
  sources: string[];
}

export interface MarineRecordQuery {
  domain?: string;
  dataset?: string;
  search?: string;
  source?: string;
  location?: string;
  taxon?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
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

  // ── Phase 2: profile & preferences ────────────────────────────────────
  getProfile: () =>
    request<{ profile: Record<string, unknown> }>("/api/profile"),
  updateProfile: (input: Record<string, unknown>) =>
    request<{ ok: true; profile: Record<string, unknown> }>("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  // ── Phase 2: alert lifecycle ──────────────────────────────────────────
  acknowledgeAlert: (id: string) =>
    request<{ ok: true; status: string }>(`/api/alerts/${id}/acknowledge`, {
      method: "POST",
    }),
  resolveAlert: (id: string) =>
    request<{ ok: true; status: string }>(`/api/alerts/${id}/resolve`, {
      method: "POST",
    }),

  // ── Phase 2: notification center ──────────────────────────────────────
  deleteNotification: (id: string) =>
    request<{ ok: true }>(`/api/notifications/${id}`, { method: "DELETE" }),
  readAllNotifications: () =>
    request<{ ok: true; updated: number }>("/api/notifications/read-all", {
      method: "POST",
    }),

  // ── Phase 3: catch logging ────────────────────────────────────────────
  listCatches: (params: { from?: string; to?: string; species?: string; location?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.species) qs.set("species", params.species);
    if (params.location) qs.set("location", params.location);
    const q = qs.toString();
    return request<{ catches: import("@/lib/types").CatchRecord[] }>(
      `/api/catches${q ? `?${q}` : ""}`
    );
  },
  createCatch: (input: import("@/lib/types").CatchRecordInput) =>
    request<{ catch: import("@/lib/types").CatchRecord }>("/api/catches", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateCatch: (id: string, input: import("@/lib/types").CatchRecordInput) =>
    request<{ catch: import("@/lib/types").CatchRecord }>(`/api/catches/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deleteCatch: (id: string) =>
    request<{ ok: true }>(`/api/catches/${id}`, { method: "DELETE" }),

  // ── Phase 3: SOS / emergency ──────────────────────────────────────────
  listSosEvents: () =>
    request<{ events: import("@/lib/types").SosEvent[] }>("/api/sos"),
  createSosEvent: (input: import("@/lib/types").SosEventInput) =>
    request<{ event: import("@/lib/types").SosEvent }>("/api/sos", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateSosStatus: (id: string, status: "RESOLVED" | "CANCELLED") =>
    request<{ event: import("@/lib/types").SosEvent }>(`/api/sos/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  // ── Phase 2: researcher datasets + GIS + reports ─────────────────────
  listResearcherDatasets: () =>
    request<{
      datasets: {
        key: string;
        name: string;
        description: string;
        dataType: string;
        source: string;
        status: string;
        fields: { key: string; label: string; type: string; options?: string[] }[];
        recordCount: number;
        coverage: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
        lastUpdated: string | null;
      }[];
    }>("/api/researcher/datasets"),
  getResearcherDataset: (key: string, params: { page?: number; pageSize?: number; search?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.pageSize) qs.set("pageSize", String(params.pageSize));
    if (params.search) qs.set("search", params.search);
    const q = qs.toString();
    return request<{
      dataset: {
        key: string;
        name: string;
        description: string;
        dataType: string;
        source: string;
        status: string;
        fields: { key: string; label: string; type: string; options?: string[] }[];
      };
      records: Record<string, unknown>[];
      total: number;
      page: number;
      pageSize: number;
      recordCount: number;
      coverage: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
    }>(`/api/researcher/datasets/${encodeURIComponent(key)}${q ? `?${q}` : ""}`);
  },
  /** Unified Data Explorer — cross-domain marine record search. */
  searchMarineRecords: (params: MarineRecordQuery = {}) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      qs.set(key, String(value));
    }
    const q = qs.toString();
    return request<MarineRecordSearchResult>(
      `/api/researcher/explorer${q ? `?${q}` : ""}`
    );
  },
  getResearcherGis: (sources?: string[]) =>
    request<{
      points: {
        lat: number;
        lng: number;
        dataset: string;
        label: string;
        detail?: Record<string, unknown>;
      }[];
      total: number;
    }>(
      `/api/researcher/gis${
        sources && sources.length ? `?sources=${encodeURIComponent(sources.join(","))}` : ""
      }`
    ),
  listResearcherReports: () =>
    request<{ reports: Record<string, unknown>[] }>("/api/researcher/reports"),
  createResearcherReport: (input: {
    title: string;
    description?: string;
    datasetKey: string;
    filters?: unknown;
    summary?: unknown;
  }) =>
    request<{ ok: true; report: Record<string, unknown> }>("/api/researcher/reports", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteResearcherReport: (id: string) =>
    request<{ ok: true }>(`/api/researcher/reports/${id}`, { method: "DELETE" }),

  // ── Phase 2: admin API health ─────────────────────────────────────────
  getApiHealth: () =>
    request<{
      overall: "healthy" | "degraded" | "unavailable";
      services: {
        service: string;
        health: "healthy" | "degraded" | "unavailable";
        total: number;
        errors: number;
        lastStatus: number | null;
        lastAt: string | null;
        p95Ms: number | null;
      }[];
    }>("/api/admin/api-health"),
};
