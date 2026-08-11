/**
 * Section + selected roaster in the address bar.
 *
 * Map and roasters are real, shareable pages. Cloudflare Pages' SPA fallback
 * serves index.html for both, while the selected record remains a query param
 * so opening and closing a sheet does not invent another route hierarchy.
 */

import type { AppSection } from "../types";

const SECTION_PARAM = "section";
const ROASTER_PARAM = "roaster";
const PLACE_PARAM = "place";

export function readSectionParam(): AppSection {
  const leaf = window.location.pathname.replace(/\/+$/, "").split("/").pop();
  if (leaf === "roasters") return "roasters";
  if (leaf === "map") return "cafes";
  // Old shared links keep working after the route migration.
  const raw = new URLSearchParams(window.location.search).get(SECTION_PARAM);
  return raw === "roasters" ? "roasters" : "cafes";
}

function sectionPath(section: AppSection): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/${section === "roasters" ? "roasters" : "map"}`.replace(/\/+/g, "/");
}

export function readRoasterParam(): string | null {
  return new URLSearchParams(window.location.search).get(ROASTER_PARAM);
}

export function roasterUrl(id: string): string {
  const url = new URL(window.location.href);
  url.pathname = sectionPath("roasters");
  url.searchParams.delete(SECTION_PARAM);
  url.searchParams.set(ROASTER_PARAM, id);
  url.searchParams.delete(PLACE_PARAM);
  return url.toString();
}

export function writeSectionParam(section: AppSection): void {
  const url = new URL(window.location.href);
  url.pathname = sectionPath(section);
  url.searchParams.delete(SECTION_PARAM);
  if (section === "cafes") url.searchParams.delete(ROASTER_PARAM);
  else url.searchParams.delete(PLACE_PARAM);
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
    url.pathname = sectionPath("roasters");
    url.searchParams.delete(SECTION_PARAM);
    url.searchParams.set(ROASTER_PARAM, id);
    url.searchParams.delete(PLACE_PARAM);
    window.history.pushState({ roaster: id }, "", url);
  } else {
    if (!url.searchParams.has(ROASTER_PARAM)) return;
    url.searchParams.delete(ROASTER_PARAM);
    window.history.replaceState({ roaster: null }, "", url);
  }
}
