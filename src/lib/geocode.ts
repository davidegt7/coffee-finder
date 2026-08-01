/**
 * Browser-side geocoding via Nominatim, mirroring scripts/geocode.mjs.
 *
 * This exists so the admin form never offers a lat/lng text box. A typo'd
 * coordinate looks exactly like a real one in the database and sends a person
 * to the wrong street — the only defence is to never let a human type one.
 *
 * Restricted to Chile. The map now covers more than Santiago, so a Santiago
 * viewbox would turn a valid Villarrica address into either no result or a
 * dangerously plausible match in the wrong city.
 */

export interface GeocodeHit {
  lat: number;
  lng: number;
  address?: string;
  comuna?: string;
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
  return query
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !wholeUnit.test(part))
    .join(", ")
    .replace(inlineUnit, " ")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function geocode(query: string): Promise<GeocodeHit[]> {
  const lookup = geocodeLookupQuery(query);
  const url =
    `https://nominatim.openstreetmap.org/search?` +
    new URLSearchParams({
      q: `${lookup}, Chile`,
      format: "json",
      limit: "5",
      countrycodes: "cl",
      addressdetails: "1",
    });

  // Nominatim wants a real referrer for browser traffic; a static site sends one
  // by default. Their policy is 1 req/s — a human typing and clicking can't
  // realistically exceed that, so no throttle here.
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const hits = await res.json();

  return (hits as Record<string, never>[]).map((h: Record<string, never>) => {
    const a = (h.address ?? {}) as Record<string, string>;
    return {
      lat: Number(h.lat),
      lng: Number(h.lon),
      address: [a.road, a.house_number].filter(Boolean).join(" ") || undefined,
      comuna: a.city_district || a.suburb || a.town || a.city || undefined,
      osm: `https://www.openstreetmap.org/${h.osm_type}/${h.osm_id}`,
      display: String(h.display_name ?? ""),
    };
  });
}
