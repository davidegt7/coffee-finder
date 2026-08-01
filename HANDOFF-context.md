# Coffee Finder — what you can't learn from the repo

Written 2026-08-01 for whichever assistant picks this up next.

Everything here is **state and reasoning that lives outside git**: the machine,
the Supabase dashboard, the live database, decisions David made out loud, and
approaches that were tried and failed. Read the code for how it works; read this
for why it is the way it is, and what will bite you.

---

## 0. Read this first: the repo does not have the work

```
origin/main   978de5a  "Let the deployed editor reach the local bridge"
working tree  ~2,600 lines changed across ~30 files, NONE of it committed
```

**The GitHub repo, and therefore the deployed site, are far behind the working
tree.** If you clone the repo you will not find the Cerebro chat, the Google
Maps support, the photo picker, the MapLibre map, or the research ledger. They
exist only in `~/coffee-finder` on David's Mac.

**A second agent is editing this same working tree, live.** During one turn the
map went from Leaflet to MapLibre, `BRAIN_TIMEOUT_MS` changed meaning, and three
new files appeared, all without my involvement. Before you touch anything:

```bash
git -C ~/coffee-finder status --short
git -C ~/coffee-finder diff --stat
```

Do not assume the tree is as this document describes. Check.

**Do not push casually.** David asked for the work to be split into commits and
pushed; that was not done, because a single `git push` from this tree would ship
both workstreams together to production. `.github/workflows` deploys on any push
to `main`, so push = deploy, immediately, with no review step. Agree the scope
with David before pushing anything.

---

## 1. The machine

David is on macOS, working directory `~/coffee-finder`.

| what | where | notes |
|---|---|---|
| Brain bridge | `127.0.0.1:3119` | started with `npm run bridge`; must be running or the brain UI hides itself |
| Premiere AI Panel bridge | `127.0.0.1:3117` | different project, keep off this port |
| AE AI Panel bridge | `127.0.0.1:3118` | ditto |
| Dev server | `localhost:5190` | pinned in `vite.config.ts`, **not** Vite's default 5173 |

Agentic CLIs, all logged in, all found by the brain picker:

```
/Users/david/.local/bin/claude
/Users/david/.local/bin/codex
/Users/david/.nvm/versions/node/v22.22.3/bin/gemini
```

**There is no Anthropic API key and David does not want one.** He said it
directly: *"dont do api, do auth, as we do on the ae ai panel and other ai
panels."* The bridge shells out to a CLI he is already signed into. If you find
yourself reaching for `ANTHROPIC_API_KEY`, you have misunderstood the design.

### `.env` — gitignored, so absent from the repo

```
VITE_SUPABASE_URL=https://reztnkydikmbvuxhoitl.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_…
```

I created this during the session. The values were **extracted from the
deployed production bundle** (they are baked into the shipped JS), not invented.
Without it, local dev shows *"Admin sin configurar"* and cannot reach the
database at all — which confused David for a while, because the deployed site
works fine.

The publishable key is safe in client code; RLS is the real gate. **The
`service_role` key must never be pasted, committed, or shared** — seeding
deliberately generates SQL for David to paste into the dashboard so that key
never leaves Supabase.

---

## 2. Supabase dashboard state (invisible to git)

Project ref `reztnkydikmbvuxhoitl`, shared with David's other app "Vision" — the
free tier caps at 2 projects, so **do not create a third**.

### Still broken, still blocking

**Auth → URL Configuration → Site URL is still `localhost:3000`.** Magic links
therefore never return to the app. This has been outstanding across multiple
sessions and blocks every sign-in, which blocks Save.

Needs to become:

- Site URL → `https://davidegt7.github.io/coffee-finder/`
- Redirect URLs → add `https://davidegt7.github.io/coffee-finder/**` **and**
  `http://localhost:5190/**` (the second is what makes local development
  possible at all)

Only David can do this. It is a dashboard click, not code.

### Which SQL has actually been run

Checked live against the REST API:

| table | exists | meaning |
|---|---|---|
| `places`, `reviews`, `submissions`, `editors` | ✅ | 01–03 + reviews/submissions ran |
| `research_ledger` | ✅ | `07-research-ledger.sql` ran (the other agent's work) |
| `favorites` | ❌ **404** | `04-favorites.sql` was never run — hearts still toggle and revert |

`05-photos.sql` / `06-storage.sql`: the `photo_url` column exists (places carry
photos), so 05 ran. Whether the `place-photos` **storage bucket** exists was not
verified — if the camera upload button errors, that is why.

---

## 3. Live database contents

**27 places**, and the geography has outgrown the name of the seed data:

- Santiago comunas: Providencia, Vitacura, Ñuñoa, Maipú, Santiago Centro
- **Villarrica** (4 places) — ~750 km south

The `places_in_santiago` constraint was replaced by `places_in_chile_extent` in
`08-chile-geography.sql`. Anything you write that assumes Santiago is now wrong.

**I found and fixed one instance of exactly that**: the bridge's OSM name lookup
was still hard-bounded to a Santiago viewbox while `src/lib/geocode.ts` had been
widened to `countrycodes: cl`. A Maps link for a Villarrica café would have
found nothing, or a plausible Santiago street with the same name. **Assume there
are more.** Grep for `Santiago` before trusting any lookup.

### A data shape that broke rendering

`places.instagram` holds **three different shapes**, written by three different
hands: `@handle` (owner submission form), a bare handle (editor), and a **full
URL** (the brain, which reads what the café's site links to). `Café Altura` and
`Original Green Roasters` both hold full URLs.

`PlaceSheet` used to build `https://instagram.com/${value}`, producing
`https://www.instagram.com/https://www.instagram.com/cafealturachile/`.
Fixed at render time in `src/lib/links.ts` rather than by migrating the column —
a migration would still not constrain the next writer.

---

## 4. What David has said, in his own words

These are direct instructions, not inferences. They have all been given more
than once, or after a correction.

**On the brain's identity:** *"add the option to change the brain to codex and
such."* The picker must list every brain including the not-ready ones, showing
what each is missing — a hidden option teaches nobody how to enable it.

**On Google Maps:** *"can you make it so the ai can extract information from
google maps?"* and later, after a refusal, *"cant it just extract the
information from the google maps link? without finding it in the map? it doesnt
need to... you just need to add it in the map with the address, thats all."*

He was right and the earlier refusal was wrong in effect. The resolution: never
fetch a google host, but a Maps URL the user pasted is a **string we were
handed**, and `!3d<lat>!4d<lng>` in it is the pin. Parse it, reverse-geocode it
through OSM for a street, done. Reading Google's pages is what their terms
forbid; parsing a URL David chose to paste is not that.

**On lecturing:** he pasted the brain's own ToS speech back at me as the
problem. `bridge/chat-prompt.md` now has an explicit *"what not to do"* list —
no ToS paragraphs, no *"I have instructions"*, no asking him to go read the
address off Maps himself. If a future prompt change makes the brain moralise
again, that is a regression.

**On being told the fix is elsewhere:** when the chat handled Maps links but the
in-editor panel still refused, he hit the refusal repeatedly. *Same link, same
app, two different answers depending on which box you were in.* Keep the two
surfaces at parity — `/chat` and `/extract` should never disagree about what is
possible.

**On visible progress:** *"i'm not sure what you changed buddy, beside the day
and night toggle, nothing very visible."* A pass that is technically correct but
produces no visible difference reads as no work at all. Say plainly when a
change is invisible.

**On screenshots:** he sends them and expects them read. *"did you read what my
screenshot say"* followed a reply that talked past what was plainly on screen.

---

## 5. Decisions worth not relitigating

**Coordinates never come from a model.** `BrainSuggestion` has no lat/lng field
— not validated away, *absent*, so there is nowhere to put one. The pin from a
pasted URL travels in a **separate** `location` field computed by the bridge, so
the type system preserves the distinction between "a model proposed this" and "a
regex read this out of user input". Keep that separation if you extend it.

**Nothing arrives `verified`.** The suggestion type has no confidence field.
Everything the brain proposes lands as `claimed`, sourced to the link. Only a
person in the café can promote it, in the editor, under their own name. This is
the app's whole premise — people trust this map with a coeliac diagnosis.

**Photos are referenced, not copied.** Candidates come from the café's own site
(`og:image` first — the image a business publishes *expressly* for third parties
to display). The chosen URL is hotlinked, never copied into the storage bucket,
so the café keeps control and a takedown propagates. Google Maps photos are
excluded: those belong to the individual people who shot them.

**The `?admin=1` flag is not a secret** and never was. It reveals chrome; RLS
decides what lands. This is why the Cerebro button is visible to anyone with the
flag — the bridge it talks to only exists on the editor's own machine.

---

## 6. Approaches that failed — don't repeat them

**Searching OSM by name to locate a Maps link.** Google titles branches like
`Cafe Altura Manuel Montt`; OSM stores `Cafe Altura`. The full string matched
nothing, and broadening the search returned branches in Recoleta and Las Condes
— neither anywhere near Manuel Montt. It was solving a problem that didn't
exist: **the coordinates were in the URL all along.** Name search survives only
as a fallback for short `maps.app.goo.gl` links, which carry no pin.

**Restricting scraped images to the café's own host, and filtering anything with
"logo" in the path.** Both sound sensible; together they returned *zero*
candidates on Original Green Roasters. Small businesses run hosted storefronts
(Jumpseller, Shopify, Squarespace, Wix) where every photo lives on the
platform's CDN, and the `og:image` **is** the logo. The real safeguard is that a
human looks at the thumbnails.

**One error code covering several failures.** `google_maps` meant three
different things, so the panel showed one generic sentence for all of them —
including, after Maps links started working, advice to go use the other panel.
Codes are now narrow (`maps_no_name`, `maps_no_match`) and carry the `hint` that
failed. Related: **the bridge only logged successes**, so a failed attempt left
no trace and could not be diagnosed. It logs failures now. Keep it that way.

**Putting a feature behind the wrong gate.** The Cerebro button was originally
inside the signed-in-editor branch of `AdminBar`, behind four early returns that
all depend on Supabase auth — which is broken (§2). The feature was unreachable
in every state, including the "Supabase isn't configured" state that local
development is permanently in. It gates a *local* tool; it does not need a
*remote* login.

---

## 7. A crash worth knowing about

The app rendered a **blank white page in local dev** — no error banner, nothing.
Cause: `flyToBounds` threw `Invalid LatLng (NaN, NaN)` out of a `useEffect`,
which unmounts the whole React tree. It happened because React 19 StrictMode
mounts effects twice while a `useRef` guard survives the remount, sending the
second pass down the animated branch against a container with no measured size.

This is now moot — the other agent replaced Leaflet with MapLibre GL. It is
recorded because the **failure mode** will recur: an exception thrown from an
effect blanks the page silently, and `read_console_messages` showed only a
React warning, not the error. To catch the next one, install an `error` listener
in the page and force a re-render via HMR rather than a reload, which would
clear the handler.

---

## 8. Sibling projects — don't break them

**Vital Map** — `https://davidegt7.github.io/vital-map/`, the app Coffee Finder
was forked from. Still live, still untouched. Both are served from the same
`davidegt7.github.io` origin, which is why the bridge's CORS grant to that
origin is broader than it looks (any page on that account can reach the bridge
while it runs). A service worker cache-name collision between the two apps has
already caused one bug — Coffee Finder's caches are namespaced `coffeefinder-*`.

**Premiere AI Panel** (`~/Desktop/premiere-ai-panel`) and **AE AI Panel** —
`bridge/providers.mjs` originated there and is meant to stay domain-agnostic
across all three. Fix a provider bug in one, copy it to the others. Coffee
specifics belong in `server.mjs` and the prompt files, never in `providers.mjs`.
(Note: `providers.mjs` here now shows local modifications, so the three copies
may already have drifted — check before assuming.)

---

## 9. How to work on this

- **Drive the browser; don't reason about the UI.** Several bugs — the dead
  filter, the unclickable topbar, the blank page, the empty photo list — were
  only ever caught by looking. `.claude/launch.json` is set up: `preview_start`
  with name `coffee-finder`.
- **Spanish is the source of truth.** `EN` is typed `Record<keyof typeof ES,
  string>`, so a half-translated string fails the build rather than shipping.
- **`npm run build` runs `tsc -b` first** — it is the real check, and it is fast.
- **The bridge re-reads its prompts per request.** Edit `chat-prompt.md` or
  `extract-prompt.md` and send again; no restart. Restarting the bridge *does*
  drop the dev server's HMR connection, which will leave David looking at a
  stale page — tell him to reload.
- Send files with `SendUserFile`. An earlier attempt to have him copy from the
  terminal produced *"cmd v what?"*.

---

## 10. If you do nothing else

1. Tell David the work is **uncommitted and unpushed**, and that a second agent
   is in the same tree.
2. Get the **Supabase Site URL** fixed. It has blocked sign-in for days, and
   sign-in blocks Save, which blocks the entire point of the brain.
3. Run **`04-favorites.sql`**. Hearts are silently broken until it exists.
4. Grep for **`Santiago`** and check each hit against the fact that the map now
   includes Villarrica.
