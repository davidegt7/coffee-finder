import type { Category, Claim, ClaimKey, FlagKey, Place } from "../types";
import { placeHasItem } from "./items";

/**
 * How strict a claim filter is:
 *   off  — not filtering on this axis
 *   some — the place has real options ("tiene opciones sin gluten")
 *   all  — the whole place honours it ("tuesta todo su café acá")
 */
export type ClaimStrictness = "off" | "some" | "all";

export interface Filters {
  claims: Record<ClaimKey, ClaimStrictness>;
  /** AND'd — "wifi + enchufes" means you need both to actually work there. */
  flags: FlagKey[];
  categories: Category[];
  /** OR'd — "espresso or flat white" means either will do. */
  items: string[];
  query: string;
  /** Only count a claim if someone actually checked it. */
  verifiedOnly: boolean;
}

export const EMPTY_FILTERS: Filters = {
  claims: { roastsOnSite: "off", specialty: "off", glutenFree: "off", seedOilFree: "off" },
  flags: [],
  categories: [],
  items: [],
  query: "",
  verifiedOnly: false,
};

export function matchesClaim(
  claim: Claim,
  want: ClaimStrictness,
  verifiedOnly: boolean,
): boolean {
  if (want === "off") return true;
  if (verifiedOnly && claim.confidence !== "verified") return false;
  // An unverified claim still counts by default — it's what the business says —
  // but 'unknown' and 'none' never match. Absence of evidence is not a yes.
  if (claim.confidence === "unverified") return false;
  if (want === "all") return claim.scope === "all";
  return claim.scope === "all" || claim.scope === "some";
}

function matchesQuery(place: Place, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [place.name, place.comuna ?? "", place.address ?? "", ...place.items]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

export function applyFilters(places: Place[], filters: Filters): Place[] {
  const activeClaims = (Object.entries(filters.claims) as [ClaimKey, ClaimStrictness][]).filter(
    ([, want]) => want !== "off",
  );

  return places.filter((place) => {
    if (filters.categories.length && !filters.categories.includes(place.category)) return false;
    if (!matchesQuery(place, filters.query)) return false;
    if (filters.items.length && !filters.items.some((id) => placeHasItem(place, id))) return false;
    if (filters.flags.length && !filters.flags.every((f) => place.flags.includes(f))) return false;

    // "Solo comprobado" with no claim axis selected still has to mean something,
    // or the checkbox is a lie: it reads as a promise and would silently do
    // nothing. With no axis to scope it to, it means "places where somebody has
    // ground-truthed *any* claim".
    if (activeClaims.length === 0) {
      if (filters.verifiedOnly) {
        return Object.values(place.claims).some((c) => c.confidence === "verified");
      }
      return true;
    }

    return activeClaims.every(([key, want]) =>
      matchesClaim(place.claims[key], want, filters.verifiedOnly),
    );
  });
}

export function activeFilterCount(filters: Filters): number {
  const claims = Object.values(filters.claims).filter((v) => v !== "off").length;
  return (
    claims +
    filters.flags.length +
    filters.categories.length +
    filters.items.length +
    (filters.query.trim() ? 1 : 0)
  );
}

/**
 * How many places each item would yield, given every OTHER active filter.
 *
 * Faceted rather than global: if you've already picked "Tostaduría", the counts
 * must describe roasteries, or they promise results the click won't deliver.
 * Zero is a legitimate answer — it's how a gap in the data becomes visible
 * instead of an empty screen after a hopeful tap.
 */
export function itemCounts(places: Place[], filters: Filters, ids: string[]): Map<string, number> {
  const base = applyFilters(places, { ...filters, items: [] });
  return new Map(ids.map((id) => [id, base.filter((p) => placeHasItem(p, id)).length]));
}

/** Same idea for amenity flags. */
export function flagCounts(places: Place[], filters: Filters, keys: FlagKey[]): Map<FlagKey, number> {
  const base = applyFilters(places, { ...filters, flags: [] });
  return new Map(keys.map((k) => [k, base.filter((p) => p.flags.includes(k)).length]));
}
