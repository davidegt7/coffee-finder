/**
 * Roasters directory — load, filter, and outbound shop links.
 *
 * Separate from places: the café map answers "where do I sit for coffee",
 * this answers "whose beans do I want, and where do I buy them". We never
 * process payment; every buy action is a link to the roaster's own store.
 */

import type { Roaster } from "../types";
import { DEFAULT_COUNTRY, DEFAULT_COUNTRY_CODE, normalizeCountryCode } from "./geography";
import { fold } from "./text";

export interface RoasterFilters {
  countryCode: string | null;
  city: string | null;
  /** Free-text region match against `region` and city. */
  region: string | null;
  shipsLocally: boolean;
  shipsInternationally: boolean;
  hasSubscription: boolean;
  buying: "all" | "online" | "inPerson";
  query: string;
}

export const EMPTY_ROASTER_FILTERS: RoasterFilters = {
  countryCode: null,
  city: null,
  region: null,
  shipsLocally: false,
  shipsInternationally: false,
  hasSubscription: false,
  buying: "all",
  query: "",
};

function normalizeRoaster(raw: Partial<Roaster> & { id: string; name: string }): Roaster | null {
  if (typeof raw.lat !== "number" || typeof raw.lng !== "number") return null;
  if (!raw.city?.trim()) return null;
  return {
    id: raw.id,
    name: raw.name.trim(),
    description: raw.description?.trim() || undefined,
    lat: raw.lat,
    lng: raw.lng,
    address: raw.address?.trim() || undefined,
    city: raw.city.trim(),
    region: raw.region?.trim() || undefined,
    country: raw.country?.trim() || DEFAULT_COUNTRY,
    countryCode: normalizeCountryCode(raw.countryCode) || DEFAULT_COUNTRY_CODE,
    website: raw.website?.trim() || undefined,
    onlineStore: raw.onlineStore?.trim() || undefined,
    instagram: raw.instagram?.trim() || undefined,
    shipsLocally: Boolean(raw.shipsLocally),
    shipsInternationally: Boolean(raw.shipsInternationally),
    hasSubscription: Boolean(raw.hasSubscription),
    shippingNotes: raw.shippingNotes?.trim() || undefined,
    physicalLocations: Array.isArray(raw.physicalLocations)
      ? raw.physicalLocations
          .filter((loc) => loc && typeof loc.city === "string" && loc.city.trim())
          .map((loc) => ({
            name: loc.name?.trim() || undefined,
            address: loc.address?.trim() || undefined,
            city: loc.city.trim(),
            country: loc.country?.trim() || raw.country?.trim() || DEFAULT_COUNTRY,
            countryCode:
              normalizeCountryCode(loc.countryCode) ||
              normalizeCountryCode(raw.countryCode) ||
              DEFAULT_COUNTRY_CODE,
            lat: typeof loc.lat === "number" ? loc.lat : undefined,
            lng: typeof loc.lng === "number" ? loc.lng : undefined,
          }))
      : undefined,
    photoUrl: raw.photoUrl?.trim() || undefined,
    photoCredit: raw.photoCredit?.trim() || undefined,
    sources: Array.isArray(raw.sources) ? raw.sources.filter(Boolean) : [],
    addedAt: raw.addedAt?.slice(0, 10) ?? "",
  };
}

let roastersCache: Promise<Roaster[]> | null = null;

/**
 * Static JSON only for now. Supabase can land later the same way places did;
 * until then the CDN-cached file is the whole product surface.
 */
export async function loadRoasters(): Promise<Roaster[]> {
  if (!roastersCache) {
    roastersCache = (async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}data/roasters.json`);
      if (!res.ok) throw new Error(`Failed to load roasters.json (${res.status})`);
      const data: unknown = await res.json();
      if (!Array.isArray(data)) throw new Error("roasters.json must be an array");
      return data
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const r = row as Partial<Roaster>;
          if (typeof r.id !== "string" || typeof r.name !== "string") return null;
          return normalizeRoaster(r as Partial<Roaster> & { id: string; name: string });
        })
        .filter((r): r is Roaster => r !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
    })();
  }
  return roastersCache;
}

/** Preferred URL for the buy / visit CTA: shop first, then brand site. */
export function roasterShopUrl(roaster: Roaster): string | undefined {
  return roaster.onlineStore?.trim() || roaster.website?.trim() || undefined;
}

/** A published checkout or a shipping business with a usable brand site. */
export function roasterSellsOnline(roaster: Roaster): boolean {
  return Boolean(
    roaster.onlineStore?.trim() ||
      (roaster.website?.trim() &&
        (roaster.shipsLocally || roaster.shipsInternationally || roaster.hasSubscription)),
  );
}

/** A public retail location, or a small roaster with no online sales channel. */
export function roasterSellsInPerson(roaster: Roaster): boolean {
  return Boolean(
    roaster.physicalLocations?.length ||
      (!roasterSellsOnline(roaster) && (roaster.address?.trim() || roaster.city.trim())),
  );
}

/**
 * Brand site when it differs from the shop — profile can show both without
 * two identical buttons.
 */
export function roasterBrandUrl(roaster: Roaster): string | undefined {
  const site = roaster.website?.trim();
  const shop = roaster.onlineStore?.trim();
  if (!site) return undefined;
  if (shop && fold(site) === fold(shop)) return undefined;
  return site;
}

function matchesQuery(roaster: Roaster, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  const haystack = fold(
    [
      roaster.name,
      roaster.description ?? "",
      roaster.city,
      roaster.region ?? "",
      roaster.country,
      roaster.address ?? "",
      roaster.shippingNotes ?? "",
      ...(roaster.physicalLocations ?? []).flatMap((loc) => [
        loc.name ?? "",
        loc.city,
        loc.country,
        loc.address ?? "",
      ]),
    ].join(" "),
  );
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

export function applyRoasterFilters(roasters: Roaster[], filters: RoasterFilters): Roaster[] {
  return roasters.filter((r) => {
    if (filters.countryCode && r.countryCode !== filters.countryCode) return false;
    if (filters.city && fold(r.city) !== fold(filters.city)) return false;
    if (filters.region) {
      const want = fold(filters.region);
      const has =
        (r.region && fold(r.region).includes(want)) ||
        fold(r.city).includes(want) ||
        (r.physicalLocations ?? []).some(
          (loc) => fold(loc.city).includes(want) || fold(loc.country).includes(want),
        );
      if (!has) return false;
    }
    if (filters.shipsLocally && !r.shipsLocally) return false;
    if (filters.shipsInternationally && !r.shipsInternationally) return false;
    if (filters.hasSubscription && !r.hasSubscription) return false;
    if (filters.buying === "online" && !roasterSellsOnline(r)) return false;
    if (filters.buying === "inPerson" && !roasterSellsInPerson(r)) return false;
    if (!matchesQuery(r, filters.query)) return false;
    return true;
  });
}

export function activeRoasterFilterCount(filters: RoasterFilters): number {
  let n = 0;
  if (filters.countryCode) n += 1;
  if (filters.city) n += 1;
  if (filters.region) n += 1;
  if (filters.shipsLocally) n += 1;
  if (filters.shipsInternationally) n += 1;
  if (filters.hasSubscription) n += 1;
  if (filters.buying !== "all") n += 1;
  if (filters.query.trim()) n += 1;
  return n;
}

export function roasterCountryCounts(roasters: Roaster[]): { code: string; country: string; n: number }[] {
  const map = new Map<string, { country: string; n: number }>();
  for (const r of roasters) {
    const cur = map.get(r.countryCode);
    if (cur) cur.n += 1;
    else map.set(r.countryCode, { country: r.country, n: 1 });
  }
  return [...map.entries()]
    .map(([code, { country, n }]) => ({ code, country, n }))
    .sort((a, b) => b.n - a.n || a.country.localeCompare(b.country));
}

export function roasterCityCounts(
  roasters: Roaster[],
  countryCode: string | null,
): { city: string; n: number }[] {
  const map = new Map<string, number>();
  for (const r of roasters) {
    if (countryCode && r.countryCode !== countryCode) continue;
    map.set(r.city, (map.get(r.city) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([city, n]) => ({ city, n }))
    .sort((a, b) => b.n - a.n || a.city.localeCompare(b.city));
}

export function roasterRegionCounts(
  roasters: Roaster[],
  countryCode: string | null,
): { region: string; n: number }[] {
  const map = new Map<string, number>();
  for (const r of roasters) {
    if (countryCode && r.countryCode !== countryCode) continue;
    if (!r.region) continue;
    map.set(r.region, (map.get(r.region) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([region, n]) => ({ region, n }))
    .sort((a, b) => b.n - a.n || a.region.localeCompare(b.region));
}
