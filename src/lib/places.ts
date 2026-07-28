import type { Place, Review } from "../types";
import { isSupabaseConfigured, supabase } from "./auth";

/**
 * The data-layer seam.
 *
 * Everything above this file talks to loadPlaces / savePlace / loadReviews /
 * addReview and knows nothing about where the bytes come from: Supabase when
 * it's configured, the static JSON when it isn't.
 *
 * The JSON fallback isn't dead weight — it's what makes the app work before the
 * project exists, in a fork, and if Supabase is down. A map that reads a
 * CDN-cached file when the database is unreachable beats a map that errors.
 */

const REVIEWS_KEY = "coffeefinder.reviews.v1";

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
  website: string | null;
  instagram: string | null;
  items: string[];
  claims: Place["claims"];
  flags: Place["flags"];
  caveat: string | null;
  sources: string[];
  added_at: string;
}

const rowToPlace = (r: PlaceRow): Place => ({
  id: r.id,
  name: r.name,
  category: r.category as Place["category"],
  lat: r.lat,
  lng: r.lng,
  address: r.address ?? undefined,
  comuna: r.comuna ?? undefined,
  city: r.city,
  website: r.website ?? undefined,
  instagram: r.instagram ?? undefined,
  items: r.items ?? [],
  claims: r.claims,
  flags: r.flags ?? [],
  caveat: r.caveat ?? undefined,
  sources: r.sources ?? [],
  addedAt: r.added_at?.slice(0, 10) ?? "",
});

const placeToRow = (p: Place) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  lat: p.lat,
  lng: p.lng,
  address: p.address ?? null,
  comuna: p.comuna ?? null,
  city: p.city,
  website: p.website ?? null,
  instagram: p.instagram ?? null,
  items: p.items,
  claims: p.claims,
  flags: p.flags,
  caveat: p.caveat ?? null,
  sources: p.sources,
});

async function fetchSeedJson(): Promise<Place[]> {
  const url = `${import.meta.env.BASE_URL}data/places.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`places.json: HTTP ${res.status}`);
  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) throw new Error("places.json: expected an array");
  return raw as Place[];
}

export function loadPlaces(): Promise<Place[]> {
  if (!placesCache) {
    placesCache = (async () => {
      if (isSupabaseConfigured()) {
        const sb = await supabase();
        const { data, error } = await sb!.from("places").select("*").order("name");
        if (!error && data) return (data as PlaceRow[]).map(rowToPlace);
        // Fall through to the seed rather than show an error page. A slightly
        // stale map beats no map when someone is standing on a street corner.
        console.warn("Supabase read failed, falling back to seed JSON:", error?.message);
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

export function loadReviews(): Review[] {
  try {
    const raw = localStorage.getItem(REVIEWS_KEY);
    return raw ? (JSON.parse(raw) as Review[]) : [];
  } catch {
    return [];
  }
}

export function addReview(review: Omit<Review, "id" | "createdAt">): Review {
  const full: Review = {
    ...review,
    id: `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const all = [...loadReviews(), full];
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(all));
  return full;
}

export function reviewsFor(placeId: string, all: Review[]): Review[] {
  return all
    .filter((r) => r.placeId === placeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
