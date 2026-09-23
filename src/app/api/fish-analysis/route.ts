import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logApiCall } from "@/lib/weather";
import type { FishAnalysisResult } from "@/lib/types";
import {
  getFishVisionModel,
  isTransientVlmError,
  loadZaiServerConfig,
  redactApiKey,
} from "@/lib/zai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 8 MB ceiling for the data URL string (covers ~6 MB of binary payload once
// base64 encoded; well within VLM provider limits).
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp"]);

const FISH_MARKET_API_URL = process.env.FISH_MARKET_API_URL?.trim() || "";
const FISH_MARKET_API_KEY = process.env.FISH_MARKET_API_KEY?.trim() || "";

/** Strict JSON-ish parser. Strips ```json fences, extracts the first {...}
 *  balanced block, then JSON.parses. Returns null on failure. */
function parseJsonLoose(raw: string): unknown | null {
  if (!raw) return null;
  let text = raw.trim();
  // Strip ```json ... ``` or ``` ... ``` fences
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // Extract first balanced {...} block
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }
  try {
    return JSON.parse(text);
  } catch {
    // Last resort: try the original trimmed text
    try {
      return JSON.parse(raw.trim());
    } catch {
      return null;
    }
  }
}

/** Coerce the LLM content (string OR array of content blocks) into a string. */
function contentToString(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const p = part as Record<string, unknown>;
          if (typeof p.text === "string") return p.text;
          if (typeof p.content === "string") return p.content;
        }
        return "";
      })
      .join("\n");
  }
  // Some SDKs return an object with .text
  if (typeof content === "object") {
    const c = content as Record<string, unknown>;
    if (typeof c.text === "string") return c.text;
  }
  return String(content);
}

/** Build the strict-prediction prompt for the VLM. */
function buildPrompt(): string {
  return [
    "You are a marine-biology AI assistant helping a fisherman identify a fish",
    "from a photo. This is a PREDICTION, not a confirmed identification.",
    "",
    "Analyze the fish in the attached image and respond with ONLY a JSON object",
    "(no markdown, no commentary, no code fences). The JSON MUST have exactly",
    "these fields:",
    "",
    "{",
    '  "species": "<best-guess common name, or null if no fish is visible>",',
    '  "confidence": <number 0..1 — your confidence in the species identification>,',
    '  "alternatives": [ { "species": "<name>", "confidence": <0..1> } ],',
    '  "sizeRange": "<estimated total-length range, e.g. \\"30-50 cm\\", or null>",',
    '  "weightRange": "<estimated weight range, e.g. \\"0.5-1.5 kg\\", or null>",',
    '  "characteristics": ["<short identifying bullet>", "..."],',
    '  "notes": "<1-3 sentence identification note for the fisherman>",',
    '  "qualityWarning": "<null, OR a short tag like \\"blurry\\", \\"low light\\", \\"partial view\\", \\"out of water\\">',
    "}",
    "",
    "Rules:",
    "- If no fish is visible, set species=null, confidence=0, alternatives=[].",
    "- confidence is a fraction (0.0 to 1.0), not a percentage.",
    "- Keep each characteristics string under ~80 characters.",
    "- Never invent market prices; the application handles pricing separately.",
    "- Output ONLY the JSON object.",
  ].join("\n");
}

/** Map a parsed JSON object into a FishAnalysisResult, with sensible nulls. */
function mapAnalysis(obj: unknown): FishAnalysisResult {
  const o = (obj ?? {}) as Record<string, unknown>;
  const clamp = (n: unknown): number | null => {
    let v: number;
    if (typeof n === "number") v = n;
    else if (typeof n === "string") {
      const parsed = parseFloat(n);
      if (!isFinite(parsed)) return null;
      v = parsed;
    } else return null;
    // accept either 0..1 fractions or 0..100 percentages
    if (v > 1) v = v / 100;
    if (!isFinite(v)) return null;
    return Math.max(0, Math.min(1, v));
  };
  const str = (v: unknown): string | null => {
    if (v == null) return null;
    if (typeof v === "string") {
      const t = v.trim();
      return t.length ? t : null;
    }
    const t = String(v).trim();
    return t.length ? t : null;
  };
  const arrAlt = (v: unknown): { species: string; confidence: number }[] | null => {
    if (!Array.isArray(v)) return null;
    const out: { species: string; confidence: number }[] = [];
    for (const item of v) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      const sp = str(it.species);
      if (!sp) continue;
      out.push({ species: sp, confidence: clamp(it.confidence) ?? 0 });
    }
    return out;
  };
  const arrStr = (v: unknown): string[] | null => {
    if (!Array.isArray(v)) return null;
    const out = v
      .map((x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim()))
      .filter((x) => x.length > 0);
    return out.length ? out : null;
  };
  return {
    species: str(o.species),
    confidence: clamp(o.confidence),
    alternatives: arrAlt(o.alternatives),
    sizeRange: str(o.sizeRange),
    weightRange: str(o.weightRange),
    characteristics: arrStr(o.characteristics),
    notes: str(o.notes),
    qualityWarning: str(o.qualityWarning),
    market: null, // set by caller when a real market API is configured
  };
}

/** ─── POST /api/fish-analysis — analyze an image with the VLM ──────────────── */
export async function POST(req: Request) {
  const startedAt = Date.now();
  const session = await requireUser();
  if (!session) {
    await logApiCall({
      userId: null,
      service: "fish-analysis",
      endpoint: "/api/fish-analysis",
      method: "POST",
      status: 401,
      message: "unauthenticated",
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { image?: unknown };
  try {
    body = (await req.json()) as { image?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const image = typeof body.image === "string" ? body.image : "";
  if (!image) {
    return NextResponse.json(
      { error: "Missing 'image' field (expected a data URL)." },
      { status: 422 },
    );
  }
  if (!image.startsWith("data:image/")) {
    return NextResponse.json(
      { error: "Image must be a data URL starting with 'data:image/'." },
      { status: 422 },
    );
  }
  const semi = image.indexOf(";");
  const mime = image.slice(5, semi === -1 ? image.length : semi).toLowerCase();
  if (!ALLOWED_MEDIA.has(mime)) {
    return NextResponse.json(
      { error: `Unsupported image type '${mime}'. Allowed: jpeg, png, webp.` },
      { status: 422 },
    );
  }
  if (image.length > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `Image is too large (${(image.length / 1024 / 1024).toFixed(1)} MB). Max ~8 MB.` },
      { status: 422 },
    );
  }

  // ─── Call the Vision Language Model ─────────────────────────────────────
  // Server-side only: resolve the Z.AI key from env vars or .z-ai-config.
  // The key is never sent to, or readable from, the browser.
  const { config: zaiConfig, error: configError } = await loadZaiServerConfig();
  if (!zaiConfig) {
    await logApiCall({
      userId: session.sub,
      service: "fish-analysis",
      endpoint: "/api/fish-analysis",
      method: "POST",
      status: 503,
      durationMs: Date.now() - startedAt,
      message: "VLM skipped: no Z.AI API key configured",
    });
    return NextResponse.json(
      {
        error:
          configError ??
          "AI analysis is not configured. Please set up your Z.AI API key in the .z-ai-config file.",
      },
      { status: 503 },
    );
  }

  let analysis: FishAnalysisResult;
  let rawForDb: string;
  let vlmStatus = 200;
  let vlmMessage: string | undefined;

  try {
    // Dynamically import the SDK so it can never be bundled into client code.
    // The SDK's static create() only reads .z-ai-config files, so we pass the
    // resolved credentials explicitly to support env-var configuration too.
    const ZAIModule = await import("z-ai-web-dev-sdk");
    const ZAI = (ZAIModule as { default?: unknown }).default ?? ZAIModule;
    const ZAIClass = ZAI as {
      create: () => Promise<VLMClient>;
      prototype?: unknown;
    };
    let zai: VLMClient;
    try {
      // Prefer explicit construction with our resolved config.
      zai = new (
        ZAIClass as unknown as new (cfg: {
          baseUrl: string;
          apiKey: string;
        }) => VLMClient
      )({ baseUrl: zaiConfig.baseUrl, apiKey: zaiConfig.apiKey });
    } catch {
      zai = await ZAIClass.create();
    }

    const visionRequest = {
      // Real, documented Z.AI endpoint: POST {baseUrl}/chat/completions with
      // multimodal content (text + image_url). NOTE: the SDK's separate
      // `createVision` helper posts to {baseUrl}/chat/completions/vision,
      // which does NOT exist on api.z.ai (returns 404), so it is not used.
      model: getFishVisionModel(),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildPrompt() },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    } as Parameters<typeof zai.chat.completions.create>[0];

    // The free vision model occasionally answers with a transient capacity
    // error (Z.AI code 1305 "service temporarily overloaded"); retry briefly.
    const MAX_ATTEMPTS = 3;
    let completion: Awaited<ReturnType<typeof zai.chat.completions.create>> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        completion = await zai.chat.completions.create(visionRequest);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        const m = e instanceof Error ? e.message : String(e);
        if (attempt >= MAX_ATTEMPTS || !isTransientVlmError(m)) throw e;
        await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
    }
    if (!completion) throw lastErr ?? new Error("Z.AI vision request failed.");

    const rawContent = contentToString(completion.choices?.[0]?.message?.content);
    rawForDb = JSON.stringify({
      ok: true,
      content: rawContent,
      finishReason: completion.choices?.[0]?.finish_reason ?? null,
    });

    const parsed = parseJsonLoose(rawContent);
    if (parsed && typeof parsed === "object") {
      analysis = mapAnalysis(parsed);
      vlmMessage = analysis.species ? `identified: ${analysis.species}` : "no species identified";
    } else {
      // Fallback: keep the raw text as notes; null species so the UI shows a warning.
      analysis = {
        species: null,
        confidence: null,
        alternatives: null,
        sizeRange: null,
        weightRange: null,
        characteristics: null,
        notes: rawContent?.trim()
          ? `AI returned a non-JSON response. Summary: ${rawContent.trim().slice(0, 400)}`
          : "AI did not return a usable response for this image.",
        qualityWarning: "AI response could not be parsed",
        market: null,
      };
      vlmStatus = 200; // request succeeded; we just couldn't parse it
      vlmMessage = "non-JSON AI response — fallback used";
    }
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const safeMsg = redactApiKey(rawMsg, zaiConfig);
    rawForDb = JSON.stringify({ ok: false, error: safeMsg });
    const lowered = safeMsg.toLowerCase();
    const authFailure =
      lowered.includes("401") ||
      lowered.includes("403") ||
      lowered.includes("unauthorized") ||
      lowered.includes("invalid api key") ||
      lowered.includes("invalid_api_key") ||
      lowered.includes("incorrect api key");
    // Z.AI billing/resource-package errors. Matched on the specific billing
    // signals (code 1113 / balance / resource package), NOT on a bare "429",
    // because Z.AI also returns 429 for transient capacity errors (code 1305).
    const quotaFailure =
      lowered.includes("1113") ||
      lowered.includes("insufficient balance") ||
      lowered.includes("insufficient_account_balance") ||
      lowered.includes("no resource package") ||
      lowered.includes("resource package") ||
      lowered.includes("insufficient quota") ||
      lowered.includes("recharge") ||
      lowered.includes("no permission to use");
    let userMessage: string;
    if (authFailure) {
      userMessage =
        "AI analysis failed: the Z.AI API key was rejected (invalid key). " +
        "Update Z_AI_API_KEY (or .z-ai-config) with a valid key from " +
        "https://z.ai/manage-apikey/apikey-list and restart the server.";
    } else if (quotaFailure) {
      userMessage =
        "Z.AI vision service is unavailable because this account does not have " +
        "sufficient balance or an active vision resource package. Please " +
        "recharge/activate the Z.AI vision service and try again.";
    } else if (isTransientVlmError(safeMsg)) {
      userMessage =
        "AI analysis is temporarily unavailable: the Z.AI vision service is " +
        "busy right now. Please try again in a few seconds.";
    } else {
      userMessage = `AI analysis failed: ${safeMsg}`;
    }
    analysis = {
      species: null,
      confidence: null,
      alternatives: null,
      sizeRange: null,
      weightRange: null,
      characteristics: null,
      notes: userMessage,
      qualityWarning: null,
      market: null,
    };
    await logApiCall({
      userId: session.sub,
      service: "fish-analysis",
      endpoint: "/api/fish-analysis",
      method: "POST",
      status: 502,
      durationMs: Date.now() - startedAt,
      message: `VLM error: ${safeMsg.slice(0, 200)}`,
    });
    // Persist the failed attempt so the fisherman sees a record of it.
    try {
      await db.fishAnalysis.create({
        data: {
          userId: session.sub,
          imageDataUrl: image,
          species: null,
          confidence: null,
          alternatives: null,
          sizeRange: null,
          weightRange: null,
          characteristics: null,
          notes: analysis.notes,
          qualityWarning: null,
          pricePerKg: null,
          currency: null,
          market: null,
          priceDate: null,
          priceSource: null,
          rawResponse: rawForDb,
        },
      });
    } catch {
      /* best-effort */
    }
    return NextResponse.json(
      { error: userMessage, analysis },
      { status: 502 },
    );
  }

  // ─── Market price (only if a real price API is configured) ───────────────
  // NEVER invent prices. If FISH_MARKET_API_URL/KEY are unset, market stays null.
  // When a real provider is wired in, populate analysis.market here from the
  // real API response (pricePerKg, currency, market, priceDate, source).
  if (FISH_MARKET_API_URL && FISH_MARKET_API_KEY && analysis.species) {
    // intentionally unimplemented — no provider configured
  }

  // ─── Persist the analysis row ────────────────────────────────────────────
  let row: {
    id: string;
    createdAt: Date;
  };
  try {
    row = await db.fishAnalysis.create({
      data: {
        userId: session.sub,
        imageDataUrl: image,
        species: analysis.species,
        confidence: analysis.confidence,
        alternatives: analysis.alternatives ? JSON.stringify(analysis.alternatives) : null,
        sizeRange: analysis.sizeRange,
        weightRange: analysis.weightRange,
        characteristics: analysis.characteristics ? JSON.stringify(analysis.characteristics) : null,
        notes: analysis.notes,
        qualityWarning: analysis.qualityWarning,
        pricePerKg: analysis.market?.pricePerKg ?? null,
        currency: analysis.market?.currency ?? null,
        market: analysis.market?.market ?? null,
        priceDate: analysis.market?.priceDate ? new Date(analysis.market.priceDate) : null,
        priceSource: analysis.market?.source ?? null,
        rawResponse: rawForDb,
      },
      select: { id: true, createdAt: true },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logApiCall({
      userId: session.sub,
      service: "fish-analysis",
      endpoint: "/api/fish-analysis",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
      message: `DB persist failed: ${msg}`,
    });
    return NextResponse.json(
      { error: "Failed to save analysis.", analysis },
      { status: 500 },
    );
  }

  await logApiCall({
    userId: session.sub,
    service: "fish-analysis",
    endpoint: "/api/fish-analysis",
    method: "POST",
    status: vlmStatus,
    durationMs: Date.now() - startedAt,
    message: vlmMessage,
  });

  return NextResponse.json({
    analysis,
    id: row.id,
    createdAt: row.createdAt.toISOString(),
  });
}

/** ─── GET /api/fish-analysis — list the current user's analyses ──────────── */
export async function GET() {
  const startedAt = Date.now();
  const session = await requireUser();
  if (!session) {
    await logApiCall({
      userId: null,
      service: "fish-analysis",
      endpoint: "/api/fish-analysis",
      method: "GET",
      status: 401,
      message: "unauthenticated",
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rows: Awaited<ReturnType<typeof db.fishAnalysis.findMany>>;
  try {
    rows = await db.fishAnalysis.findMany({
      where: { userId: session.sub },
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logApiCall({
      userId: session.sub,
      service: "fish-analysis",
      endpoint: "/api/fish-analysis",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
      message: `list failed: ${msg}`,
    });
    return NextResponse.json({ error: "Failed to load analyses." }, { status: 500 });
  }

  const analyses = rows.map((r) => ({
    id: r.id,
    imageDataUrl: r.imageDataUrl,
    species: r.species,
    confidence: r.confidence,
    alternatives: r.alternatives
      ? (JSON.parse(r.alternatives) as { species: string; confidence: number }[])
      : null,
    sizeRange: r.sizeRange,
    weightRange: r.weightRange,
    characteristics: r.characteristics ? (JSON.parse(r.characteristics) as string[]) : null,
    notes: r.notes,
    qualityWarning: r.qualityWarning,
    market:
      r.pricePerKg || r.market
        ? {
            pricePerKg: r.pricePerKg,
            currency: r.currency,
            market: r.market,
            priceDate: r.priceDate ? r.priceDate.toISOString() : null,
            source: r.priceSource,
          }
        : null,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json({ analyses });
}

// Minimal structural type for the SDK chat client. `create` posts to the real
// Z.AI endpoint ({baseUrl}/chat/completions) and accepts multimodal content
// (text + image_url), which is what the vision analysis needs.
interface VLMClient {
  chat: {
    completions: {
      create: (input: {
        /** Vision-capable Z.AI model id (e.g. glm-4.6v). */
        model?: string;
        messages: {
          role: string;
          content:
            | string
            | Array<
                | { type: "text"; text: string }
                | { type: "image_url"; image_url: { url: string } }
              >;
        }[];
        thinking?: { type: "disabled" | "enabled" };
      }) => Promise<{
        choices?: {
          finish_reason?: string;
          message?: { content?: unknown };
        }[];
      }>;
    };
  };
}
