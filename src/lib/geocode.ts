/**
 * Browser-side geocoding via Nominatim, mirroring scripts/geocode.mjs.
 *
 * This exists so the admin form never offers a lat/lng text box. A typo'd
 * coordinate looks exactly like a real one in the database and sends a person
 * to the wrong street — the only defence is to never let a human type one.
 *
 * Country-aware rather than tied to one city or country. The country code comes
 * from the editor (or a prior geocode result), keeping identical street names
 * in Copenhagen, Santiago and New York from competing with one another.
 */

export interface GeocodeHit {
  lat: number;
  lng: number;
  address?: string;
  comuna?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  osm: string;
  display: string;
}

export interface AddressIntersection {
  street: string;
  crossStreet: string;
  city: string;
}

/** "Julio Zegers 530, esquina Vicente Reyes" → the two road names. */
export function addressIntersection(address: string, city?: string): AddressIntersection | null {
  const match = address.match(
    /^\s*(.+?)\s*,?\s+(?:esquina|esq\.?|corner(?:\s+of)?|at\s+the\s+corner\s+of)\s+([^,]+)(?:,|$)/i,
  );
  if (!match || !city?.trim()) return null;
  const street = match[1].replace(/\s+\d+[a-z]?\s*$/i, "").trim();
  const crossStreet = match[2].trim();
  return street && crossStreet ? { street, crossStreet, city: city.trim() } : null;
}

const overpassValue = (value: string) => value.replace(/[\\"]/g, "\\$&");
const overpassNameRegex = (value: string) =>
  overpassValue(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Nominatim often knows both streets but not a building number at their
 * corner. Overpass can safely return the one OSM node shared by those roads.
 */
export async function geocodeIntersection(
  address: string,
  city?: string,
  country?: string,
  countryCode?: string,
): Promise<GeocodeHit | null> {
  const corner = addressIntersection(address, city);
  if (!corner) return null;
  const area = overpassValue(corner.city);
  const street = overpassNameRegex(corner.street);
  const cross = overpassNameRegex(corner.crossStreet);
  const query =
    `[out:json][timeout:25];` +
    `area["name"="${area}"]["boundary"="administrative"]->.searchArea;` +
    `way["highway"]["name"~"^${street}$",i](area.searchArea)->.a;` +
    `way["highway"]["name"~"^${cross}$",i](area.searchArea)->.b;` +
    `node(w.a)(w.b);out body;`;
  const url = `https://overpass-api.de/api/interpreter?${new URLSearchParams({ data: query })}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const body = (await res.json()) as {
    elements?: { type?: string; id?: number; lat?: number; lon?: number }[];
  };
  const nodes = (body.elements ?? []).filter(
    (node) => node.type === "node" && Number.isFinite(node.lat) && Number.isFinite(node.lon),
  );
  if (nodes.length !== 1) return null;
  const node = nodes[0];
  return {
    lat: Number(node.lat),
    lng: Number(node.lon),
    comuna: corner.city,
    city: corner.city,
    country,
    countryCode,
    osm: `https://www.openstreetmap.org/node/${node.id}`,
    display: `${corner.street} × ${corner.crossStreet}, ${corner.city}`,
  };
}

/**
 * Pick a result only when the geocoder returned one unique address whose
 * street and house-number tokens are all present in the searched address.
 *
 * Leading zeroes are ignored ("068" is the same street number as "68"). A
 * street-only result never qualifies: that is precisely the ambiguous case a
 * person still needs to review.
 */
export function exactGeocodeHit(query: string, hits: GeocodeHit[]): GeocodeHit | null {
  const tokens = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => (/^\d+$/.test(token) ? String(Number(token)) : token));

  const searched = new Set(tokens(query));
  const exact = hits.filter((hit) => {
    if (!hit.address) return false;
    const address = tokens(hit.address);
    const numbers = address.filter((token) => /^\d+$/.test(token));
    if (!numbers.length || !numbers.every((token) => searched.has(token))) return false;
    // Nominatim may expand an official street name ("General Urrutia" →
    // "General Basilio Urrutia"). Match the house number plus one meaningful
    // street word for one-word streets, or two for longer names.
    const words = address.filter((token) => !/^\d+$/.test(token));
    const overlap = words.filter((token) => searched.has(token)).length;
    return overlap >= Math.min(2, words.length);
  });

  return exact.length === 1 ? exact[0] : null;
}

const UNIT_LABEL =
  "(?:local|loc\\.?|oficina|of\\.?|piso|depto\\.?|departamento|dpto\\.?|unidad|suite|m[oó]dulo|tienda|store)";

/**
 * Locality abbreviations Nominatim will not expand for itself.
 *
 * Argentina writes its capital as "Cdad. Autónoma de Buenos Aires" — the form
 * Google Maps and most café listings produce — and Nominatim returns ZERO
 * results for it, on any street. Spelling "Ciudad" out returns the right hit:
 *
 *   Franklin D. Roosevelt, C1428 Cdad. Autónoma de Buenos Aires  → 0 results
 *   Franklin D. Roosevelt, C1428 Ciudad Autónoma de Buenos Aires → Belgrano ✓
 *
 * Each entry here is one that was measured to fail, not one that looked
 * suspicious. "CABA", "C.A.B.A.", "Av." and the Argentine postal code
 * ("C1428", "C1428ABC") all resolve fine as written and are left alone —
 * rewriting a string the geocoder already understands can only lose.
 */
const LOCALITY_ABBREVIATIONS: [RegExp, string][] = [[/\bCdad\b\.?/gi, "Ciudad"]];

/**
 * Nominatim locates buildings, not their internal shops/offices. Remove unit
 * details only from the lookup string; the Place keeps the original address so
 * visitors still see "local 101" after coordinates are selected.
 */
export function geocodeLookupQuery(query: string): string {
  const wholeUnit = new RegExp(`^${UNIT_LABEL}(?=\\s|#|n[°º.]?|\\d|$)`, "i");
  const inlineUnit = new RegExp(
    `\\s+${UNIT_LABEL}(?=\\s|#|n[°º.]?|\\d|$)\\s*(?:n[°º.]?\\s*)?[a-z0-9-]+`,
    "gi",
  );
  const expanded = LOCALITY_ABBREVIATIONS.reduce(
    (text, [pattern, full]) => text.replace(pattern, full),
    query,
  );
  return expanded
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !wholeUnit.test(part))
    .join(", ")
    .replace(inlineUnit, " ")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function geocode(
  query: string,
  options: { country?: string; countryCode?: string; city?: string } = {},
): Promise<GeocodeHit[]> {
  const lookup = geocodeLookupQuery(query);
  const location = [lookup, options.city, options.country]
    .filter((part, index, all): part is string => Boolean(part?.trim()) && all.indexOf(part) === index)
    .join(", ");
  const countryCode = options.countryCode?.trim().toLowerCase();
  const request = async (q: string) => {
    const params: Record<string, string> = {
      q,
      format: "json",
      limit: "5",
      addressdetails: "1",
    };
    if (/^[a-z]{2}$/.test(countryCode ?? "")) params.countrycodes = countryCode!;
    const url =
      `https://nominatim.openstreetmap.org/search?` +
      new URLSearchParams(params);
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    return (await res.json()) as Record<string, never>[];
  };

  // A brain draft can contain a complete postal address in the source site's
  // language while its separate city/country fields have already been
  // localized for the editor ("New York, United States" versus
  // "Nueva York, Estados Unidos"). Appending both translations makes a valid
  // address impossible for Nominatim to parse. Prefer the constrained form,
  // then retry the address exactly as supplied when it returned nothing.
  let hits = await request(location);
  if (!hits.length && location !== lookup) {
    // Nominatim's public policy is at most one request per second. The retry is
    // exceptional, so waiting here keeps the fallback polite and predictable.
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    hits = await request(lookup);
  }

  return hits.map((h: Record<string, never>) => {
    const a = (h.address ?? {}) as Record<string, string>;
    return {
      lat: Number(h.lat),
      lng: Number(h.lon),
      address: [a.road, a.house_number].filter(Boolean).join(" ") || undefined,
      comuna: a.city_district || a.borough || a.suburb || a.quarter || a.neighbourhood || undefined,
      city: a.city || a.town || a.municipality || a.village || undefined,
      country: a.country || undefined,
      countryCode: a.country_code?.toLowerCase() || undefined,
      osm: `https://www.openstreetmap.org/${h.osm_type}/${h.osm_id}`,
      display: String(h.display_name ?? ""),
    };
  });
}
