/**
 * Map pin images for MapLibre symbol layers.
 *
 * Drawn as SVG → HTMLImageElement rather than shipped PNGs so the pin art stays
 * in source control as readable paths, and we can mint verified / roaster
 * variants without a design export step. pixelRatio: 2 keeps them sharp on
 * retina without doubling layout size in the style.
 */

import type { Map as MapLibreMap } from "maplibre-gl";
import type { Category } from "../types";

export const PIN_CUP = "pin-cup-v2";
export const PIN_CUP_VERIFIED = "pin-cup-v2-verified";
/** Versioned ids prevent MapLibre from briefly reusing the old drop-shaped sprite. */
export const PIN_ROASTER = "pin-flame-v2";
export const PIN_ROASTER_VERIFIED = "pin-flame-v2-verified";

const PIN_IDS = [PIN_CUP, PIN_CUP_VERIFIED, PIN_ROASTER, PIN_ROASTER_VERIFIED] as const;

/** Which sprite a place should use. Roastery is the only category that gets a different mark. */
export function pinIdFor(category: Category, verified: boolean): string {
  if (category === "roastery") {
    return verified ? PIN_ROASTER_VERIFIED : PIN_ROASTER;
  }
  return verified ? PIN_CUP_VERIFIED : PIN_CUP;
}

function pinSvg(roaster: boolean, verified: boolean): string {
  const stroke = verified ? "#3f8a48" : "#a9682c";
  const strokeW = verified ? 3.5 : 2.75;

  // Roastery: an asymmetric outer flame plus a bright inner flame. The old
  // single-point path read as a water drop once reduced to map-pin size.
  if (roaster) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="29" fill="#fffaf4" stroke="${stroke}" stroke-width="${strokeW}"/>
  <path d="M35 12
    C35 20 43 23 44 33
    C45 43 39 50 31 50
    C22 50 17 44 18 35
    C19 28 25 25 26 17
    C31 21 32 26 31 31
    C36 27 38 21 35 12Z"
    fill="#d95f2b"/>
  <path d="M32 29
    C32 34 37 36 36 41
    C35 45 32 47 29 45
    C25 43 25 39 27 36
    C28 34 30 32 32 29Z"
    fill="#ffb13b"/>
</svg>`;
  }

  // Every customer-facing place: a proper cup with handle, coffee surface,
  // saucer and steam. It remains recognizable when the sprite is only 32px.
  const cup = `
    <path d="M19 27 H40 V36
      C40 43 36 47 29.5 47
      C23 47 19 43 19 36Z"
      fill="#6f3d20"/>
    <path d="M40 30 H44
      C50 30 50 39 44 40 H40"
      fill="none" stroke="#6f3d20" stroke-width="4"
      stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 28 H38" fill="none" stroke="#d49a61" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M17 49 H45" fill="none" stroke="#6f3d20" stroke-width="3" stroke-linecap="round"/>
    <path d="M25 23 C22 19 28 18 25 14" fill="none" stroke="#a9682c" stroke-width="2" stroke-linecap="round"/>
    <path d="M33 23 C30 19 36 18 33 14" fill="none" stroke="#a9682c" stroke-width="2" stroke-linecap="round"/>
  `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="29" fill="#fffaf4" stroke="${stroke}" stroke-width="${strokeW}"/>
  ${cup}
</svg>`;
}

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode map pin SVG"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * Register pin sprites on the map. Safe to call after every style load —
 * MapLibre drops custom images when the basemap style is swapped (light/dark).
 */
export async function ensureMapPins(map: MapLibreMap): Promise<void> {
  const specs: { id: (typeof PIN_IDS)[number]; roaster: boolean; verified: boolean }[] = [
    { id: PIN_CUP, roaster: false, verified: false },
    { id: PIN_CUP_VERIFIED, roaster: false, verified: true },
    { id: PIN_ROASTER, roaster: true, verified: false },
    { id: PIN_ROASTER_VERIFIED, roaster: true, verified: true },
  ];

  await Promise.all(
    specs.map(async ({ id, roaster, verified }) => {
      // Replace if present so art tweaks show without a full style rebuild.
      if (map.hasImage(id)) map.removeImage(id);
      const img = await svgToImage(pinSvg(roaster, verified));
      // pixelRatio 2: 128px art lays out as 64 CSS px — crisp on phones.
      map.addImage(id, img, { pixelRatio: 2 });
    }),
  );
}
