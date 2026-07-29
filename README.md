# Coffee Finder

Find real coffee in Santiago. Free, always.

A PWA map of cafés, roasteries and coffee shops, filterable by **what you want**
(espresso, pour over, beans to take home), by **characteristics** (roasts on-site,
specialty, gluten free, wifi…) and by **place type**.

- **Stack** — Vite + React 19 + TypeScript + zustand.
- **Map** — Leaflet + OpenStreetMap tiles. No API key, no billing card.
- **Data** — Supabase when configured, static `places.json` as fallback.
- **Deploy** — GitHub Pages on push to `main`.

```bash
npm install
npm run dev          # http://localhost:5190
npm run build
npm run check-data   # validates places.json — CI runs this before every deploy
```

## The idea: two tiers of fact

This app grew out of a dietary map, and it kept that map's central insight while
learning where the insight *doesn't* apply.

**Claims** carry `scope` (all / some / none / unknown) and `confidence`
(verified / claimed / unverified), plus a source:

| | |
|---|---|
| `roastsOnSite` | Plenty of cafés say they roast when they buy wholesale. |
| `specialty` | "Café de especialidad" is marketing until someone checks. |
| `glutenFree` | Survived the pivot. A coeliac still eats the sandwich. |
| `seedOilFree` | Nobody publishes their cooking oil. Ever. |

**Flags** are plain booleans — `wifi`, `outlets`, `laptopFriendly`, `breakfast`,
`brunch`, `lunch`, `filterMethods`, `sellsBeans`, `grindsBeans`.

Building a provenance system for "has a power outlet" would be theatre. Not
building one for "sin gluten" would be dangerous. The two-tier split is that
judgement, made explicit in the type system.

**Absence of evidence never matches a filter.** `unknown` and `none` are excluded
from every claim filter, and an absent flag means "nobody has said", not "no".

## The honest state of the data

8 places. Specialty is claimed for all 8, `roastsOnSite` for 3 — and **nothing is
verified**. Gluten-free and seed-oil-free are `unknown` across the board, because
no café publishes either.

That's not an oversight, it's the product's reason to exist: the answers live in
the head of someone who walked in and asked. Until then, every badge says so.

## Where the data comes from

`node scripts/build-seed.mjs` rebuilds `public/data/places.json` from a curated
list, geocoding each entry. Two rules the scripts enforce, because both failures
are invisible in a JSON file:

- **No coordinate is ever typed by hand.** If geocoding fails, the place is
  dropped and reported, never guessed. Not hypothetical: "Sur Coffee Roasters"
  resolved to a motorway address 25km south in San Bernardo and looked entirely
  plausible as a pair of numbers.
- **No claim without a source.** Anything above `unverified` needs a URL or a
  note, or `check-data` fails the build — and CI gates the deploy on it.

Where a source supports something precisely, the model says so precisely: La
Pastora's shops carry `roastsOnSite: none` with the note *"tuestan en su
tostaduría de Barrio Italia, no en este local"* — truer than `all` and more useful
than `unknown`.

## Adding places (admin mode)

Open `?admin=1`, sign in with a magic link, and you get a form to add cafés and to
flip claims to `verified`.

The `?admin=1` flag is **not a secret** — it ships in the bundle. It only keeps
admin chrome out of a visitor's face. The real gate is Postgres: an impostor who
finds the flag and signs up has every write rejected by RLS, because their email
isn't in `editors`. Marking a claim verified stamps your email and the date into
the claim's own source, which readers then see.

### Supabase

The SQL is split into numbered steps because the order is load-bearing, not
cosmetic: a CHECK constraint is validated against every existing row the moment
it's added, so `02-cleanup.sql` must remove the previous app's grocery/market/
restaurant rows *before* `03-constraints.sql` introduces the coffee-only category
check. Concatenating them the other way round fails with a 23514.
Run `full-setup.sql` (generated) to get all of it in the right order.


This reuses the **same project as the old Vital Map** — the free tier allows only
two active projects and Vision holds the other slot. `supabase/*.sql`
migrates the table in place: `diet` → `claims`, adds `flags`, swaps the category
vocabulary, and keeps the editors allowlist and auth users intact.

Add a teammate:

```sql
insert into public.editors (email, name) values ('them@example.com', 'Name');
```
