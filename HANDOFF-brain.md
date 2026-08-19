# Hand-off — Coffee Finder "brain" (link → prefilled place)

Written 2026-07-30. Paste this into a fresh chat to pick the work up.

---

## 1. What the app is

**Coffee Finder** — a free, ad-free PWA map of specialty coffee in Santiago, Chile.
Live: <https://davidegt7.github.io/coffee-finder/> · repo `~/coffee-finder` (clean, last commit `632cf2d`).

It was pivoted from an earlier app, **Vital Map** (<https://davidegt7.github.io/vital-map/>), which is still online and must not be touched.

Stack: Vite + React 19 + TS + zustand · Leaflet + OpenStreetMap tiles (no API key, no billing) · Supabase (Postgres + RLS + magic-link + Google OAuth + Storage), project ref `reztnkydikmbvuxhoitl` · GitHub Pages deploy via Actions, gated on `scripts/check-data.mjs`.

### The one idea the whole app is built on

Every dietary/production fact is a **Claim** with two independent axes plus a source:

- `scope`: `all` | `some` | `none` | `unknown`
- `confidence`: `verified` | `claimed` | `unverified`

"The shop says it's gluten free" and "we checked" are different facts and the UI shows them differently. Simple booleans (wifi, outlets, sells beans) are **Flags** instead — a separate, cheaper tier. See `src/types.ts`.

**A claim above `unverified` without a source is rejected in two places**: `scripts/check-data.mjs` (CI gate) and a Postgres CHECK. This is the app's spine — the brain must not be allowed to bypass it.

---

## 2. What was just asked for

> *"can we build a brain in the admin section where we feed it a link and it extracts all the information about a coffee shop or place in it?"*

Then, immediately after (this is the current direction and it **replaces** the earlier API-key plan):

> *"wait, dont do api, do auth, as we do on the ae ai panel and other ai panels. add the option to change the brain to codex and such"*

So: **no Anthropic API key.** Use the locally-authenticated CLI, exactly like David's other panels. Plus a brain picker so he can switch to Codex, Gemini CLI, etc.

There is a memory note on this: `~/.claude/projects/-Users-david/memory/ae-ai-panel.md` — *"NO API KEY — David does not use one, he uses auth."*

**No code has been written for the brain yet.**

---

## 3. The pattern to copy (this is the important part)

David already has this working twice. Read these before designing anything:

- `~/Desktop/premiere-ai-panel/bridge/providers.mjs` ← **the file to port**
- `~/Desktop/premiere-ai-panel/bridge/server.mjs` (see `GET /health` ~line 2157, `POST /provider` ~line 2250)
- Memory: `~/.claude/projects/-Users-david/memory/ae-ai-panel.md` and `premiere-ai-panel.md`

Shape:

```
UI  →  local bridge on 127.0.0.1  →  brain (CLI subprocess, already logged in)
```

`providers.mjs` is deliberately **domain-agnostic**: it takes `{ systemPrompt, userContent, history, sessionId, timeoutMs }` and returns `{ text, sessionId }`. It knows nothing about Premiere or After Effects. The AE panel copied it **verbatim**. Coffee Finder should do the same — copy, don't fork, and keep the copies in sync.

### Brains it already supports

| name | kind | ready when |
|---|---|---|
| `claude` | agentic CLI, native `--resume` | `claude` on PATH |
| `codex` | agentic CLI | Codex CLI in ChatGPT.app/Codex.app or on PATH |
| `gemini-cli` | agentic CLI | `gemini` on PATH |
| `openai` / `grok` / `gemini-api` | plain chat API | key in **bridge env only** |
| `ollama` | local chat API | serving on `:11434` |

Two exported functions do all the work:

- `makeProvider(env, overrides)` — `overrides.provider` / `overrides.model` come from the picker and beat env, so the brain swaps **at runtime with no restart**.
- `listBrains(env)` — catalog with `ready` + `needs` per brain. Not-ready brains still render, greyed out, showing exactly what's missing. That's what makes the fix discoverable.

Claude's invocation, for reference:

```js
claude -p --output-format json --model <model> --append-system-prompt <systemPrompt> [--resume <sessionId>]
// userContent goes in on stdin; reply is parsed.result, session is parsed.session_id
```

Ports so far: Premiere `3117`, AE `3118`. **Use `3119` for Coffee Finder.**

---

## 4. Proposed design (not yet agreed with David — confirm first)

**`bridge/` at the repo root, run locally by David; the deployed site never needs it.**

The extractor is editor-only, so it only ever runs on a team member's own machine. Public visitors never touch the bridge.

1. `bridge/providers.mjs` — copied verbatim from the Premiere panel.
2. `bridge/server.mjs` — small; only four routes needed:
   - `GET /health` → `{ ok, provider, name, agentic, brains: [...] }`
   - `POST /provider` → `{ provider, model? }`, swaps the brain
   - `POST /extract` → `{ url }` → fetches the page **server-side** (dodges CORS), strips to text, runs the brain, returns a suggestion object
3. `bridge/extract-prompt.md` — the tuning surface, same role as `system-prompt.md` in the other panels. Holds the `Place` shape, the claim rules, and the refusal rules.
4. `src/lib/brain.ts` — client for the above; degrades silently when the bridge isn't running (the button just doesn't appear).
5. `src/components/BrainPanel.tsx` — "Extraer desde un link" inside `PlaceEditor.tsx`, editor-only, plus the brain picker driven by `/health`'s `brains` array.

### Guardrails — these are not optional

These were agreed explicitly and they are the reason the app is trustworthy:

- **Suggestions only.** Output is a diff/preview the editor accepts **field by field**. Nothing is auto-saved.
- **Everything lands as `confidence: "claimed"` with `source: <the url>`.** Never `verified`. A parser inferring "sin gluten" from marketing copy is exactly the fabrication the claims model exists to prevent.
- **Coordinates never come from the model.** The extracted address goes through the existing Nominatim geocode button in `PlaceEditor`. No hand-typed coordinates, ever — geocoding must fail loudly instead. (This rule has already saved us once: "Sur Coffee Roasters" geocoded to a motorway 25 km south in San Bernardo and was correctly rejected.)
- **No Google Maps.** Their ToS prohibits exporting/extracting Maps content and caps caching (Place IDs indefinitely, coordinates 30 days). Cost was never the blocker — 10k free Place Details/month vs. ~600 places ever — the terms are. Legitimate sources: the café's own site (`schema.org/LocalBusiness` JSON-LD, Open Graph) and OpenStreetMap.
- **No stock photos on real businesses.** A generic image on a named café is a lie about a specific business. Also no pulling images off café sites — their copyright, their bandwidth.
- **No secrets in the client.** API keys (only relevant for the non-agentic brains) live in bridge env. The panel never sends a key. The `sb_publishable_…` Supabase key **is** safe in client code — RLS protects the data; it lives in GitHub repo *variables*.

### Known risk to raise with David up front

The deployed site is HTTPS (`github.io`); the bridge is `http://127.0.0.1:3119`. `localhost` is a "potentially trustworthy origin" so this isn't ordinary mixed-content blocking — but Chrome's **Private Network Access** sends a CORS preflight carrying `Access-Control-Request-Private-Network: true` and requires `Access-Control-Allow-Private-Network: true` back. The bridge must answer that header, and it should be **tested early**, not at the end. Fallback if it misbehaves: run the admin UI from `npm run dev` on localhost, which sidesteps the whole issue. Worth deciding before building the UI.

---

## 5. Blocked on David (carried over, still not done)

These are user-side and gate already-shipped features:

1. Run `supabase/04-favorites.sql` — until then the hearts toggle and revert.
2. Run `supabase/05-photos.sql` + `06-storage.sql` — until then the camera button has nowhere to upload.
3. In Supabase Auth settings, change **Site URL** from `localhost:3000` to `https://davidegt7.github.io/coffee-finder/` and add `https://davidegt7.github.io/coffee-finder/**` to Redirect URLs. Magic links currently land on `localhost:3000`. This has bitten us in both apps.

---

## 6. Repo map

```
src/types.ts              CLAIM_KEYS, FLAG_KEYS, CATEGORIES, Place, ATTR_GROUPS
src/lib/items.ts          two-level intent taxonomy (drink / beans / gear).
                          placeHasItem is ONE-DIRECTIONAL on purpose — place text must
                          CONTAIN the item, never the reverse, or "pan" matches "masa madre".
src/lib/filters.ts        Filters (location first), faceted counts.
                          Rule: unknown/none never match a claim filter.
src/lib/places.ts         data seam. isCoffeeRow() shape-checks Supabase rows and falls
                          back to seed JSON — added after a white screen when the DB still
                          had the old Vital Map schema and returned rows successfully.
src/lib/auth.ts           OAUTH_PROVIDERS = ["google"] (apple omitted: $99/yr).
                          checkIsEditor() asks the DB, never the client.
src/lib/photos.ts         canvas downscale to 1600px/JPEG .82 — also strips EXIF/GPS.
src/components/PlaceEditor.tsx   ← the brain panel goes here
src/components/ListSheet.tsx     draggable sheet, 3 snaps, measures .topbar via ResizeObserver
supabase/01..06*.sql      run in numeric order; 01 drops ALL old constraints up front
scripts/                  geocode · build-seed · check-data (CI gate) · seed-sql · make-icons
```

Current DB: 10 places, 4 reviews, submissions empty, favorites + photos tables **not yet created**.

---

## 7. Working style that has been landing well

- Verify by driving the UI, not by assuming. Several bugs (dead "Solo comprobado" filter, unclickable topbar under the sheet, an icon leaf that rendered as an egg) were only caught by actually looking.
- When a pass is too timid, say so plainly rather than defending it. That happened once — *"i'm not sure what you changed buddy"* — and conceding it and naming the real gaps was the right move.
- Spanish is the primary language; `Record<keyof typeof ES, string>` makes the compiler reject half-translated strings.
- Files are sent with SendUserFile, not pbcopy — copy/paste instructions confused things once.
- Never paste or commit the Supabase `service_role` key. Seeding deliberately emits SQL for David to paste so the service key never leaves the dashboard.

---

## 8. Suggested first message in the new chat

> Read `~/coffee-finder/HANDOFF-brain.md`, then `~/Desktop/premiere-ai-panel/bridge/providers.mjs`. Build the Coffee Finder brain on the auth/CLI bridge pattern — no API key. Start by confirming the design in §4, especially the Private Network Access question.
