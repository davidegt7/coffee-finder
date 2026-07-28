/**
 * Browser-side geocoding via Nominatim, mirroring scripts/geocode.mjs.
 *
 * This exists so the admin form never offers a lat/lng text box. A typo'd
 * coordinate looks exactly like a real one in the database and sends a person
 * to the wrong street — the only defence is to never let a human type one.
 *
 * Bounded to Santiago, because "Quimey" alone resolves to an unrelated shop in
 * Conchalí, and "Francisco Bilbao 1181" lands in La Pintana ~17km south when no
 * house number matches. Both look perfectly plausible as numbers.
 */

export interface GeocodeHit {
  lat: number;
  lng: number;
  address?: string;
  comuna?: string;
  osm: string;
  display: string;
}

/** Santiago, Chile — keeps us out of Santiago de Compostela / de Cuba / del Estero. */
const VIEWBOX = "-70.85,-33.65,-70.50,-33.30";

export async function geocode(query: string): Promise<GeocodeHit[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?` +
    new URLSearchParams({
      q: `${query.trim()}, Santiago, Chile`,
      format: "json",
      limit: "5",
      viewbox: VIEWBOX,
      bounded: "1",
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
