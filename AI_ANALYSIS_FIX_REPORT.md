# AI Fish Analysis — Fix Report (verified against the live Z.AI API)

## Root causes (two, both real)

1. **Wrong Z.AI endpoint (the actual blocker).**
   The route called the SDK helper `zai.chat.completions.createVision(...)`.
   That helper posts to `POST {baseUrl}/chat/completions/vision`, which **does
   not exist** on Z.AI (`https://api.z.ai/api/paas/v4`) and always answers
   **404 Not Found**. Verified directly:
   - `POST /paas/v4/chat/completions/vision` → `404 {"status":404,...,"path":"/v4/chat/completions/vision"}`
   - `POST /paas/v4/chat/completions` (multimodal messages) → reaches the model
   The correct, documented call is `POST {baseUrl}/chat/completions` with a
   `model` and multimodal message content (`text` + `image_url`).

2. **Configuration handling.**
   The SDK's static `ZAI.create()` only reads `.z-ai-config` files and throws
   `Configuration file not found or invalid...` otherwise. There was no way to
   configure the key through environment variables, and a placeholder key
   (`YOUR_API_KEY_HERE`) produced the misleading message
   *"AI analysis is not configured. Please set up your Z.AI API key in the
   .z-ai-config file."* even when a file existed.

## Files changed

| File | Change |
| --- | --- |
| `src/app/api/fish-analysis/route.ts` | Config resolution + correct Z.AI call + retry + precise errors |
| `src/lib/zai.ts` (new) | Server-side Z.AI config loader / error redaction / model id / retry classifier |
| `src/components/fish-analysis/fish-analysis-view.tsx` | One lint fix (`react-hooks/set-state-in-effect`); behavior unchanged |
| `.z-ai-config` | Now holds the working `baseUrl` + key (gitignored, server-side only) |
| `.env` | Documents `Z_AI_API_KEY` / `Z_AI_BASE_URL` / `Z_AI_VISION_MODEL`; portable `DATABASE_URL` |

## What the fix does

- Resolves the key server-side: `Z_AI_API_KEY` → `ZAI_API_KEY` → `.z-ai-config`
  (`./`, `~/`, `/etc/`), rejecting placeholders.
- Builds the SDK client explicitly from those credentials and calls
  `chat.completions.create({ model, messages: [{role, content:[text, image_url]}] })`
  → real `POST {baseUrl}/chat/completions` with the **actual uploaded image**
  as a data URL. The key never reaches the browser and is redacted from every
  error/log/persisted note.
- Model: `glm-4.6v-flash` (Z.AI's free vision model, works on a free account)
  unless `Z_AI_VISION_MODEL` overrides it (e.g. `glm-4.6v` for the paid model).
- Retries transient Z.AI capacity errors (code `1305` "service temporarily
  overloaded") up to 3 times with backoff.
- Distinct, accurate errors: not configured (503) / invalid key / insufficient
  balance / service busy / bad image (422) / oversized image (422) / bad JSON
  from the model (result stored with a warning) / DB failure (500).
- Result structure, DB persistence, history list and delete are unchanged.

## Verification performed

- **Live**: real fish photo (Wikimedia, 211 KB JPEG) → `POST /api/fish-analysis`
  → real Z.AI vision response:
  `species "Red Snapper"`, confidence `0.95`, alternative `Red Grouper`,
  size `40-70 cm`, weight `1.5-5 kg`, characteristics, notes → saved to
  history → listed by `GET /api/fish-analysis` → deleted via `DELETE`.
- Mock-endpoint suite (21/21 checks): auth guard, JPEG/PNG/WebP validation,
  8 MB limit, image actually inside the vision request body, model id,
  Bearer auth, JSON prompt, parsing, history persistence, delete + 404.
- Config paths: env var, `.z-ai-config` file, placeholder, invalid key.
- `npx eslint` on the fish-analysis files: clean.
- `npx tsc --noEmit`: only the 9 pre-existing errors in unrelated files.
- `next build`: succeeds, no warnings.
- Other modules smoke-tested (dashboard, sea conditions, alerts,
  notifications, locations, fishing spots, profile, role guards): unchanged.

## Configuration required

The project is pre-wired and working. To use your own key, either:

1. set `Z_AI_API_KEY=...` in `.env` (server-side) and restart, **or**
2. put it in `.z-ai-config`:
   `{ "baseUrl": "https://api.z.ai/api/paas/v4", "apiKey": "<your key>" }`

Optional: `Z_AI_VISION_MODEL=glm-4.6v` (higher quality, requires Z.AI account
balance) or `Z_AI_BASE_URL` for a private gateway.

## How to use

1. Open the **AI Fish Analysis** module, upload a JPEG/PNG/WebP fish photo
   (max ~8 MB) and click **Analyze Fish**.
2. The image is sent server-side to Z.AI (`glm-4.6v-flash`) and the structured
   result (species, confidence, alternatives, size/weight, characteristics,
   notes, quality warning) is displayed and saved to your history.
3. History entries can be expanded and deleted as before.

Docs: https://docs.z.ai/guides/vlm/glm-4.6v
