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

export const PIN_BEAN = "pin-bean";
export const PIN_BEAN_VERIFIED = "pin-bean-verified";
/** Fire only — not bean+flame. Ids are distinct so MapLibre never reuses an old sprite. */
export const PIN_ROASTER = "pin-fire";
export const PIN_ROASTER_VERIFIED = "pin-fire-verified";

const PIN_IDS = [PIN_BEAN, PIN_BEAN_VERIFIED, PIN_ROASTER, PIN_ROASTER_VERIFIED] as const;

/** Which sprite a place should use. Roastery is the only category that gets a different mark. */
export function pinIdFor(category: Category, verified: boolean): string {
  if (category === "roastery") {
    return verified ? PIN_ROASTER_VERIFIED : PIN_ROASTER;
  }
  return verified ? PIN_BEAN_VERIFIED : PIN_BEAN;
}

function pinSvg(roaster: boolean, verified: boolean): string {
  const stroke = verified ? "#3f8a48" : "#a9682c";
  const strokeW = verified ? 3.5 : 2.75;

  // Roastery: fire alone, centered and large enough to read at pin size.
  if (roaster) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="29" fill="#fffaf4" stroke="${stroke}" stroke-width="${strokeW}"/>
  <path d="M32 14 C22 28 24 40 32 40 C40 40 42 28 32 14Z" fill="#e07a3a"/>
</svg>`;
  }

  // Everyone else: coffee bean.
  const bean = `
    <g transform="translate(32 34) rotate(-28)">
      <ellipse cx="0" cy="0" rx="11" ry="15.5" fill="#5c3318"/>
      <ellipse cx="-1.5" cy="-1" rx="9" ry="13.5" fill="#7a4522"/>
      <path d="M-1.5 -12.5
        C3 -6 3 6 -1.5 12.5"
        fill="none" stroke="#d4a574" stroke-width="1.6"
        stroke-linecap="round"/>
    </g>
  `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="29" fill="#fffaf4" stroke="${stroke}" stroke-width="${strokeW}"/>
  ${bean}
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
    { id: PIN_BEAN, roaster: false, verified: false },
    { id: PIN_BEAN_VERIFIED, roaster: false, verified: true },
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
