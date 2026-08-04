/**
 * Where you are, and how far that is from a café.
 *
 * Geolocation fails in more ways than it succeeds, and every one of them needs
 * saying out loud. The map's existing locate button passes no error callback at
 * all, so a denied permission makes the button do nothing whatsoever — which
 * reads as a broken button rather than as a decision the person already made.
 */

export type NearStatus = "idle" | "locating" | "on" | "denied" | "unavailable" | "timeout";

export interface Coords {
  lat: number;
  lng: number;
}

/** Great-circle distance in km. Good to metres at city scale, which is all this needs. */
export function distanceKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "450 m" close up, "2,4 km" further out — nobody wants "0.45 km". */
export function formatDistance(km: number, lang: "es" | "en"): string {
  // Rounded BEFORE the comparison: 0.9996 km rounds to 1000, and "1000 m" is
  // not something anyone writes.
  const metres = Math.round(km * 1000);
  if (metres < 1000) return `${metres} m`;
  const n = km < 10 ? km.toFixed(1) : Math.round(km).toString();
  return `${lang === "es" ? n.replace(".", ",") : n} km`;
}

/**
 * Ask the browser where we are, distinguishing the failures.
 *
 * `enableHighAccuracy` is off on purpose: this sorts a list of cafés by
 * distance, and a GPS fix good to a few metres costs seconds and battery to
 * answer a question that a cell-tower fix already answers.
 */
export function getPosition(): Promise<{ coords?: Coords; status: NearStatus }> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve({ status: "unavailable" });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          status: "on",
        }),
      (err) =>
        resolve({
          status:
            err.code === err.PERMISSION_DENIED
              ? "denied"
              : err.code === err.TIMEOUT
                ? "timeout"
                : "unavailable",
        }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
