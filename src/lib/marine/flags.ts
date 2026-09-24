/**
 * Marine AI-Driven Unified Data Platform — feature flags (isolated namespace).
 *
 * Every marine API route calls `marineEnabled()` first and returns 503 when
 * the platform is disabled, so the whole Marine layer can be switched off (or
 * rolled back) without redeploying or touching any existing Fisherman Module
 * code. The flag lives in the environment (`MARINE_PLATFORM_ENABLED`) and is
 * read on every request — no caching — so flipping it only needs a server
 * restart, never a rebuild.
 *
 * SAFETY: this module is additive and self-contained. It does not import,
 * modify or depend on any existing module's behavior.
 */

export const MARINE_FLAG_ENV = "MARINE_PLATFORM_ENABLED";

/** Read the master switch for the Marine Platform. Default: disabled. */
export function marineEnabled(): boolean {
  const raw = process.env[MARINE_FLAG_ENV];
  if (raw === undefined || raw === null) return false;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Per-feature sub-flags — allow disabling individual marine capabilities
 * independently of the master switch (fine-grained rollback).
 * All default to enabled when the master flag is on.
 */
export type MarineFeature =
  | "ingest"
  | "search"
  | "ai"
  | "workspaces"
  | "annotations"
  | "audit"
  | "external-api"
  | "biodiversity"
  | "edna"
  | "assistant"
  | "exports";

export const MARINE_FEATURE_ENV: Record<MarineFeature, string> = {
  ingest: "MARINE_ENABLE_INGEST",
  search: "MARINE_ENABLE_SEARCH",
  ai: "MARINE_ENABLE_AI",
  workspaces: "MARINE_ENABLE_WORKSPACES",
  annotations: "MARINE_ENABLE_ANNOTATIONS",
  audit: "MARINE_ENABLE_AUDIT",
  "external-api": "MARINE_ENABLE_EXTERNAL_API",
  biodiversity: "MARINE_ENABLE_BIODIVERSITY",
  edna: "MARINE_ENABLE_EDNA",
  assistant: "MARINE_ENABLE_ASSISTANT",
  exports: "MARINE_ENABLE_EXPORTS",
};

/** Master switch AND the individual sub-flag must both be on. */
export function marineFeatureEnabled(feature: MarineFeature): boolean {
  if (!marineEnabled()) return false;
  const env = process.env[MARINE_FEATURE_ENV[feature]];
  if (env === undefined || env === null) return true; // default: on
  const v = String(env).trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
}

/** Roles allowed to use Marine Platform features (decision: no FISHERMAN yet). */
export const MARINE_ALLOWED_ROLES = ["RESEARCHER", "ADMIN"] as const;

export type MarineRole = (typeof MARINE_ALLOWED_ROLES)[number];

export function marineRoleAllowed(role: string | undefined | null): boolean {
  if (!role) return false;
  return (MARINE_ALLOWED_ROLES as readonly string[]).includes(role);
}

/** Standard JSON body for a disabled platform response. */
export function disabledResponse(): { status: number; body: { error: string; marinePlatform: "disabled" } } {
  return {
    status: 503,
    body: {
      error: "Marine Platform is disabled on this deployment (MARINE_PLATFORM_ENABLED).",
      marinePlatform: "disabled",
    },
  };
}
