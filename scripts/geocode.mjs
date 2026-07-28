/**
 * Resolves a place name to real coordinates via Nominatim (OpenStreetMap's
 * geocoder — free, no key, no billing card).
 *
 * This exists so that nobody — human or model — ever hand-types a lat/lng into
 * places.json. An invented coordinate looks exactly like a real one in the file
 * and sends a person to the wrong street. Geocoding fails loudly instead: if
 * Nominatim can't find the place, that's a signal the listing is wrong, and the
 * place doesn't ship.
 *
 * Usage: node scripts/geocode.mjs "Bar Italia, Providencia"
 */

const UA = "VitalMap/0.1 (https://github.com/davidegt7/coffee-finder)";

// Santiago, Chile — bounded so we never geocode into Santiago de Compostela,
// Santiago de Cuba, or any of the other Santiagos that pollute every search.
const VIEWBOX = "-70.85,-33.65,-70.50,-33.30";

export async function geocode(query) {
  const url =
    `https://nominatim.openstreetmap.org/search?` +
    new URLSearchParams({
      q: `${query}, Santiago, Chile`,
      format: "json",
      limit: "3",
      viewbox: VIEWBOX,
      bounded: "1",
      addressdetails: "1",
    });

  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const hits = await res.json();
  if (!hits.length) return null;

  const hit = hits[0];
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    address: [hit.address?.road, hit.address?.house_number].filter(Boolean).join(" ") || undefined,
    comuna:
      hit.address?.city_district ||
      hit.address?.suburb ||
      hit.address?.town ||
      hit.address?.city ||
      undefined,
    osm: `https://www.openstreetmap.org/${hit.osm_type}/${hit.osm_id}`,
    display: hit.display_name,
  };
}

if (process.argv[2]) {
  const result = await geocode(process.argv.slice(2).join(" "));
  console.log(result ? JSON.stringify(result, null, 2) : "no match in Santiago, Chile");
}
