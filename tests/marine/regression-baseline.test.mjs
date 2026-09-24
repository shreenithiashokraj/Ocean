/**
 * Marine Platform — regression baseline + Feature 1 integration tests.
 *
 * Run with the dev server listening on :3000:
 *
 *   node --test tests/marine/
 *
 * Uses Node's built-in `node:test` runner — no new dependencies.
 * Assertions check contract shapes (status codes + JSON field presence) so
 * they hold regardless of the deployment's auth session state.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.MARINE_TEST_BASE_URL ?? "http://localhost:3000";

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body is fine; callers assert on status first */
  }
  return { status: res.status, body };
}

// ── Existing auth endpoints (must be unaffected) ────────────────────────────

test("existing: GET /api/auth/me answers 200 with a user-or-null contract", async () => {
  const { status, body } = await getJson("/api/auth/me");
  assert.equal(status, 200, "auth/me must keep answering 200");
  assert.ok(body && typeof body === "object", "auth/me must return JSON");
  assert.ok("user" in body, "auth/me contract must expose a `user` field");
  assert.ok(
    body.user === null || (typeof body.user === "object" && "role" in body.user),
    "user must be null or an object with a role"
  );
});

test("existing: POST /api/auth/sign-in rejects a malformed body with 4xx", async () => {
  const res = await fetch(`${BASE}/api/auth/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "not-an-email" }),
  });
  assert.ok(
    res.status >= 400 && res.status < 500,
    `sign-in with invalid body must 4xx, got ${res.status}`
  );
});

// ── Existing researcher endpoints (must be unaffected) ──────────────────────

test("existing: /api/researcher/* stays guarded (401/403 without a researcher session)", async () => {
  const { status, body } = await getJson("/api/researcher/datasets");
  assert.ok([401, 403].includes(status), `expected 401/403, got ${status}`);
  assert.ok(body && typeof body.error === "string", "guard response keeps its error contract");
});

test("existing: /api/researcher/explorer stays guarded", async () => {
  const { status } = await getJson("/api/researcher/explorer?domain=all");
  assert.ok([401, 403].includes(status), `expected 401/403, got ${status}`);
});

test("existing: /api/sea-conditions stays guarded", async () => {
  const { status } = await getJson("/api/sea-conditions?lat=13.08&lng=80.27");
  assert.ok([401, 403].includes(status), `expected 401/403, got ${status}`);
});

// ── Marine Platform flag endpoint ────────────────────────────────────────────

test("marine: GET /api/marine/status answers 200 and reports its flag state", async () => {
  const { status, body } = await getJson("/api/marine/status");
  assert.equal(status, 200, "status endpoint must always answer");
  assert.ok(typeof body.enabled === "boolean", "status must expose boolean `enabled`");
  assert.ok(
    body.marinePlatform === "enabled" || body.marinePlatform === "disabled",
    "status must expose marinePlatform state"
  );
  assert.ok(body.features && typeof body.features === "object", "status must expose per-feature flags");
  assert.deepEqual(body.allowedRoles, ["RESEARCHER", "ADMIN"], "no FISHERMAN access at this stage");
});

// ── Feature 1: Species & Biodiversity ────────────────────────────────────────

const BIODIVERSITY_ROUTES = [
  "/api/marine/biodiversity/species",
  "/api/marine/biodiversity/diversity",
  "/api/marine/biodiversity/observations",
];

test("feature1: biodiversity routes answer 503 + disabled marker when flag off", async () => {
  const { body } = await getJson("/api/marine/status");
  if (body.enabled && body.features?.biodiversity) return; // enabled deployment

  for (const path of BIODIVERSITY_ROUTES) {
    const res = await fetch(`${BASE}${path}`);
    assert.equal(res.status, 503, `${path} must 503 while disabled`);
    const b = await res.json();
    assert.equal(b.marinePlatform, "disabled", `${path} must carry the disabled marker`);
  }
});

test("feature1: sync endpoint 503 when disabled; 401/403 unauth when enabled", async () => {
  const { body } = await getJson("/api/marine/status");
  const res = await fetch(`${BASE}/api/marine/biodiversity/sync`, { method: "POST" });
  if (body.enabled && body.features?.biodiversity) {
    assert.ok([401, 403].includes(res.status), `enabled + unauth must 401/403, got ${res.status}`);
  } else {
    assert.equal(res.status, 503, "disabled sync must 503");
  }
});

test("feature1: existing researcher dataset endpoints unchanged", async () => {
  const { status } = await getJson("/api/researcher/datasets");
  assert.ok([401, 403].includes(status), `researcher guard intact, got ${status}`);
});

// ── Phase-1 baseline (unchanged contract) ────────────────────────────────────

test("marine: disabled platform → no live marine data route (404 until Phase 2, then 503)", async () => {
  const { body } = await getJson("/api/marine/status");
  if (body.enabled) return; // flag on in this deployment — nothing to assert
  const res = await fetch(`${BASE}/api/marine/records`);
  assert.ok([404, 503].includes(res.status), `expected 404 or 503, got ${res.status}`);
  if (res.status === 503) {
    const disabledBody = await res.json();
    assert.equal(disabledBody.marinePlatform, "disabled");
  }
});