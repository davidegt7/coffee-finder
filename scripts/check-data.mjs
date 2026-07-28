/**
 * Validates public/data/places.json before it can ship.
 *
 * The failure this guards against: a place with a confident claim and no source
 * behind it. That record looks identical to a real one in the UI. Most of the
 * claims here are about coffee and the stakes are taste and money — but
 * `glutenFree` survived the pivot from the dietary app, and someone still acts
 * on it medically. So an unsourced claim above `unverified` is a hard error.
 *
 * Run: node scripts/check-data.mjs
 */
import { readFile } from "node:fs/promises";

const CLAIM_KEYS = ["roastsOnSite", "specialty", "glutenFree", "seedOilFree"];
const FLAG_KEYS = [
  "filterMethods",
  "sellsBeans",
  "grindsBeans",
  "breakfast",
  "brunch",
  "lunch",
  "wifi",
  "outlets",
  "laptopFriendly",
];
const CATEGORIES = ["cafe", "roastery", "bakery", "shop", "cart"];
const SCOPES = ["all", "some", "none", "unknown"];
const CONFIDENCES = ["verified", "claimed", "unverified"];

// Santiago, Chile. Anything outside this box is a geocoding accident.
const BBOX = { minLat: -33.65, maxLat: -33.3, minLng: -70.85, maxLng: -70.5 };

const raw = await readFile(new URL("../public/data/places.json", import.meta.url), "utf8");
const places = JSON.parse(raw);

const errors = [];
const warnings = [];
const ids = new Set();

for (const [i, p] of places.entries()) {
  const at = `[${i}] ${p.name ?? "(no name)"}`;

  if (!p.id) errors.push(`${at}: missing id`);
  if (ids.has(p.id)) errors.push(`${at}: duplicate id ${p.id}`);
  ids.add(p.id);

  if (!p.name?.trim()) errors.push(`${at}: missing name`);
  if (!CATEGORIES.includes(p.category)) errors.push(`${at}: bad category ${p.category}`);
  if (!p.sources?.length) errors.push(`${at}: no sources — every record must cite one`);

  if (typeof p.lat !== "number" || typeof p.lng !== "number") {
    errors.push(`${at}: non-numeric coordinates`);
  } else if (
    p.lat < BBOX.minLat ||
    p.lat > BBOX.maxLat ||
    p.lng < BBOX.minLng ||
    p.lng > BBOX.maxLng
  ) {
    errors.push(`${at}: coordinates outside Santiago (${p.lat}, ${p.lng})`);
  }

  for (const key of CLAIM_KEYS) {
    const claim = p.claims?.[key];
    if (!claim) {
      errors.push(`${at}: missing claims.${key} — use an explicit unknown, not an absent key`);
      continue;
    }
    if (!SCOPES.includes(claim.scope)) errors.push(`${at}: claims.${key} bad scope ${claim.scope}`);
    if (!CONFIDENCES.includes(claim.confidence)) {
      errors.push(`${at}: claims.${key} bad confidence ${claim.confidence}`);
    }
    if (claim.confidence !== "unverified" && !claim.source) {
      errors.push(`${at}: claims.${key} is '${claim.confidence}' with no source — not allowed`);
    }
    if (claim.scope !== "unknown" && claim.confidence === "unverified") {
      warnings.push(`${at}: claims.${key} asserts a scope but nobody has checked it`);
    }
  }

  if (!Array.isArray(p.flags)) {
    errors.push(`${at}: flags must be an array`);
  } else {
    for (const f of p.flags) {
      if (!FLAG_KEYS.includes(f)) errors.push(`${at}: unknown flag '${f}'`);
    }
    if (new Set(p.flags).size !== p.flags.length) warnings.push(`${at}: duplicate flags`);
  }
}

const unknown = Object.fromEntries(
  CLAIM_KEYS.map((k) => [k, places.filter((p) => p.claims?.[k]?.scope === "unknown").length]),
);
const verified = places.filter((p) =>
  CLAIM_KEYS.some((k) => p.claims?.[k]?.confidence === "verified"),
).length;

console.log(`${places.length} places checked`);
console.log(
  `coverage — ${Object.entries(unknown)
    .map(([k, n]) => `${k}: ${places.length - n}/${places.length} known`)
    .join(", ")}`,
);
console.log(`${verified}/${places.length} have at least one ground-truth verified claim`);

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log("  ⚠", w);
}

if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error("  ✗", e);
  process.exit(1);
}

console.log("\n✓ data is valid");
