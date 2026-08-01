import { CATEGORIES, UNKNOWN_CLAIM, type Place } from "../types";
import { isSupabaseConfigured, supabase } from "./auth";
import { DEFAULT_COUNTRY, DEFAULT_COUNTRY_CODE, normalizeCountryCode } from "./geography";

/**
 * The data-layer seam.
 *
 * Everything above this file talks to loadPlaces / savePlace and knows nothing
 * about where the bytes come from: Supabase when it's configured, the static
 * JSON when it isn't. (Reviews moved to lib/reviews.ts when they stopped being
 * device-local.)
 *
 * The JSON fallback isn't dead weight — it's what makes the app work before the
 * project exists, in a fork, and if Supabase is down. A map that reads a
 * CDN-cached file when the database is unreachable beats a map that errors.
 */


let placesCache: Promise<Place[]> | null = null;

/** snake_case in Postgres, camelCase in TS. Convert at the boundary, once. */
interface PlaceRow {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  address: string | null;
  comuna: string | null;
  city: string;
  country: string | null;
  country_code: string | null;
  website: string | null;
  instagram: string | null;
  items: string[];
  claims: Place["claims"];
  flags: Place["flags"];
  photo_url: string | null;
  photo_credit: string | null;
  caveat: string | null;
  sources: string[];
  added_at: string;
}

/**
 * Defensive: a row missing a claim key would crash the first component that
 * reads `place.claims[key]`. Filling the gap with an explicit unknown is both
 * safer and more honest than trusting the database to be fully migrated.
 */
const rowToPlace = (r: PlaceRow): Place => ({
  id: r.id,
  name: r.name,
  category: r.category as Place["category"],
  lat: r.lat,
  lng: r.lng,
  address: r.address ?? undefined,
  comuna: r.comuna ?? undefined,
  city: r.city,
  country: r.country?.trim() || DEFAULT_COUNTRY,
  countryCode: normalizeCountryCode(r.country_code) || DEFAULT_COUNTRY_CODE,
  website: r.website ?? undefined,
  instagram: r.instagram ?? undefined,
  items: r.items ?? [],
  claims: {
    roastsOnSite: r.claims?.roastsOnSite ?? { ...UNKNOWN_CLAIM },
    specialty: r.claims?.specialty ?? { ...UNKNOWN_CLAIM },
    glutenFree: r.claims?.glutenFree ?? { ...UNKNOWN_CLAIM },
    seedOilFree: r.claims?.seedOilFree ?? { ...UNKNOWN_CLAIM },
  },
  flags: Array.isArray(r.flags) ? r.flags : [],
  photoUrl: r.photo_url ?? undefined,
  photoCredit: r.photo_credit ?? undefined,
  caveat: r.caveat ?? undefined,
  sources: r.sources ?? [],
  addedAt: r.added_at?.slice(0, 10) ?? "",
});

/**
 * Is this row from a migrated, coffee-shaped table?
 *
 * The JSON fallback below only used to trigger on a query *error* — but a table
 * that still holds the previous app's schema answers happily with rows that are
 * simply the wrong shape. Those crashed the render and white-screened the whole
 * app, which is a far worse failure than showing slightly stale data. Shape is
 * checked explicitly so "the database hasn't been migrated yet" degrades exactly
 * like "the database is unreachable".
 */
const isCoffeeRow = (r: PlaceRow): boolean =>
  r != null &&
  typeof r.claims === "object" &&
  r.claims !== null &&
  CATEGORIES.includes(r.category as Place["category"]);

const placeToRow = (p: Place) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  lat: p.lat,
  lng: p.lng,
  address: p.address ?? null,
  comuna: p.comuna ?? null,
  city: p.city,
  country: p.country,
  country_code: normalizeCountryCode(p.countryCode),
  website: p.website ?? null,
  instagram: p.instagram ?? null,
  items: p.items,
  claims: p.claims,
  flags: p.flags,
  photo_url: p.photoUrl ?? null,
  photo_credit: p.photoCredit ?? null,
  caveat: p.caveat ?? null,
  sources: p.sources,
});

async function fetchSeedJson(): Promise<Place[]> {
  const url = `${import.meta.env.BASE_URL}data/places.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`places.json: HTTP ${res.status}`);
  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) throw new Error("places.json: expected an array");
  return (raw as Partial<Place>[]).map((place) => ({
    ...place,
    country: place.country?.trim() || DEFAULT_COUNTRY,
    countryCode: normalizeCountryCode(place.countryCode) || DEFAULT_COUNTRY_CODE,
  })) as Place[];
}

export function loadPlaces(): Promise<Place[]> {
  if (!placesCache) {
    placesCache = (async () => {
      if (isSupabaseConfigured()) {
        const sb = await supabase();
        const { data, error } = await sb!.from("places").select("*").order("name");
        if (error) {
          // Fall through to the seed rather than show an error page. A slightly
          // stale map beats no map when someone is standing on a street corner.
          console.warn("Supabase read failed, falling back to seed JSON:", error.message);
        } else if (data) {
          const rows = data as PlaceRow[];
          // An empty table is a legitimate answer (nothing seeded yet); a table
          // full of the wrong shape is not.
          if (rows.length === 0 || rows.every(isCoffeeRow)) {
            return rows.map(rowToPlace);
          }
          console.warn(
            `Supabase returned ${rows.length} rows that aren't coffee-shaped — ` +
              "the table probably still holds the previous app's schema. " +
              "Run supabase/schema.sql. Falling back to seed JSON.",
          );
        }
      }
      return fetchSeedJson();
    })().catch((err) => {
      // Never cache a rejection — one offline load would poison every later call.
      placesCache = null;
      throw err;
    });
  }
  return placesCache;
}

/** Forces the next loadPlaces to re-read. Call after a write. */
export function invalidatePlaces(): void {
  placesCache = null;
}

/**
 * Insert or update. Requires Supabase configured AND the signed-in email to be
 * in `editors` — RLS rejects it otherwise, which is the point: this cannot be
 * tricked into writing by anything the client does.
 */
export async function savePlace(place: Place): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase no está configurado. Revisa el README." };
  }
  const sb = await supabase();
  const { error } = await sb!.from("places").upsert(placeToRow(place), { onConflict: "id" });
  if (!error) invalidatePlaces();
  return { error: error?.message ?? null };
}
