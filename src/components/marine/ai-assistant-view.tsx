"use client";

/**
 * Marine Platform · Researcher module — AI Research Assistant.
 *
 * Chat UI over /api/marine/assistant. The backend collects REAL database
 * facts first, then the configured server-side LLM (existing Z.AI provider)
 * explains them. Response separates `answer` (LLM) from `grounding`
 * (auditable DB facts). Unconfigured provider → setup message + real facts,
 * never fabricated text.
 */
import { useEffect, useRef, useState } from "react";
import { FlaskConical, Send, Loader2, Database, TriangleAlert, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Grounding {
  facts: {
    distinctSpeciesCount: number;
    totalObservations: number;
    observedSpecies: { name: string; count: number }[];
    edna: { totalAsvs: number; taxonomicallyResolved: number; referenceDatabase: { connected: boolean } };
    availableEnvironmentalParameters: string[];
    environmentalSnapshotCount: number;
    catchSpecies: { name: string; totalQuantity: number }[];
    fishingSpotsWithSpecies: number;
    datasetRecordCount: number;
  };
  rendered: string;
}

interface AssistantResponse {
  question: string;
  answer: string | null;
  grounding: Grounding;
  llm: { configured: boolean; error: string | null; provider: string | null };
}

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  grounding?: Grounding;
  llmWarning?: string | null;
}

const SUGGESTIONS = [
  "What species are present in the observations?",
  "Summarize the biodiversity of the recorded cells.",
  "Which species have the highest occurrence counts?",
  "What environmental parameters are available?",
  "Summarize the eDNA records.",
];

export function AiAssistantView() {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    const history = messages
      .map((m) => ({ role: m.role, content: m.content }))
      .filter((m) => m.content)
      .slice(-8);

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/marine/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question, history }),
      });
      const data = (await res.json()) as AssistantResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer ?? "",
          grounding: data.grounding,
          llmWarning:
            data.llm.error ??
            (!data.llm.configured
              ? "AI provider is not configured. The database facts below are real; natural-language explanation requires the server-side Z_AI_API_KEY."
              : null),
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "",
          llmWarning: e instanceof Error ? e.message : "Assistant request failed.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <FlaskConical className="size-6 text-primary" /> AI Research Assistant
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask about the project&apos;s real data. Every answer is grounded in database facts
          collected server-side before the model composes its explanation.
        </p>
      </div>
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto pt-6">
          {messages.length === 0 && !busy && (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
              <Sparkles className="size-10 text-primary/60" />
              <p className="text-sm text-muted-foreground">
                Try: &ldquo;Which species are commonly observed?&rdquo;
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="outline" size="sm" onClick={() => void ask(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                  m.role === "user" ? "bg-primary/20 text-foreground" : "border border-border/60 bg-card"
                }`}
              >
                {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
                {m.llmWarning && (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-300">
                    <TriangleAlert className="mt-0.5 size-3 shrink-0" /> {m.llmWarning}
                  </p>
                )}
                {m.grounding && (
                  <details className="mt-2 rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5">
                    <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                      <Database className="size-3" /> Grounding facts used (auditable)
                    </summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                      {m.grounding.rendered}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Collecting database facts, then asking the model…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </CardContent>

        <div className="border-t border-border/60 p-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a research question…"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              disabled={busy}
            />
            <Button type="submit" disabled={busy || !input.trim()}>
              <Send className="size-4" />
            </Button>
          </form>
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Badge variant="outline" className="text-[9px]">grounded</Badge>
            Numeric claims come from the database; the model only explains them. The API key stays server-side.
          </p>
        </div>
      </Card>
    </div>
  );
}