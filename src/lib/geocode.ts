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
 * Fold US street-type and direction abbreviations so "Ave" matches "Avenue"
 * and "S" matches "South" when scoring an exact house-number hit.
 */
const TOKEN_SYNONYM: Record<string, string> = {
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  ne: "northeast",
  nw: "northwest",
  se: "southeast",
  sw: "southwest",
  ave: "avenue",
  avenue: "avenue",
  blvd: "boulevard",
  boulevard: "boulevard",
  cir: "circle",
  circle: "circle",
  ct: "court",
  court: "court",
  dr: "drive",
  drive: "drive",
  hwy: "highway",
  highway: "highway",
  ln: "lane",
  lane: "lane",
  pkwy: "parkway",
  parkway: "parkway",
  pl: "place",
  place: "place",
  rd: "road",
  road: "road",
  st: "street",
  street: "street",
  ter: "terrace",
  terrace: "terrace",
  trl: "trail",
  trail: "trail",
};

function geocodeTokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (/^\d+$/.test(token)) return String(Number(token));
      return TOKEN_SYNONYM[token] ?? token;
    });
}

const DIRECTION_TOKENS = new Set([
  "north",
  "south",
  "east",
  "west",
  "northeast",
  "northwest",
  "southeast",
  "southwest",
]);

/**
 * Pick a result only when the geocoder returned one unique address whose
 * street and house-number tokens are all present in the searched address.
 *
 * Leading zeroes are ignored ("068" is the same street number as "68"). A
 * street-only result never qualifies: that is precisely the ambiguous case a
 * person still needs to review.
 *
 * When several hits share the same house number (two OSM nodes for "449
 * Orlando Avenue"), prefer a single Census match if one is present — Census
 * keeps the N/S direction and is the more precise pin for US street addresses.
 */
export function exactGeocodeHit(query: string, hits: GeocodeHit[]): GeocodeHit | null {
  const searched = new Set(geocodeTokens(query));
  const searchedDirections = new Set(
    [...searched].filter((token) => DIRECTION_TOKENS.has(token)),
  );
  const matches = hits.filter((hit) => {
    // Census hits put the house number on display more reliably than address.
    const hay = hit.address || hit.display;
    if (!hay) return false;
    const address = geocodeTokens(hay);
    const numbers = address.filter((token) => /^\d+$/.test(token));
    if (!numbers.length || !numbers.every((token) => searched.has(token))) return false;
    // Nominatim may expand an official street name ("General Urrutia" →
    // "General Basilio Urrutia"). Match the house number plus one meaningful
    // street word for one-word streets, or two for longer names.
    // Skip pure direction tokens when scoring — "South" alone is not a street.
    const addressDirections = address.filter((token) => DIRECTION_TOKENS.has(token));
    // If the source says NW, never silently accept the NE/SW building with the
    // same number. Directionless input can still show all candidates for review.
    if (
      searchedDirections.size > 0 &&
      !addressDirections.some((token) => searchedDirections.has(token))
    ) {
      return false;
    }
    const words = address.filter(
      (token) => !/^\d+$/.test(token) && !DIRECTION_TOKENS.has(token),
    );
    const overlap = words.filter((token) => searched.has(token)).length;
    return overlap >= Math.min(2, words.length);
  });

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    // Census pins use an openstreetmap.org/?mlat= map URL, not a node/way id.
    const census = matches.filter((h) => /[?&]mlat=/.test(h.osm));
    if (census.length === 1) return census[0];
  }
  return null;
}

/*
 * Unit labels in both languages. The Spanish set was here from the start; the
 * US forms were not, so "47 E Robinson St Unit 100, Orlando, FL 32801" reached
 * Nominatim intact and returned NOTHING — the same failure as "Cdad.", from a
 * different direction. Measured: dropping the unit gives one exact hit, while
 * "Unit", "#100", "Ste" and "Apt" each return zero on their own.
 *
 * "fl" is deliberately absent even though it abbreviates "floor": in a US
 * address FL is far more often Florida, and stripping a state is a worse bug
 * than leaving a floor in.
 */
const UNIT_LABEL =
  "(?:local|loc\\.?|oficina|of\\.?|piso|depto\\.?|departamento|dpto\\.?|unidad|suite|ste\\.?|unit|apt\\.?|apartment|room|floor|m[oó]dulo|tienda|store)";

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
 * US street / state abbreviations Nominatim's free-form search mishandles.
 *
 * Measured 2026-08-07 on "449 S Orlando Ave, Maitland, FL 32751, United States":
 *   free-form q=…                       → street only, no house number (or 0)
 *   street=449 Orlando Avenue + city…    → house 449 ✓
 *   US Census one-line address           → exact S Orlando Ave pin ✓
 *
 * Expanding Ave→Avenue and FL→Florida is not enough on its own (free-form still
 * missed the number). Structured search + Census fallback is what fixes it.
 * Only apply when the text already looks US-shaped so Chilean "Av." stays put.
 */
const US_STATE_ABBREV: Record<string, string> = {
  al: "Alabama",
  ak: "Alaska",
  az: "Arizona",
  ar: "Arkansas",
  ca: "California",
  co: "Colorado",
  ct: "Connecticut",
  de: "Delaware",
  fl: "Florida",
  ga: "Georgia",
  hi: "Hawaii",
  id: "Idaho",
  il: "Illinois",
  in: "Indiana",
  ia: "Iowa",
  ks: "Kansas",
  ky: "Kentucky",
  la: "Louisiana",
  me: "Maine",
  md: "Maryland",
  ma: "Massachusetts",
  mi: "Michigan",
  mn: "Minnesota",
  ms: "Mississippi",
  mo: "Missouri",
  mt: "Montana",
  ne: "Nebraska",
  nv: "Nevada",
  nh: "New Hampshire",
  nj: "New Jersey",
  nm: "New Mexico",
  ny: "New York",
  nc: "North Carolina",
  nd: "North Dakota",
  oh: "Ohio",
  ok: "Oklahoma",
  or: "Oregon",
  pa: "Pennsylvania",
  ri: "Rhode Island",
  sc: "South Carolina",
  sd: "South Dakota",
  tn: "Tennessee",
  tx: "Texas",
  ut: "Utah",
  vt: "Vermont",
  va: "Virginia",
  wa: "Washington",
  wv: "West Virginia",
  wi: "Wisconsin",
  wy: "Wyoming",
  dc: "District of Columbia",
};

const US_STREET_TYPES: [RegExp, string][] = [
  [/\bAve\.?\b/gi, "Avenue"],
  [/\bBlvd\.?\b/gi, "Boulevard"],
  [/\bCir\.?\b/gi, "Circle"],
  [/\bCt\.?\b/gi, "Court"],
  [/\bDr\.?\b/gi, "Drive"],
  [/\bExpy\.?\b/gi, "Expressway"],
  [/\bFwy\.?\b/gi, "Freeway"],
  [/\bHwy\.?\b/gi, "Highway"],
  [/\bLn\.?\b/gi, "Lane"],
  [/\bPkwy\.?\b/gi, "Parkway"],
  [/\bPl\.?\b/gi, "Place"],
  [/\bRd\.?\b/gi, "Road"],
  [/\bSq\.?\b/gi, "Square"],
  [/\bSt\.?\b/gi, "Street"],
  [/\bTer\.?\b/gi, "Terrace"],
  [/\bTrl\.?\b/gi, "Trail"],
  [/\bWay\.?\b/gi, "Way"],
];

const US_DIRECTIONS: [RegExp, string][] = [
  [/\bN\.?\b/g, "North"],
  [/\bS\.?\b/g, "South"],
  [/\bE\.?\b/g, "East"],
  [/\bW\.?\b/g, "West"],
  [/\bNE\.?\b/g, "Northeast"],
  [/\bNW\.?\b/g, "Northwest"],
  [/\bSE\.?\b/g, "Southeast"],
  [/\bSW\.?\b/g, "Southwest"],
];

/** True when the text already signals a US address (so we don't rewrite Chile). */
export function looksLikeUsAddress(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(united states|usa|u\.s\.a\.|u\.s\.)\b/.test(t)) return true;
  // "Maitland, FL 32751" or "FL, 32751" — state abbrev as its own comma part,
  // optionally followed by a ZIP. Not bare "fl" inside a Spanish word.
  if (/(?:^|,\s*)(A[LKZR]|C[AOT]|D[EC]|F[LM]|G[AU]|HI|I[ADLN]|K[SY]|LA|M[ADEHINOST]|N[CDEHJMVY]|O[HKR]|P[AR]|RI|S[CD]|T[NX]|UT|V[AIT]|W[AIVY])(?:\s+\d{5}(?:-\d{4})?)?(?:\s*,|$)/i.test(
    text,
  )) {
    return true;
  }
  if (/\b\d{5}(?:-\d{4})?\b/.test(text) && /\b(ave|blvd|st|rd|dr|ln|ct|hwy)\b\.?/i.test(text)) {
    return true;
  }
  return false;
}

function expandUsStreetPart(part: string): string {
  let out = part;
  for (const [re, full] of US_STREET_TYPES) out = out.replace(re, full);
  // Directions only as whole tokens (word boundaries already in the regex).
  for (const [re, full] of US_DIRECTIONS) out = out.replace(re, full);
  return out.replace(/\s{2,}/g, " ").trim();
}

function expandUsStateInParts(parts: string[]): string[] {
  return parts.map((part) => {
    const m = part
      .trim()
      .match(/^([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/);
    if (!m) return part;
    const full = US_STATE_ABBREV[m[1].toLowerCase()];
    if (!full) return part;
    return m[2] ? `${full} ${m[2]}` : full;
  });
}

/**
 * Nominatim locates buildings, not their internal shops/offices. Remove unit
 * details only from the lookup string; the Place keeps the original address so
 * visitors still see "local 101" after coordinates are selected.
 */
export function geocodeLookupQuery(query: string, countryCode?: string): string {
  const wholeUnit = new RegExp(`^${UNIT_LABEL}(?=\\s|#|n[°º.]?|\\d|$)`, "i");
  const inlineUnit = new RegExp(
    `\\s+${UNIT_LABEL}(?=\\s|#|n[°º.]?|\\d|$)\\s*(?:n[°º.]?\\s*)?[a-z0-9-]+`,
    "gi",
  );
  // "#100" names a unit with no word attached, so it needs its own rule.
  const hashUnit = /\s+#\s*[a-z0-9-]+/gi;
  let expanded = LOCALITY_ABBREVIATIONS.reduce(
    (text, [pattern, full]) => text.replace(pattern, full),
    query,
  );

  // US expansions only when the address already looks American — rewriting
  // "Av. Providencia" would be a different bug.
  if (looksLikeUsAddress(expanded) || countryCode?.trim().toLowerCase() === "us") {
    const parts = expanded.split(",").map((p) => p.trim()).filter(Boolean);
    const withStates = expandUsStateInParts(parts);
    expanded = withStates
      .map((part, i) => (i === 0 || /^\d/.test(part) ? expandUsStreetPart(part) : part))
      .join(", ");
  }

  return expanded
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !wholeUnit.test(part))
    .join(", ")
    .replace(inlineUnit, " ")
    .replace(hashUnit, " ")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export interface ParsedStreetAddress {
  houseNumber?: string;
  street?: string;
  /** Direction-preserving value for Nominatim's `street=` field. */
  streetLine?: string;
  /** Directionless retry for datasets that index only the base street name. */
  streetLineFallback?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

/**
 * Pull structured fields out of a US-style "449 S Orlando Ave, Maitland, FL 32751".
 *
 * Nominatim free-form search often returns the road without the house number for
 * these; the same text as structured params finds the building.
 */
export function parseStreetAddress(
  query: string,
  countryCode?: string,
): ParsedStreetAddress | null {
  const cleaned = geocodeLookupQuery(query, countryCode);
  const parts = cleaned
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const first = parts[0];
  const houseMatch = first.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
  if (!houseMatch) return null;

  const houseNumber = houseMatch[1];
  let street = houseMatch[2].trim();
  // Nominatim structured search matches house numbers better without the
  // leading direction in some US datasets ("Orlando Avenue" not "South Orlando
  // Avenue"), so keep a direction-stripped form as a second attempt.
  const streetNoDir = street
    .replace(/^(North|South|East|West|Northeast|Northwest|Southeast|Southwest)\s+/i, "")
    .trim();

  let city: string | undefined;
  let state: string | undefined;
  let postcode: string | undefined;
  let country: string | undefined;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (/^(united states|usa|u\.s\.a\.?|u\.s\.?)$/i.test(part)) {
      country = "United States";
      continue;
    }
    const stateZip = part.match(
      /^([A-Za-z][A-Za-z .]+?)\s+(\d{5}(?:-\d{4})?)$/,
    );
    if (stateZip && (US_STATE_ABBREV[stateZip[1].toLowerCase()] || Object.values(US_STATE_ABBREV).some(
      (n) => n.toLowerCase() === stateZip[1].toLowerCase(),
    ))) {
      state = US_STATE_ABBREV[stateZip[1].toLowerCase()] ?? stateZip[1];
      postcode = stateZip[2];
      continue;
    }
    const abbrev = part.match(/^([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/);
    if (abbrev && US_STATE_ABBREV[abbrev[1].toLowerCase()]) {
      state = US_STATE_ABBREV[abbrev[1].toLowerCase()];
      if (abbrev[2]) postcode = abbrev[2];
      continue;
    }
    if (/^\d{5}(?:-\d{4})?$/.test(part)) {
      postcode = part;
      continue;
    }
    // Full state name alone.
    if (Object.values(US_STATE_ABBREV).some((n) => n.toLowerCase() === part.toLowerCase())) {
      state = part;
      continue;
    }
    if (!city) city = part;
  }

  if (!street || !city) return null;

  return {
    houseNumber,
    street,
    streetLine: `${houseNumber} ${street}`,
    streetLineFallback:
      streetNoDir && streetNoDir !== street ? `${houseNumber} ${streetNoDir}` : undefined,
    city,
    state,
    postcode,
    country: country ?? (state || postcode ? "United States" : undefined),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mapNominatimHits(hits: Record<string, unknown>[]): GeocodeHit[] {
  return hits.map((h) => {
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

function hitHasHouseNumber(hits: GeocodeHit[], houseNumber?: string): boolean {
  if (!houseNumber) return hits.length > 0;
  const want = String(Number(houseNumber) || houseNumber);
  return hits.some((h) => {
    if (!h.address) return false;
    return h.address
      .toLowerCase()
      .split(/\s+/)
      .some((tok) => /^\d+[a-z]?$/i.test(tok) && String(Number(tok) || tok) === want);
  });
}

/**
 * US Census Bureau geocoder — free, no key, excellent for US street addresses.
 *
 * Used when Nominatim free-form returns only the road (common for American
 * "449 S Orlando Ave, City, ST ZIP" strings). Coordinates come from TIGER;
 * the OSM link is a map pin at that point so the place still has a source URL.
 */
async function geocodeUsCensus(query: string): Promise<GeocodeHit[]> {
  const url =
    `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?` +
    new URLSearchParams({
      address: query,
      benchmark: "Public_AR_Current",
      format: "json",
    });
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`US Census geocoder HTTP ${res.status}`);
  const body = (await res.json()) as {
    result?: {
      addressMatches?: {
        matchedAddress?: string;
        coordinates?: { x?: number; y?: number };
        addressComponents?: {
          city?: string;
          state?: string;
          zip?: string;
          fromAddress?: string;
          streetName?: string;
          preDirection?: string;
          suffixType?: string;
        };
      }[];
    };
  };
  const matches = body.result?.addressMatches ?? [];
  return matches
    .filter((m) => Number.isFinite(m.coordinates?.x) && Number.isFinite(m.coordinates?.y))
    .map((m) => {
      const lat = Number(m.coordinates!.y);
      const lng = Number(m.coordinates!.x);
      const c = m.addressComponents ?? {};
      const road = [c.preDirection, c.streetName, c.suffixType].filter(Boolean).join(" ");
      // matchedAddress starts with the house number ("449 S ORLANDO AVE…");
      // fromAddress is only the TIGER range start and is the wrong number.
      const houseFromMatch = m.matchedAddress?.match(/^(\d+[A-Za-z]?)/)?.[1];
      const address = [road, houseFromMatch].filter(Boolean).join(" ") || undefined;
      return {
        lat,
        lng,
        address,
        city: c.city || undefined,
        country: "United States",
        countryCode: "us",
        osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`,
        display:
          m.matchedAddress ??
          `${[houseFromMatch, road].filter(Boolean).join(" ")}, ${c.city ?? ""}, ${c.state ?? ""} ${c.zip ?? ""}`.trim(),
      } satisfies GeocodeHit;
    });
}

/**
 * Identifying User-Agent for Nominatim's usage policy.
 *
 * Browsers forbid setting User-Agent from script, so the real browser UA is
 * what goes out there (and is fine). Node/scripts can and should identify us —
 * anonymous clients get 403 after a few bursts, which is how this address
 * lookup went dark during testing.
 */
const NOMINATIM_HEADERS: HeadersInit = {
  Accept: "application/json",
  "User-Agent": "CoffeeFinder/0.1 (https://github.com/davidegt7/coffee-finder)",
};

async function nominatimSearch(
  params: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?` +
    new URLSearchParams({ format: "json", limit: "5", addressdetails: "1", ...params });
  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>[];
}

/** Best-effort Nominatim call — rate-limits and 403s become empty, not fatal. */
async function nominatimSearchSoft(
  params: Record<string, string>,
): Promise<GeocodeHit[]> {
  try {
    return mapNominatimHits(await nominatimSearch(params));
  } catch (err) {
    console.warn("Coffee Finder geocode (Nominatim):", err);
    return [];
  }
}

export async function geocode(
  query: string,
  options: { country?: string; countryCode?: string; city?: string } = {},
): Promise<GeocodeHit[]> {
  let countryCode = options.countryCode?.trim().toLowerCase() || "";
  const countrySignal = [query, options.country].filter(Boolean).join(", ");
  if (looksLikeUsAddress(countrySignal)) countryCode = "us";

  const lookup = geocodeLookupQuery(query, countryCode);
  const location = [lookup, options.city, options.country]
    .filter((part, index, all): part is string => Boolean(part?.trim()) && all.indexOf(part) === index)
    .join(", ");

  const withCountry = (params: Record<string, string>) => {
    if (/^[a-z]{2}$/.test(countryCode)) params.countrycodes = countryCode;
    return params;
  };

  // --- 1. Structured Nominatim (best for US house numbers) ---
  const parsed =
    parseStreetAddress(location, countryCode) ?? parseStreetAddress(lookup, countryCode);
  let hits: GeocodeHit[] = [];
  if (parsed?.streetLine && parsed.city) {
    // The draft's explicit city beats a trailing neighbourhood in the search
    // box. "…, Wynwood" describes the area; the structured city is Miami.
    const structuredCity = options.city?.trim() || parsed.city;
    const structured: Record<string, string> = {
      street: parsed.streetLine,
      city: structuredCity,
    };
    if (parsed.state) structured.state = parsed.state;
    if (parsed.postcode) structured.postalcode = parsed.postcode;
    const structuredCountry =
      countryCode === "us" ? "United States" : (parsed.country ?? options.country?.trim());
    if (structuredCountry) structured.country = structuredCountry;
    hits = await nominatimSearchSoft(withCountry(structured));

    // Some US datasets omit the leading direction from their indexed street
    // name. Retry without it only when the precise query missed the building;
    // exactGeocodeHit still requires NW/NE/SW/SE to agree before auto-picking.
    if (
      parsed.streetLineFallback &&
      !hitHasHouseNumber(hits, parsed.houseNumber)
    ) {
      await sleep(1_100);
      hits = await nominatimSearchSoft(
        withCountry({ ...structured, street: parsed.streetLineFallback }),
      );
    }
  }

  // --- 2. Free-form Nominatim ---
  if (!hitHasHouseNumber(hits, parsed?.houseNumber)) {
    if (hits.length) await sleep(1_100);
    // A brain draft can contain a complete postal address in the source site's
    // language while its separate city/country fields have already been
    // localized for the editor ("New York, United States" versus
    // "Nueva York, Estados Unidos"). Appending both translations makes a valid
    // address impossible for Nominatim to parse. Prefer the constrained form,
    // then retry the address exactly as supplied when it returned nothing.
    let free = await nominatimSearchSoft(withCountry({ q: location }));
    if (!free.length && location !== lookup) {
      await sleep(1_100);
      free = await nominatimSearchSoft(withCountry({ q: lookup }));
    }
    // Prefer free-form only when structured found nothing; if structured had
    // house numbers keep it. Merge otherwise so the editor still has options.
    if (!hits.length) hits = free;
    else if (!hitHasHouseNumber(hits, parsed?.houseNumber) && free.length) {
      hits = [...hits, ...free];
    }
  }

  // --- 3. Drop a wrong countrycodes filter and retry free-form ---
  if (!hits.length && countryCode) {
    await sleep(1_100);
    hits = await nominatimSearchSoft({ q: lookup });
  }

  // --- 4. US Census — house pins Nominatim free-form misses, and a tie-break
  // when OSM has two "449 Orlando Avenue" nodes (N and S of the same road). ---
  const wantUs =
    countryCode === "us" ||
    looksLikeUsAddress(location) ||
    looksLikeUsAddress(lookup) ||
    options.country?.toLowerCase().includes("united states");
  const houseHits = parsed?.houseNumber
    ? hits.filter((h) => hitHasHouseNumber([h], parsed.houseNumber))
    : [];
  // Directional addresses ("S Orlando Ave") need Census even when Nominatim
  // already found the house number — OSM often has two 449s on the same road.
  const hasDirection = /\b(N|S|E|W|NE|NW|SE|SW|North|South|East|West)\b/i.test(query);
  const needCensus =
    wantUs &&
    (!hitHasHouseNumber(hits, parsed?.houseNumber) ||
      (hasDirection && houseHits.length > 1));

  if (needCensus) {
    try {
      // Prefer the original typed string — Census understands "S" and "FL"
      // natively and sometimes fails on our expanded "South"/"Florida" form.
      const censusQueries = [
        query,
        lookup,
        [lookup, options.city, options.country]
          .filter((part, index, all): part is string => Boolean(part?.trim()) && all.indexOf(part) === index)
          .join(", "),
      ].filter((q, i, all) => q.trim() && all.indexOf(q) === i);

      for (const censusQuery of censusQueries) {
        const census = await geocodeUsCensus(censusQuery);
        if (census.length) {
          // Census first so exactGeocodeHit can auto-pick a single directional pin.
          hits = [...census, ...hits];
          break;
        }
      }
    } catch (err) {
      // Census is a fallback; a down government API must not block Nominatim hits.
      console.warn("Coffee Finder geocode (Census):", err);
    }
  }

  // De-dupe by rounded coordinates so structured + free-form + census don't
  // stack three identical buttons in the editor.
  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = `${h.lat.toFixed(5)},${h.lng.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
