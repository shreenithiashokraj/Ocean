# Task 5 — AI Fish Analysis (VLM)

- **Agent**: Z.ai Code (Task 5)
- **Task**: Build the AI Fish Analysis module — backend VLM route (POST/GET),
  DELETE-by-id route, and the client-side `FishAnalysisView` (uploader +
  result card + history list with delete confirm).

## Files created

1. `src/app/api/fish-analysis/route.ts` — POST + GET (runtime nodejs)
2. `src/app/api/fish-analysis/[id]/route.ts` — DELETE (runtime nodejs)
3. `src/components/fish-analysis/fish-analysis-view.tsx` — client view
   (default + named `FishAnalysisView` export)

## Wiring change

`src/components/modules/index.tsx` — replaced the `FishAnalysisView` stub
function with `export { default as FishAnalysisView } from
"@/components/fish-analysis/fish-analysis-view"` so the module router uses the
real implementation. (Surgical one-line addition next to the existing
`LocationNavigationView` re-export — did not touch other stubs.)

## VLM SDK call shape (verified via the VLM skill)

```ts
const ZAIModule = await import("z-ai-web-dev-sdk");
const ZAI = (ZAIModule as { default?: unknown }).default ?? ZAIModule;
const zai = await (ZAI as { create: () => Promise<VLMClient> }).create();

const completion = await zai.chat.completions.createVision({
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ],
  thinking: { type: "disabled" },
});
const rawContent = completion.choices?.[0]?.message?.content;
```

Key learnings from the skill:
- The vision method is `chat.completions.createVision(...)` — NOT `chat.completions.create(...)`.
- The SDK is dynamic-imported inside the route handler so it can never end
  up in a client bundle.
- `content` may be a string OR an array of content blocks —
  `contentToString()` handles both, plus an object-with-`.text` shape.
- A strict-JSON prompt + loose JSON parser (`parseJsonLoose`) — strips
  ```json fences, extracts the first `{...}` block. If parsing fails, the
  fallback stores the raw text in `notes` and sets `species: null` so the UI
  surfaces a "couldn't identify" state instead of crashing.

## Behavior notes

- **Validation (client + server)**: JPEG/PNG/WebP only, ≤8 MB. Server returns
  422 with a clear message for bad input. Client mirrors the same rules so
  the user gets instant feedback.
- **Market price**: env vars `FISH_MARKET_API_URL` / `FISH_MARKET_API_KEY`
  are read but never used to invent prices. When both are empty (default),
  `analysis.market` is `null` and the UI shows the `Unavailable` component
  with a hint about the env vars.
- **Ownership enforcement**: DELETE looks up the row, returns 404 if missing,
  403 if `row.userId !== session.sub`, otherwise deletes + returns `{ok:true}`.
- **Logging**: every API call (auth failure, validation failure, VLM success
  / failure, DB failure, deletion) is logged via `logApiCall({ service:
  "fish-analysis", ... })` from `@/lib/weather`.
- **Failed VLM attempts are still persisted** as a row with null species +
  the error in `notes`, so the fisherman sees a record of the attempt.

## UI features

- Drag-drop area + file input (accept jpeg/png/webp), simulated upload
  progress bar while reading, image preview, "remove" button.
- "Analyze Fish" button (purple gradient to match the AI accent) calls
  `api.analyzeFish(dataUrl)`.
- Loading state: skeleton grid + `LoadingState` "Analyzing image with AI…".
- Result card: thumbnail, species (bold), confidence % + Progress bar,
  alternative-species chips with %, size/weight metric boxes, characteristics
  bullet list, identification notes, amber quality-warning notice, market
  price section (with `Unavailable` when no price configured), prediction
  disclaimer banner above the uploader.
- History list (newest first): thumbnail + species + confidence + date;
  click to expand into full detail panel; AlertDialog-gated delete with
  refresh after.
- Responsive (`sm:`, `md:` breakpoints), accessible (semantic buttons,
  `aria-expanded`/`aria-controls`, `aria-live`, alt text), uses
  `LoadingState` / `ErrorState` / `EmptyState` / `Unavailable` from
  `@/components/common/states`.

## Verification

- `bun run lint`: 0 errors / 0 warnings in my files. (The 2 remaining
  warnings live in `src/app/page.tsx`, owned by another agent.)
- `GET /api/fish-analysis` → 401 (compiled + auth guard fired + ApiLog
  INSERT visible in `dev.log`).
- `DELETE /api/fish-analysis/test` → 401 (compiled + auth guard fired +
  ApiLog INSERT visible).
- `POST /api/fish-analysis` → 401 (compiled + auth guard fired + ApiLog
  INSERT visible).
- `GET /` → 200 (the new re-export in modules/index.tsx compiles cleanly
  when the SPA shell renders).

## Issues / notes for downstream agents

- The `api.listFishAnalyses()` return type in `src/lib/api.ts` is
  `{ analyses: unknown[] }`. The view casts to `FishHistoryItem[]` locally.
  If a future agent wants stronger typing, update `api.ts` to
  `{ analyses: FishHistoryItem[] }` — but that requires exporting the type
  from `@/lib/types`, which is out of scope for this task.
- `FISH_MARKET_API_URL` / `FISH_MARKET_API_KEY` are intentionally read but
  not yet wired to a real price provider — when one is added, populate
  `analysis.market` in the POST handler before persisting.
