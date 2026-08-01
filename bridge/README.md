# The brain bridge

A local helper that reads a café's web page and proposes fields for the place
editor. It runs on **your** machine, talks to a CLI you're **already logged
into**, and never sends an API key anywhere — because there isn't one.

```
editor (localhost:5190)  →  bridge (127.0.0.1:3119)  →  brain (claude / codex / gemini CLI)
```

## Running it

```bash
npm run bridge
```

Then, in another terminal:

```bash
npm run dev
```

Open <http://localhost:5190/?admin=1>. There are two ways in, and they answer
different questions:

**🧠 Cerebro**, in the admin strip — a chat. Paste a link and talk: ask what it
makes of a café, tell it to check the Instagram too, correct an address it got
wrong. When the conversation has produced something, a draft card appears, and
**“Abrir en el editor”** opens the place editor with the form already filled for
you to review. Reach for this when adding a café from scratch.

It needs **no sign-in** — the bridge is on your own machine and the chat writes
nothing anywhere, so gating it behind Supabase auth only ever made it
unreachable while that auth was misconfigured. Saving still needs an editor
session, as it always did.

**“Extraer desde un link”**, the first section inside the place editor — the
one-shot version. One URL, one pass, accept fields one at a time. Requires
opening a place first, so it's for topping up a record you already have.

If the bridge isn't running, the chat says so and names the command; the
in-editor panel doesn't render at all. On the deployed site without the bridge,
that's every visitor's experience.

Either way the guardrails are the same, and they live in code rather than in the
prompt: no coordinates, nothing verified, no photos, no Google Maps. A draft
fills the form but cannot save itself — `canSave` still wants a geocoded
location and a source, so a café that came out of a chat still ends with a human
pressing Buscar and then Guardar.

## Picking a brain

The picker lists every brain, including the ones that aren't ready, each
labelled with what it's missing. Switching takes effect immediately, no
restart.

| brain | ready when |
|---|---|
| `claude` (default) | `claude` on PATH |
| `codex` | Codex CLI in ChatGPT.app / Codex.app, or on PATH |
| `gemini-cli` | `gemini` on PATH |
| `openai` / `grok` / `gemini-api` | that key exported **in the bridge's shell only** |
| `ollama` | serving on `:11434` |

The agentic CLIs (the first three) can follow the café's own menu and about
pages. The chat APIs read only the page the bridge fetched — they say so in the
panel.

Env overrides: `BRIDGE_PROVIDER`, `BRIDGE_MODEL`, `BRIDGE_PORT`,
`BRAIN_TIMEOUT_MS`, `BRIDGE_AUTONOMOUS`.

Brain jobs have no deadline by default because multi-café specialty research
can take several minutes. Set `BRAIN_TIMEOUT_MS` to a positive number only when
you intentionally want the bridge to cancel long jobs.

## Research ledger

Run `supabase/07-research-ledger.sql` once when setting up a new database. The
editor-only `research_ledger` table remembers investigated candidates rejected
as generic, non-specialty, insufficiently documented or closed. Active entries
are sent to every discovery request so the Brain skips them; each status gets a
recheck date because cafés and coffee suppliers can change. Visitors cannot
read this table or its editorial notes.

## `providers.mjs` is shared infrastructure

It is domain-agnostic on purpose and also powers the Premiere and AE panels.
Keep generic provider fixes in sync between the apps; coffee-specific behavior
belongs in `server.mjs` and the coffee prompts.

Ports: Premiere `3117`, After Effects `3118`, Coffee Finder `3119`.

## Adding a café you found on Google Maps

Paste the Maps link into **Cerebro** and it works. Nothing fetches Google — not
the page, not even a redirect. What happens instead:

1. The café's **name** is taken from the link text (`/maps/place/<name>/`), or
   from whatever you typed next to it. A short `maps.app.goo.gl` link carries no
   name, so type the café's name alongside it — one word, and you're already
   looking at it.
2. That name is looked up in **OpenStreetMap** (Nominatim, bounded to Santiago
   — the same source the editor's *Buscar* button has always used).
3. The brain drafts from the OSM match and cites the `openstreetmap.org` URL as
   the source.

The distinction that makes this fine: reading Google's pages is what their terms
forbid, and we don't. A café's name and street address are facts about a
business, published in an open database under ODbL — and the `osm` citation is
both honest provenance and the attribution that licence asks for.

Still off limits, whatever the editor pastes: review text, ratings, photos and
opening hours from Maps. Those are Google's content, not facts about a street.

## What it refuses to do

These are enforced in code, not just asked for in the prompt:

- **No coordinates.** Anything the model emits is dropped. The address is a
  suggestion for the geocoder box; Nominatim still has to find it, and is
  allowed to fail loudly.
- **No photos.** Not stock, and not scraped from the café's own site.
- **No Google Maps.** Refused by hostname — their terms prohibit extracting
  Maps content. Cost was never the issue.
- **Nothing arrives verified.** The client's `BrainSuggestion` type has no
  confidence field, so there is no path from "their website says so" to "we
  checked". Everything lands as `claimed`, sourced to the link.

## Two things to know before you trust it

**It reads untrusted pages with a tool-capable model.** By default the Claude
CLI runs with `--dangerously-skip-permissions` (inherited from the Premiere
panel), so a café's page is untrusted input reaching a brain that can run
commands on your machine. The system prompt tells it page content is data and
never instructions, and the bridge fences the page text explicitly — but that's
mitigation, not a sandbox. To trade the browsing feature for a smaller blast
radius:

```bash
BRIDGE_AUTONOMOUS=false npm run bridge
```

**The deployed site can reach it, and that's a real grant.** Both
`localhost:5190` and `https://davidegt7.github.io` are accepted origins, so the
panel works on the live site too — as long as this bridge is running on your
machine. But that origin is shared by *every* project you publish from that
GitHub account, so while the bridge is up, any page there can call it. It's
your own content, so the exposure is yours to accept; drop the entry from
`EXTRA_ORIGINS` in `server.mjs` if you'd rather keep it localhost-only.

The deployed path is a private-network request (public HTTPS → 127.0.0.1) and
depends on Chrome honouring `Access-Control-Allow-Private-Network`. That has
been re-specced before. If the panel quietly stops appearing on the live site
after a Chrome update, that's why — and `npm run dev` sidesteps it.

## Tuning

Two prompts, one per surface, and both are the whole tuning surface for it —
the same role `system-prompt.md` plays in the other panels:

| file | drives |
|---|---|
| `chat-prompt.md` | **Cerebro** — how it talks, and when it emits a draft |
| `extract-prompt.md` | “Extraer desde un link” — the one-shot JSON extractor |

Both are re-read on every request, so edit and send again — no restart. The
claim rules are duplicated across them deliberately: each is a complete
instruction to a model that has never read the other, and a cross-reference
would just be a rule the model can't follow.

The chat asks for its draft in a ` ```coffee-finder-draft ` fence, but the
parser takes the last fenced block that parses as JSON and carries a field it
recognises — so a brain that fences it as ` ```json `, or wraps it in
`{"draft": …}`, still works.
