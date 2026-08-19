import type { BrainLocation, BrainSuggestion } from "./brain";
import { ITEMS } from "./items";
import { UNKNOWN_CLAIM, type ClaimKey, type Place } from "../types";

/**
 * Turning a brain's proposal into a place the editor can review.
 *
 * The chat panel hands the whole draft to the form at once — the editor reads
 * the filled form and decides there, rather than accepting twenty rows one at a
 * time before they can see what they add up to. What makes that safe is the
 * same thing that made the field-by-field version safe: nothing here reaches
 * the database. `persistPlace` is still a deliberate click away, `canSave`
 * still demands real coordinates and a source, and Postgres still has the last
 * word.
 *
 * Three fields cannot come from a draft, and it is worth being precise about
 * why each one is absent rather than merely unset:
 *
 *   - **Coordinates** stay at 0, which `canSave` treats as unsaveable. The
 *     address arrives as text for the geocoder box; Nominatim is allowed to
 *     fail loudly, and a plausible invented coordinate cannot be told apart
 *     from a real one.
 *   - **Photos** never arrive at all — `BrainSuggestion` has no slot for one.
 *   - **Confidence** is fixed at `claimed` here, not read from the draft. A
 *     page saying something is the definition of claimed; only a person in the
 *     café can promote it, in the editor, under their own name.
 */

export const blankPlace = (): Place => ({
  id: "",
  name: "",
  category: "cafe",
  lat: 0,
  lng: 0,
  city: "",
  country: "",
  countryCode: "",
  items: [],
  drinkStyles: [],
  filterMethods: [],
  roastLevels: [],
  claims: {
    roastsOnSite: { ...UNKNOWN_CLAIM },
    specialty: { ...UNKNOWN_CLAIM },
    glutenFree: { ...UNKNOWN_CLAIM },
    seedOilFree: { ...UNKNOWN_CLAIM },
  },
  flags: [],
  sources: [],
  addedAt: new Date().toISOString().slice(0, 10),
});

/** Merge a draft onto a place. Anything the draft omits is left exactly as it was. */
export function applyDraft(
  base: Place,
  draft: BrainSuggestion,
  location?: BrainLocation | null,
): Place {
  const today = new Date().toISOString().slice(0, 10);
  const source = draft.sources[0];

  const claims = { ...base.claims };
  for (const [key, claim] of Object.entries(draft.claims) as [
    ClaimKey,
    { scope: "all" | "some" | "none"; note?: string },
  ][]) {
    claims[key] = {
      scope: claim.scope,
      confidence: "claimed",
      source: source ?? base.claims[key].source,
      note: claim.note ?? base.claims[key].note,
      checkedAt: today,
    };
  }

  // Drafts speak in item ids; the editor stores the canonical Spanish label,
  // whatever language the UI is in.
  const labels = draft.items
    .map((id) => ITEMS.find((i) => i.id === id)?.label.es)
    .filter((l): l is string => Boolean(l));
  const items = [...base.items];
  for (const label of labels) {
    if (!items.some((h) => h.toLowerCase() === label.toLowerCase())) items.push(label);
  }

  const flags = [...base.flags];
  for (const f of draft.flags) if (!flags.includes(f)) flags.push(f);

  const sources = [...base.sources];
  for (const s of draft.sources) if (!sources.includes(s)) sources.push(s);

  // The pin from the pasted link wins over anything the model wrote: it is the
  // one part of this that isn't a proposal. Its reverse-geocoded street only
  // fills a gap, so a better address read off the café's own site still shows
  // as a row to accept.
  if (location) {
    if (location.osm && !sources.includes(location.osm)) sources.push(location.osm);
  }

  return {
    ...base,
    lat: location?.lat ?? base.lat,
    lng: location?.lng ?? base.lng,
    name: draft.name ?? base.name,
    category: draft.category ?? base.category,
    address: draft.address ?? location?.address ?? base.address,
    comuna: draft.comuna ?? location?.comuna ?? base.comuna,
    city: draft.city ?? location?.city ?? base.city,
    country: draft.country ?? location?.country ?? base.country,
    countryCode: draft.countryCode ?? location?.countryCode ?? base.countryCode,
    website: draft.website ?? base.website,
    instagram: draft.instagram ?? base.instagram,
    caveat: draft.caveat ?? base.caveat,
    items,
    flags,
    claims,
    sources,
  };
}

/** A one-line "what's in here", for the chat's draft card. */
export function draftSummary(draft: BrainSuggestion): string[] {
  const bits: string[] = [];
  if (draft.address || draft.comuna) {
    bits.push([draft.address, draft.comuna].filter(Boolean).join(", "));
  }
  const n = Object.keys(draft.claims).length;
  if (n) bits.push(`${n} × claim`);
  if (draft.items.length) bits.push(`${draft.items.length} × item`);
  if (draft.flags.length) bits.push(`${draft.flags.length} × extra`);
  return bits;
}
