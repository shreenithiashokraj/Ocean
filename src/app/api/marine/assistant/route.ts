import { NextResponse } from "next/server";
import { marineGuard, auditRequest } from "@/lib/marine/route-helpers";
import {
  collectGrounding,
  factsToPrompt,
  assistantSystemPrompt,
} from "@/lib/marine/assistant/grounding";
import { loadZaiServerConfig, isTransientVlmError } from "@/lib/zai";

export const runtime = "nodejs";

/**
 * POST /api/marine/assistant
 * Body: { question: string, history?: { role: "user"|"assistant", content: string }[] }
 *
 * Pipeline (paper §IX): the REAL database facts are collected first, then the
 * configured LLM (existing server-side Z.AI integration — same provider as AI
 * Fish Analysis) is asked to EXPLAIN those facts in context of the user's
 * question. Response separates:
 *
 *   grounding.facts → the auditable database facts used
 *   answer          → LLM-composed explanation (or null when unconfigured)
 *   llm.configured  → false + setupMessage when no provider key exists
 *
 * The LLM is never asked to invent data and is given no tool to write anything.
 */
interface LlmCompletion {
  choices?: { message?: { content?: unknown } }[];
}
interface LlmClient {
  chat: { completions: { create: (request: Record<string, unknown>) => Promise<LlmCompletion> } };
}

interface ChatMsg { role: "user" | "assistant"; content: string }

function contentToString(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c.map((p) => (typeof p === "object" && p && "text" in (p as Record<string, unknown>) ? String((p as Record<string, unknown>).text) : "")).join("");
  }
  return "";
}

export async function POST(req: Request) {
  const guard = await marineGuard("assistant");
  if (!guard.ok) return guard.response;

  let body: { question?: unknown; history?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 422 });
  }
  if (question.length > 2000) {
    return NextResponse.json({ error: "question too long (max 2000 chars)" }, { status: 422 });
  }

  const history: ChatMsg[] = Array.isArray(body.history)
    ? (body.history as unknown[])
        .filter((m): m is ChatMsg =>
          !!m && typeof m === "object" &&
          ((m as ChatMsg).role === "user" || (m as ChatMsg).role === "assistant") &&
          typeof (m as ChatMsg).content === "string")
        .slice(-8)
    : [];

  // 1. REAL facts from the database (this always happens, LLM or not).
  const grounding = await collectGrounding();
  const factsText = factsToPrompt(grounding);

  // 2. LLM explanation via the EXISTING Z.AI server-side config.
  const { config: zaiConfig, error: configError } = await loadZaiServerConfig();
  let answer: string | null = null;
  let llmError: string | null = null;

  if (!zaiConfig) {
    llmError = configError ?? "AI provider is not configured.";
  } else {
    try {
      const { default: ZAIClass } = await import("z-ai-web-dev-sdk");
      // Same instantiation pattern as the working AI Fish Analysis route:
      // explicit-config client when supported, SDK default otherwise.
      let zai: LlmClient;
      try {
        const Ctor = ZAIClass as unknown as new (cfg: { baseUrl: string; apiKey: string }) => LlmClient;
        zai = new Ctor({ baseUrl: zaiConfig.baseUrl, apiKey: zaiConfig.apiKey });
      } catch {
        const sdk = ZAIClass as unknown as { create: () => Promise<LlmClient> };
        zai = await sdk.create();
      }

      const messages: { role: string; content: string }[] = [
        { role: "system", content: assistantSystemPrompt() },
        { role: "system", content: `REAL DATABASE FACTS (authoritative — do not contradict or extend numerically):\n${factsText}` },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: question },
      ];

      const MAX_ATTEMPTS = 3;
      let completion: { choices?: { message?: { content?: unknown } }[] } | null = null;
      let lastErr: unknown = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          completion = await zai.chat.completions.create({
            model: process.env.Z_AI_ASSISTANT_MODEL?.trim() || "glm-4.6-flash",
            messages,
            thinking: { type: "disabled" },
          });
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          const m = e instanceof Error ? e.message : String(e);
          if (attempt >= MAX_ATTEMPTS || !isTransientVlmError(m)) throw e;
          await new Promise((r) => setTimeout(r, 1200 * attempt));
        }
      }
      if (!completion) throw lastErr ?? new Error("LLM request failed.");
      answer = contentToString(completion.choices?.[0]?.message?.content).trim() || null;
    } catch (e) {
      llmError = e instanceof Error ? e.message : String(e);
    }
  }

  auditRequest({
    userId: guard.session.userId,
    action: "predict",
    resource: "marine.assistant",
    endpoint: "/api/marine/assistant",
    status: 200,
  });

  return NextResponse.json({
    question,
    // The auditable facts (researcher can verify every number).
    grounding: {
      facts: grounding,
      rendered: factsText,
    },
    answer,
    llm: {
      configured: !!zaiConfig,
      error: llmError,
      provider: zaiConfig ? "z.ai (server-side, key never exposed)" : null,
    },
  });
}
