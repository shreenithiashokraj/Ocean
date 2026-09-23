/**
 * Server-side Z.AI configuration loader for AI Fish Analysis.
 * Import ONLY from server-side code (API routes). Never exposes the key.
 *
 * Order: 1) Z_AI_API_KEY env 2) ZAI_API_KEY env 3) .z-ai-config file
 * (cwd, then home, then /etc — same search the SDK itself uses).
 */

export interface ZaiServerConfig {
  baseUrl: string;
  apiKey: string;
  source: "env:Z_AI_API_KEY" | "env:ZAI_API_KEY" | "file";
  configPath?: string;
}

export const ZAI_DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";

/** Vision-capable model used for fish image analysis.
 *  Defaults to Z.AI's free vision model (`glm-4.6v-flash`), which works on a
 *  free Z.AI account. Set Z_AI_VISION_MODEL=glm-4.6v for the higher-quality
 *  paid model when your account has balance. */
export function getFishVisionModel(): string {
  const fromEnv = process.env.Z_AI_VISION_MODEL?.trim();
  return fromEnv || "glm-4.6v-flash";
}

/** True when the Z.AI error is a transient capacity/rate issue worth retrying.
 *  Billing/resource-package and auth errors are never transient. */
export function isTransientVlmError(message: string): boolean {
  const m = message.toLowerCase();
  if (
    m.includes("insufficient balance") ||
    m.includes("insufficient_account_balance") ||
    m.includes("no resource package") ||
    m.includes("resource package") ||
    m.includes("insufficient quota") ||
    m.includes("1113") ||
    m.includes("recharge") ||
    m.includes("unauthorized") ||
    m.includes("invalid api key") ||
    m.includes("invalid_api_key") ||
    m.includes("incorrect api key")
  ) {
    return false;
  }
  return (
    m.includes("1305") ||
    m.includes("temporarily overloaded") ||
    m.includes("overloaded") ||
    m.includes("too many requests") ||
    m.includes("rate limit") ||
    m.includes("timeout") ||
    m.includes("econnreset") ||
    m.includes("socket hang up") ||
    m.includes("fetch failed")
  );
}

export function isPlaceholderKey(value: string | undefined | null): boolean {
  if (!value) return true;
  const v = value.trim();
  if (!v) return true;
  const upper = v.toUpperCase();
  if (
    upper === "YOUR_API_KEY_HERE" ||
    upper === "YOUR_API_KEY" ||
    upper === "REPLACE_ME" ||
    upper === "CHANGE_ME" ||
    upper === "PLACEHOLDER" ||
    upper === "TODO" ||
    upper === "NULL" ||
    upper === "NONE"
  ) {
    return true;
  }
  if (upper.includes("YOUR_API_KEY") || upper.includes("EXAMPLE")) return true;
  return false;
}

export type ZaiConfigErrorCode = "missing" | "placeholder" | "invalid_file";

export interface ZaiConfigLoadResult {
  config: ZaiServerConfig | null;
  error: string | null;
  errorCode: ZaiConfigErrorCode | null;
}

const SETUP_HINT =
  "Get a key at https://z.ai/manage-apikey/apikey-list, then set the Z_AI_API_KEY " +
  "environment variable (server-side) or put the key in .z-ai-config " +
  "({ baseUrl: https://api.z.ai/api/paas/v4, apiKey: <your key> }). " +
  "A server restart is required after changing the configuration.";

export async function loadZaiServerConfig(): Promise<ZaiConfigLoadResult> {
  const directEnv = process.env.Z_AI_API_KEY?.trim() || "";
  const aliasEnv = process.env.ZAI_API_KEY?.trim() || "";
  const envKey = directEnv || aliasEnv;
  if (envKey) {
    if (isPlaceholderKey(envKey)) {
      return {
        config: null,
        error:
          "AI analysis is not configured. The Z_AI_API_KEY environment variable " +
          `holds a placeholder value. ${SETUP_HINT}`,
        errorCode: "placeholder",
      };
    }
    const baseUrl =
      process.env.Z_AI_BASE_URL?.trim().replace(/\/+$/, "") || ZAI_DEFAULT_BASE_URL;
    const source = directEnv ? "env:Z_AI_API_KEY" : "env:ZAI_API_KEY";
    return { config: { baseUrl, apiKey: envKey, source }, error: null, errorCode: null };
  }

  const { default: nodePath } = await import("node:path");
  const { default: nodeOs } = await import("node:os");
  const candidates = [
    nodePath.join(process.cwd(), ".z-ai-config"),
    nodePath.join(nodeOs.homedir(), ".z-ai-config"),
    "/etc/.z-ai-config",
  ];
  let sawPlaceholder = false;
  for (const filePath of candidates) {
    try {
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(/*turbopackIgnore: true*/ filePath, "utf-8");
      let parsed: { baseUrl?: unknown; apiKey?: unknown };
      try {
        parsed = JSON.parse(raw) as { baseUrl?: unknown; apiKey?: unknown };
      } catch {
        continue;
      }
      const apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "";
      if (!apiKey) continue;
      if (isPlaceholderKey(apiKey)) {
        sawPlaceholder = true;
        continue;
      }
      const baseUrl =
        typeof parsed.baseUrl === "string" && parsed.baseUrl.trim()
          ? parsed.baseUrl.trim().replace(/\/+$/, "")
          : ZAI_DEFAULT_BASE_URL;
      return {
        config: { baseUrl, apiKey, source: "file", configPath: filePath },
        error: null,
        errorCode: null,
      };
    } catch {
      continue;
    }
  }

  if (sawPlaceholder) {
    return {
      config: null,
      error:
        "AI analysis is not configured. The .z-ai-config file still contains the " +
        'placeholder API key ("YOUR_API_KEY_HERE"). ' + SETUP_HINT,
      errorCode: "placeholder",
    };
  }
  return {
    config: null,
    error: "AI analysis is not configured. No Z.AI API key was found. " + SETUP_HINT,
    errorCode: "missing",
  };
}

export function redactApiKey(message: string, config: ZaiServerConfig | null): string {
  if (!message) return message;
  let out = message;
  if (config?.apiKey) {
    const key = config.apiKey.trim();
    if (key.length >= 8) out = out.split(key).join("[redacted]");
  }
  out = out.replace(/Bearer\s+[A-Za-z0-9._\-+/=]{8,}/g, "Bearer [redacted]");
  return out;
}

