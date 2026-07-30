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

Open <http://localhost:5190/?admin>, sign in as an editor, open a place, and
**“Extraer desde un link”** is the first section of the editor. If the bridge
isn't running, that section doesn't render at all — which is also its state on
the deployed site.

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

## `providers.mjs` is a copy, not a fork

It is byte-identical to `~/Desktop/premiere-ai-panel/bridge/providers.mjs` (and
the AE panel's). It is domain-agnostic on purpose. **Fix a provider bug in one
panel, then copy the file to the others** — don't special-case it here.

```bash
shasum bridge/providers.mjs ~/Desktop/premiere-ai-panel/bridge/providers.mjs
```

Ports: Premiere `3117`, After Effects `3118`, Coffee Finder `3119`.

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

`extract-prompt.md` is the whole tuning surface, the same role `system-prompt.md`
plays in the other panels. It's re-read on every request, so edit it and hit
“Leer” again — no restart.
