import type { DrinkStyle, FilterMethod, Place } from "../types";
import { placeHasItem } from "./items";

export const DRINK_STYLES: {
  id: DrinkStyle;
  icon: string;
  label: { es: string; en: string };
}[] = [
  { id: "espresso", icon: "☕", label: { es: "Espresso", en: "Espresso" } },
  { id: "filter", icon: "🫗", label: { es: "Café filtrado", en: "Filter coffee" } },
];

export const FILTER_METHODS: {
  id: FilterMethod;
  label: { es: string; en: string };
}[] = [
  { id: "v60", label: { es: "V60", en: "V60" } },
  { id: "chemex", label: { es: "Chemex", en: "Chemex" } },
  { id: "aeropress", label: { es: "Aeropress", en: "Aeropress" } },
  { id: "kalita", label: { es: "Kalita Wave", en: "Kalita Wave" } },
  { id: "origami", label: { es: "Origami", en: "Origami" } },
  { id: "batch-brew", label: { es: "Batch brew", en: "Batch brew" } },
  { id: "french-press", label: { es: "Prensa francesa", en: "French press" } },
  { id: "siphon", label: { es: "Sifón", en: "Siphon" } },
];

/**
 * New listings carry an explicit program. Older listings still work: their
 * detailed menu items are enough to infer the same answer until the team edits
 * them. This avoids making the new filter look empty on launch day.
 */
export function placeHasDrinkStyle(place: Place, style: DrinkStyle): boolean {
  if (place.drinkStyles?.includes(style)) return true;

  if (style === "espresso") {
    return ["espresso", "cortado", "flat-white", "cappuccino", "latte", "americano"].some(
      (item) => placeHasItem(place, item),
    );
  }

  return (
    Boolean(place.filterMethods?.length) ||
    place.flags.includes("filterMethods") ||
    ["filtrado", "aeropress"].some((item) => placeHasItem(place, item))
  );
}
