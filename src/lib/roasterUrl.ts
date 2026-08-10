/**
 * Section + selected roaster in the address bar.
 *
 * Same query-param strategy as places: static hosts (GitHub Pages) have no
 * server to resolve `/roasters/x`, so `?section=roasters&roaster=x` always
 * lands on index.html. Café place params are cleared when entering this
 * section so back never opens a café sheet over the roasters map.
 */

import type { AppSection } from "../types";

const SECTION_PARAM = "section";
const ROASTER_PARAM = "roaster";
const PLACE_PARAM = "place";

export function readSectionParam(): AppSection {
  const raw = new URLSearchParams(window.location.search).get(SECTION_PARAM);
  return raw === "roasters" ? "roasters" : "cafes";
}

export function readRoasterParam(): string | null {
  return new URLSearchParams(window.location.search).get(ROASTER_PARAM);
}

export function roasterUrl(id: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set(SECTION_PARAM, "roasters");
  url.searchParams.set(ROASTER_PARAM, id);
  url.searchParams.delete(PLACE_PARAM);
  return url.toString();
}

export function writeSectionParam(section: AppSection): void {
  const url = new URL(window.location.href);
  if (section === "cafes") {
    if (!url.searchParams.has(SECTION_PARAM) && !url.searchParams.has(ROASTER_PARAM)) return;
    url.searchParams.delete(SECTION_PARAM);
    url.searchParams.delete(ROASTER_PARAM);
    window.history.replaceState({ section }, "", url);
    return;
  }
  if (url.searchParams.get(SECTION_PARAM) === "roasters") return;
  url.searchParams.set(SECTION_PARAM, "roasters");
  url.searchParams.delete(PLACE_PARAM);
  window.history.pushState({ section }, "", url);
}

/**
 * Opening a roaster pushes (back closes it). Closing replaces.
 * Always keeps section=roasters while a roaster id is present.
 */
export function writeRoasterParam(id: string | null): void {
  const url = new URL(window.location.href);
  if (id) {
    if (url.searchParams.get(ROASTER_PARAM) === id) return;
    url.searchParams.set(SECTION_PARAM, "roasters");
    url.searchParams.set(ROASTER_PARAM, id);
    url.searchParams.delete(PLACE_PARAM);
    window.history.pushState({ roaster: id }, "", url);
  } else {
    if (!url.searchParams.has(ROASTER_PARAM)) return;
    url.searchParams.delete(ROASTER_PARAM);
    window.history.replaceState({ roaster: null }, "", url);
  }
}
