/**
 * The selected place, mirrored into the address bar so it can be shared.
 *
 * A query parameter rather than a path segment (`?place=x`, not `/place/x`)
 * because GitHub Pages serves static files: `/coffee-finder/place/x` has no
 * file behind it, so opening or refreshing a shared link would 404. A query
 * string always resolves to index.html, on Pages and on any host we might move
 * to later.
 *
 * Other parameters are preserved rather than rebuilt — `?admin` is already in
 * use, and dropping it when someone opens a café would sign an editor out of
 * their own tools mid-session.
 */

const PARAM = "place";

export function readPlaceParam(): string | null {
  return new URLSearchParams(window.location.search).get(PARAM);
}

export function placeUrl(id: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM, id);
  return url.toString();
}

/**
 * Opening a café pushes, so the phone's back gesture closes it — that is what
 * back means to someone holding a phone. Closing replaces, so tapping in and
 * out of a list doesn't bury the page they arrived on under a pile of
 * identical entries.
 */
export function writePlaceParam(id: string | null): void {
  const url = new URL(window.location.href);
  if (id) {
    if (url.searchParams.get(PARAM) === id) return;
    url.searchParams.set(PARAM, id);
    window.history.pushState({ place: id }, "", url);
  } else {
    if (!url.searchParams.has(PARAM)) return;
    url.searchParams.delete(PARAM);
    window.history.replaceState({ place: null }, "", url);
  }
}
