/**
 * Builds public/data/places.json from researched Santiago specialty coffee
 * places, geocoding each one.
 *
 * Rules carried over from this app's dietary ancestor, because both failure
 * modes are invisible in a JSON file:
 *
 *  - No coordinate is ever typed by hand. If geocoding fails, the place is
 *    dropped and reported, never guessed. This is not hypothetical: "Sur Coffee
 *    Roasters" resolved to a motorway address 25km south in San Bernardo, and
 *    it looked perfectly plausible as a pair of numbers.
 *  - No claim without a source. A claim is 'claimed' only where a real source
 *    asserts it; everything else stays 'unknown'. Nothing here is 'verified' —
 *    that still requires standing at the bar and asking.
 *
 * Flags are left almost entirely empty on purpose. Whether a café has wifi or
 * outlets is trivially knowable *in person* and unknowable from a listicle, so
 * inventing them would trade the one thing this app has. The zeroes showing in
 * the filter menu are the feature.
 *
 * Run: node scripts/build-seed.mjs
 */
import { writeFile } from "node:fs/promises";

const TODAY = "2026-07-22";
const VIEWBOX = "-70.85,-33.65,-70.50,-33.30";
const UA = "CoffeeFinder/0.1 (https://github.com/davidegt7/coffee-finder)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const U = { scope: "unknown", confidence: "unverified" };
/** A sourced 'claimed' claim. */
const C = (scope, source, note) => ({
  scope,
  confidence: "claimed",
  source,
  ...(note ? { note } : {}),
  checkedAt: TODAY,
});

const CLINIC = "https://www.theclinic.cl/2026/07/22/la-pastora-coffee-alista-una-cuarta-apertura-en-providencia-la-cafeteria-inaugurara-este-mes-un-local-frente-a-parque-bustamante/";
const TERRA = "https://www.terra.cl/nacionales/2026/1/13/cuales-son-las-mejores-cafeterias-de-santiago-por-que-fueron-reconocidas-nivel-mundial-44289.html";
const TRICICLO = "https://www.cafetriciclo.cl/";
const CASCANUECES = "https://cafecascanueces.cl/";
const FMDOS = "https://www.fmdos.cl/noticias/cafeterias-en-santiago-donde-comer-precios-y-especialidades";

const DEFS = [
  {
    name: "La Huérfana",
    query: "Huerfanos 1515, Santiago",
    category: "cafe",
    // A source calling a place "café de especialidad" supports the specialty
    // claim and, by definition of the category, espresso. It does NOT support
    // wifi, gluten-free, or roasting — those stay unknown.
    items: ["Espresso"],
    claims: { specialty: C("all", TERRA, "Reconocida entre las mejores cafeterías de Chile, The Best Coffee Shops 2025.") },
    sources: [TERRA],
    caveat: "Está dentro del Palacio Pereira. Tienen un segundo local en Barrio Italia.",
  },
  {
    name: "La Huérfana Barrio Italia",
    query: "Santa Isabel 598, Providencia",
    category: "cafe",
    items: ["Espresso"],
    claims: { specialty: C("all", TERRA) },
    sources: [TERRA],
  },
  {
    name: "Café Triciclo",
    query: "Santo Domingo 598, Santiago",
    category: "cafe",
    items: ["Espresso"],
    claims: { specialty: C("all", TRICICLO) },
    sources: [TRICICLO],
    caveat: "Su tostaduría (3 Ciclos) es una operación aparte — no está confirmado que tuesten en este local.",
  },
  {
    name: "Café Triciclo Ñuñoa",
    query: "Girardi 1569, Nunoa",
    category: "cafe",
    items: ["Espresso"],
    claims: { specialty: C("all", TRICICLO) },
    sources: [TRICICLO],
  },
  {
    name: "La Pastora Coffee — Suecia",
    query: "Avenida Suecia 264, Providencia",
    category: "cafe",
    items: ["Espresso", "Grano"],
    claims: {
      specialty: C("all", CLINIC),
      // Precise rather than flattering: they roast, but at the Barrio Italia
      // site, not here. 'none' + a note says that exactly; 'all' would be a lie
      // and 'unknown' would throw away something the source actually tells us.
      roastsOnSite: C("none", CLINIC, "Tuestan en su tostaduría de Barrio Italia, no en este local."),
    },
    flags: ["sellsBeans"],
    sources: [CLINIC],
  },
  {
    name: "La Pastora Coffee — Antonio Varas",
    query: "Antonio Varas 87, Providencia",
    category: "cafe",
    items: ["Espresso", "Grano"],
    claims: {
      specialty: C("all", CLINIC),
      roastsOnSite: C("none", CLINIC, "Tuestan en su tostaduría de Barrio Italia, no en este local."),
    },
    flags: ["sellsBeans"],
    sources: [CLINIC],
  },
  {
    name: "Wonderland Café",
    query: "Rosal 361, Santiago",
    category: "cafe",
    // The source names these two drinks specifically.
    items: ["Espresso", "Flat white", "Latte"],
    claims: { specialty: C("all", FMDOS, "Cafetería temática en Barrio Lastarria con café de especialidad.") },
    sources: [FMDOS],
  },
  {
    name: "Café Cascanueces",
    query: "General Flores, Providencia",
    category: "roastery",
    items: ["Espresso", "Grano"],
    claims: {
      specialty: C("all", CASCANUECES),
      roastsOnSite: C("all", CASCANUECES, "Se presentan como café artesanal tostado por ellos."),
    },
    flags: ["sellsBeans"],
    sources: [CASCANUECES],
    caveat: "El geocodificador ubicó la calle pero no el número — confirma la dirección antes de ir.",
  },
];

const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const blankClaims = () => ({
  roastsOnSite: { ...U },
  specialty: { ...U },
  glutenFree: { ...U },
  seedOilFree: { ...U },
});

async function geocode(q, tries = 3) {
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q: q + ", Santiago, Chile",
      format: "json",
      limit: "1",
      viewbox: VIEWBOX,
      bounded: "1",
      addressdetails: "1",
    });
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const h = (await r.json())[0];
      if (!h) return null;
      const a = h.address || {};
      return {
        lat: +h.lat,
        lng: +h.lon,
        address: [a.road, a.house_number].filter(Boolean).join(" ") || undefined,
        comuna: a.city_district || a.suburb || a.town || a.city || undefined,
        osm: `https://www.openstreetmap.org/${h.osm_type}/${h.osm_id}`,
      };
    } catch (e) {
      if (i === tries) throw e;
      await sleep(3000);
    }
  }
}

const places = [];
const skipped = [];

for (const d of DEFS) {
  await sleep(1300); // Nominatim asks for max 1 req/sec. We're a guest here.
  let hit;
  try {
    hit = await geocode(d.query);
  } catch (e) {
    skipped.push(`${d.name} — geocode error: ${e.message}`);
    continue;
  }
  if (!hit) {
    skipped.push(`${d.name} — no match inside Santiago`);
    continue;
  }
  places.push({
    id: `cur_${slug(d.name)}`,
    name: d.name,
    category: d.category,
    lat: hit.lat,
    lng: hit.lng,
    address: hit.address,
    comuna: hit.comuna,
    city: "Santiago",
    items: d.items ?? [],
    claims: { ...blankClaims(), ...d.claims },
    flags: d.flags ?? [],
    ...(d.caveat ? { caveat: d.caveat } : {}),
    sources: [...d.sources, hit.osm],
    addedAt: TODAY,
  });
}

places.sort((a, b) => a.name.localeCompare(b.name, "es"));
await writeFile(
  new URL("../public/data/places.json", import.meta.url),
  JSON.stringify(places, null, 2) + "\n",
);

console.log(`Wrote ${places.length} of ${DEFS.length} places.`);
for (const p of places) {
  const claimed = Object.entries(p.claims)
    .filter(([, c]) => c.confidence !== "unverified")
    .map(([k]) => k);
  console.log(
    `  + ${p.name.padEnd(34)} ${(p.comuna ?? "?").padEnd(12)} claims: ${claimed.join(", ") || "(none)"}`,
  );
}
if (skipped.length) {
  console.log("\nSkipped:");
  for (const s of skipped) console.log("  -", s);
}
